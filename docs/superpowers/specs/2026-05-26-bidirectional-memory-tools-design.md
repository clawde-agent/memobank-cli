# Bidirectional Memory Tools — Design Spec

**Date**: 2026-05-26  
**Status**: Approved  
**Scope**: Batch 1 — two independent improvements

---

## Overview

Two improvements that bring memobank closer to Letta-style active memory management, without MCP overhead:

1. **Improvement 3**: Bidirectional memory tools via Hook + CLI + Skill (replaces MCP)
2. **Improvement 5**: Session summaries as first-class memories

These are fully independent and can be implemented in parallel.

---

## Improvement 3: Bidirectional Memory Tools

### Problem

Current Claude Code integration is **one-directional**: memories are written post-session via Stop hook, and read passively via `autoMemory` reading MEMORY.md. Claude cannot query or write memories mid-session.

### Solution

Three new CLI commands + enhanced hooks + skill instructions. Claude uses the Bash tool to call these commands during reasoning — functionally equivalent to MCP tool calls, with zero token overhead from tool definitions.

### Why Not MCP

MCP injects tool definitions into every message (~500–1000 tokens/turn). The Bash tool achieves the same bidirectionality at zero baseline cost — tokens are only spent when Claude actually calls a command.

### New CLI Commands

#### ~~`memo query`~~ → use existing `memo search --format json`

`memo search` already implements lightweight search without writing MEMORY.md, and already supports `--format json`. No new command needed.

**Usage by Claude**:

```bash
memo search "LanceDB configuration" --format json
```

#### `memo instant-capture --name X --description Y --content Z [--type T] [--tags a,b]`

**File**: `src/commands/instant-capture.ts`  
**Purpose**: Synchronous write during a session when Claude learns something worth remembering.  
**Implementation**: Calls `writePending()` then immediately calls `processQueue()`. Runs secret sanitization before write (same as `capture`).  
**All arguments required**: `--name`, `--description`, `--content`  
**Defaults**: `--type lesson`, `--tags []`

**Usage by Claude**:

```bash
memo instant-capture \
  --name "lancedb-requires-node18" \
  --description "LanceDB bindings fail silently on Node 16" \
  --content "## Problem\n..." \
  --type lesson \
  --tags "lancedb,node"
```

#### `memo update --name X --content Y`

**File**: `src/commands/update-memory.ts`  
**Purpose**: Update the body of an existing memory when Claude finds it outdated.  
**Implementation**: Thin wrapper over `updateMemoryContent()` in `src/core/store.ts` (already exists).  
**Behavior**: Errors clearly if `--name` not found (no silent failure).

**Usage by Claude**:

```bash
memo update --name "lancedb-requires-node18" --content "## Problem\n(updated)..."
```

### Hook Changes (`src/platforms/claude-code.ts`)

Add a `UserPromptSubmit` hook alongside the existing Stop hook:

```json
"UserPromptSubmit": [
  {
    "matcher": "",
    "hooks": [{
      "type": "command",
      "command": "memo recall --hook-input --silent --top 3",
      "timeout": 10,
      "async": false
    }]
  }
]
```

**Flow**: User sends message → Claude Code pipes JSON `{"prompt":"..."}` to hook via stdin → `memo recall --hook-input` reads stdin, extracts `.prompt`, runs recall → MEMORY.md updated → Claude reads updated MEMORY.md via `autoMemory` before responding.

**Cross-platform**: stdin JSON parsing is handled inside the CLI (`recall.ts`), so the hook command is identical on Windows and Unix. No `jq` dependency. Pattern matches GSD's hook implementation (`gsd-prompt-guard.js`).

### Skill / CLAUDE.md Enhancement

Add three proactive-use patterns to the memobank skill or project CLAUDE.md:

```markdown
## Mid-Session Memory Operations

When you need context: `memo query "<topic>" --json --top 3`
When you learn something worth keeping: `memo instant-capture --name "<slug>" --description "<one-line>" --content "<markdown>"`
When a memory is outdated: `memo update --name "<slug>" --content "<updated markdown>"`
```

