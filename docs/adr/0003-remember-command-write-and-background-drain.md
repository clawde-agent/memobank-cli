# ADR 0003 — `memo remember`: write-only with background drain and time-window dedup

## Status

Accepted

## Context

`memo remember` (formerly `instant-capture`) lets an AI agent Memorize structured knowledge mid-session by calling the CLI via Bash. Two concerns arose during design:

1. **Performance**: if `remember` calls `processQueue()` synchronously, every invocation spins up Node.js + scans all existing memories for dedup + writes files. The Bash tool call blocks Claude's reasoning until this completes.
2. **Duplicate suppression**: Claude may call `remember` multiple times in rapid succession with overlapping content (e.g., in a loop or when restating the same decision).

## Decision

`memo remember` uses a **write-and-return** pattern:

1. **Time-window dedup**: scan `.pending/` for any entry with the same `name` written within the last 60 seconds. If found, exit immediately (no write, no error).
2. **Write only**: write the candidate to `.pending/<id>.json` and return. Do not call `processQueue()`.
3. **Background drain**: spawn `memo process-queue --background` (detached child process, already implemented). CLI exits before drain completes.
4. **Stop hook drain**: `memo capture --auto` at session end calls `processQueue()` synchronously as the final catch-all.

## Consequences

- `memo remember` exits in milliseconds regardless of memory store size.
- Memories written via `remember` become queryable within seconds (background drain), not instantly. A `memo query` call immediately after `remember` may miss the just-written entry by 1–3 seconds.
- The 60-second time-window dedup is filesystem-based (reads `.pending/` timestamps) — no shared memory required between processes.
- Jaccard semantic dedup in `processQueue` remains the authoritative dedup layer; the time-window check is a fast pre-filter only.

## Alternatives considered

**Synchronous processQueue on every call**: guarantees immediate queryability but blocks Claude for 200–800ms per call and degrades with memory store size.

**No dedup, rely on Jaccard only**: Jaccard runs at drain time, not at write time. Rapid duplicate calls would each write a `.pending/` file; all but one get skipped at drain, but the extra writes and file scans still cost time.
