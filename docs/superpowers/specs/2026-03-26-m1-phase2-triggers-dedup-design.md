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
                └─ sync, silent (errors only)

Session End:    Claude Code Stop hook
                └─ memo process-queue --background
                └─ spawns child process, returns immediately

Next Capture:   memo capture --session=<text>
                └─ processQueue() runs before writePending()
                └─ clears stale pending before writing new entry
```

`--background` flag spawns a detached child process and returns immediately. Claude Code does not wait for it on shutdown.

Stop hook written by `memo install` into `.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [{ "command": "memo process-queue --background" }]
  }
}
```

### Two-Stage Dedup

Replaces the current `existingNames.has(candidate.name)` check.

**Stage 1 — no LLM, ~1ms per candidate**

| Condition                        | Action          |
| -------------------------------- | --------------- |
| Name exact match                 | SKIP            |
| Name + description Jaccard ≥ 0.8 | SKIP            |
| Jaccard 0.4–0.8                  | → `ambiguous[]` |
| Jaccard < 0.4                    | WRITE           |

**Stage 2 — LLM, only when `ambiguous[]` is non-empty**

All ambiguous pairs sent in a single batch call:

```
For each pair (candidate, existingMemory):
  respond with: DUPLICATE | KEEP_BOTH
```

- `DUPLICATE` → skip candidate
- `KEEP_BOTH` → write candidate as-is
- If no LLM client configured → all ambiguous treated as `KEEP_BOTH` (graceful degradation)

MERGE is explicitly out of scope.

## File Changes

| File                            | Change                                       |
| ------------------------------- | -------------------------------------------- |
| `src/commands/process-queue.ts` | New — CLI command handler                    |
| `src/core/dedup.ts`             | New — two-stage dedup logic                  |
| `src/core/queue-processor.ts`   | Replace name-match with `deduplicate()` call |
| `src/commands/install.ts`       | Add Stop hook to generated settings          |
| `src/cli.ts`                    | Register `process-queue` command             |

## Interface

```typescript
// src/core/dedup.ts
export async function deduplicate(
  candidates: PendingCandidate[],
  existing: MemoryFile[],
  llmClient?: LLMClient
): Promise<{ toWrite: PendingCandidate[]; toSkip: PendingCandidate[] }>;
```

```typescript
// Jaccard helper (internal)
function jaccard(a: string, b: string): number; // tokenise → set intersection / union
```

## Behaviour

- `memo process-queue` with no pending files: exits silently, zero output
- `memo process-queue` with pending files: processes and exits silently (errors to stderr)
- `memo process-queue --background`: spawns detached child, returns exit 0 immediately
- Stage 2 LLM call is one batch per `processQueue` run, not one per candidate
- If Stage 2 LLM call fails: log warning to stderr, treat all ambiguous as `KEEP_BOTH`

## Out of Scope

- Pattern detection / auto-promote to CLAUDE.md
- MERGE result from LLM
- Idle timer / OS cron
- Recurrence counting
