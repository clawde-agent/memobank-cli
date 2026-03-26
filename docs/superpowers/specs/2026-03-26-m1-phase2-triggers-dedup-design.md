# M1 Phase 2: Triggers + Smart Dedup — Design Spec

## Goal

Add active and passive triggers for `processQueue`, and replace Phase 1's name-exact-match dedup with two-stage semantic deduplication.

## Context

Phase 1 shipped a synchronous pending queue: `memo capture` writes `.pending/*.json` and immediately drains via `processQueue()`. Phase 2 adds:

1. A `memo process-queue` CLI command (manual/active trigger)
2. A Claude Code `Stop` hook (passive trigger, background)
3. Next Capture as safety-net fallback (already exists, no change needed)
4. Two-stage dedup inside `processQueue`

## Architecture

### Trigger Layer

Three paths all call the same `processQueue(memoBankDir)`:

```
Manual:         memo process-queue
                └─ sync, silent (errors only), exit 0 on success / exit 1 on error

Session End:    Claude Code Stop hook
                └─ memo process-queue --background
                └─ spawns detached child process, returns exit 0 immediately

Next Capture:   memo capture --session=<text>
                └─ processQueue() runs before writePending()
                └─ clears stale pending before writing new entry
```

**`--background` implementation** — cross-platform:

```typescript
const child = spawn(process.execPath, [cliPath, 'process-queue'], {
  detached: true,
  stdio: 'ignore',
});
child.unref(); // required on both Unix and Windows to detach from parent
```

Claude Code does not wait for this process on shutdown.

Stop hook written by `installClaudeCode()` in `src/platforms/claude-code.ts` into `.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [{ "command": "memo process-queue --background" }]
  }
}
```

`installClaudeCode()` in `src/platforms/claude-code.ts` is modified to write the Stop hook into `.claude/settings.json`, merging with any existing hooks array rather than overwriting. (Current code removes old `memo capture` hooks but does not yet add the new hook — this is the change.)

### Two-Stage Dedup

Replaces the current `existingNames.has(candidate.name)` check.

**Stage 1 — no LLM, ~1ms per candidate**

| Condition                           | Action          |
| ----------------------------------- | --------------- |
| Name exact match                    | SKIP            |
| Name + description Jaccard `>= 0.8` | SKIP            |
| Jaccard `>= 0.4` and `< 0.8`        | → `ambiguous[]` |
| Jaccard `< 0.4`                     | WRITE           |

Tokenisation: lowercase, strip punctuation, split on whitespace — same rules as `TextEngine.tokenize()` (private method, not called directly). `dedup.ts` implements its own identical 3-line helper; this is acceptable duplication given the trivial size.

**Stage 2 — LLM, only when `ambiguous[]` is non-empty**

All ambiguous pairs sent in a single batch call via the same LLM function used by `memo capture` (passed in as an optional callback — no new `LLMClient` type needed):

```typescript
type DedupLLM = (
  pairs: Array<{ candidate: PendingCandidate; existing: MemoryFile }>
) => Promise<Array<'DUPLICATE' | 'KEEP_BOTH'>>;
```

- `DUPLICATE` → skip candidate
- `KEEP_BOTH` → write candidate as-is
- If `llm` not provided → all ambiguous treated as `KEEP_BOTH` (graceful degradation, zero LLM cost)
- If LLM call throws → log warning to stderr, treat all ambiguous as `KEEP_BOTH`; Stage 1 writes are unaffected

MERGE is explicitly out of scope.

## File Changes

| File                            | Change                                       |
| ------------------------------- | -------------------------------------------- |
| `src/commands/process-queue.ts` | New — CLI command handler                    |
| `src/core/dedup.ts`             | New — two-stage dedup logic                  |
| `src/core/queue-processor.ts`   | Replace name-match with `deduplicate()` call |
| `src/platforms/claude-code.ts`  | Merge Stop hook into `installClaudeCode()`   |
| `src/cli.ts`                    | Register `process-queue` command             |

## Interface

```typescript
// src/core/dedup.ts
export async function deduplicate(
  candidates: PendingCandidate[],
  existing: MemoryFile[],
  llm?: DedupLLM
): Promise<{ toWrite: PendingCandidate[]; toSkip: PendingCandidate[] }>;

type DedupLLM = (
  pairs: Array<{ candidate: PendingCandidate; existing: MemoryFile }>
) => Promise<Array<'DUPLICATE' | 'KEEP_BOTH'>>;

// internal
function jaccard(a: string, b: string): number; // tokenise both → set intersection / union
```

## Behaviour

- `memo process-queue` with no pending files: exits silently, exit 0
- `memo process-queue` with pending files: processes silently (errors to stderr), exit 0 on success / exit 1 on error
- `memo process-queue --background`: spawns detached child via `spawn` + `unref()`, returns exit 0 immediately
- Stage 2 LLM call: one batch per `processQueue` run, not one per candidate
- Stage 2 failure: all ambiguous written as `KEEP_BOTH`; Stage 1 decisions (WRITE / SKIP) are unaffected

## Out of Scope

- Pattern detection / auto-promote to CLAUDE.md
- MERGE result from LLM
- Idle timer / OS cron
- Recurrence counting