### Registration in `src/cli.ts`

Three new commands to register:

- `query <q>` with options `--top`, `--json`, `--repo`
- `instant-capture` with options `--name`, `--description`, `--content`, `--type`, `--tags`, `--repo`
- `update` with options `--name`, `--content`, `--repo`

### Testing

- `tests/query.test.ts`: search returns JSON; empty query errors; `--top` bounds enforced
- `tests/instant-capture.test.ts`: writes to `.pending/`, sanitizes secrets, dedup skips existing
- `tests/update-memory.test.ts`: updates content; errors on missing name
- `tests/claude-code.test.ts`: extend to verify UserPromptSubmit hook is added on install

---

## Improvement 5: Session Summaries as First-Class Memories

### Problem

Extracted memories from a session capture individual lessons/decisions, but there's no record of _what work was happening_ in that session. Starting a new session on the same task requires re-reading git history to restore context.

### Solution

After processing each session in `capture --auto`, generate a deterministic snapshot memory using git state + the list of extracted memories. No LLM required — always available.

### Memory Format

```yaml
---
name: session-2026-05-26-docs-skill-readme
type: workflow
description: "Session snapshot: docs/skill-readme-and-marketplace 2026-05-26"
tags: [session, docs-skill-readme-and-marketplace, 2026-05-26]
confidence: high
status: experimental
---
## Session
**Date**: 2026-05-26
**Branch**: docs/skill-readme-and-marketplace
**Last Commit**: a85f290 fix(onboarding): fix UX gaps

## Files Changed
M skills-lock.json

## Memories Extracted
- lesson: api-timeout-handling
- decision: use-text-engine-default

## Unfinished Work
M skills-lock.json (uncommitted changes present)
```

**Name pattern**: `session-<YYYY-MM-DD>-<branch-slug>` where branch-slug replaces `/` and `_` with `-`.  
**Dedup**: Same name = same day+branch. Queue processor's Jaccard dedup (threshold ≥ 0.8 on name+description) naturally skips re-runs on the same day.

### Implementation

**File to modify**: `src/commands/capture.ts` only.

New private function `generateSessionSummary()`:

```typescript
function generateSessionSummary(
  sessionId: string,
  branch: string,
  lastCommit: string,
  gitStatus: string,
  extractedNames: string[]
): PendingEntry;
```

Called at the end of each session's processing block, before `markSessionProcessed`. Writes via `writePending()` — summary is drained in the same `processQueue()` call at the end of the loop.

**Skip conditions**:

- `extractedNames.length === 0` AND `gitStatus === ''` → no-op (nothing happened)
- Branch name not available → use `'(detached HEAD)'`

### Testing

- `tests/capture.test.ts`: extend auto-mode tests to verify session summary is written to `.pending/` with correct name pattern and content fields

---

## Files Changed Summary

| File                                                      | Change                         | Improvement |
| --------------------------------------------------------- | ------------------------------ | ----------- |
| `src/commands/instant-capture.ts` → renamed `remember.ts` | New                            | 3           |
| `src/commands/update-memory.ts`                           | New                            | 3           |
| `src/cli.ts`                                              | Register 3 new commands        | 3           |
| `src/platforms/claude-code.ts`                            | Add UserPromptSubmit hook      | 3           |
| `src/commands/capture.ts`                                 | Add session summary generation | 5           |
| `tests/query.test.ts`                                     | New                            | 3           |
| `tests/instant-capture.test.ts`                           | New                            | 3           |
| `tests/update-memory.test.ts`                             | New                            | 3           |
| `tests/capture.test.ts`                                   | Extend auto-mode tests         | 5           |

**No changes to**: `src/core/store.ts`, `src/core/retriever.ts`, `src/core/queue-processor.ts` — existing logic is reused as-is.
