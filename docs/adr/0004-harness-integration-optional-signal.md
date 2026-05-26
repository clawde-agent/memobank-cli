# ADR 0004 — Harness integration is an optional enhancement signal, not a dependency

## Status

Accepted

## Context

memobank needs to integrate with GSD Redux (Harness) to improve Capture quality: when a session ends cleanly via `context-handover`, `.continue-here.md` is a higher-quality extraction source than raw transcript (structured, curated, noise-free).

The integration point is `.planning/STATE.md`, which contains a `session_status` field in its "Session Continuity" section:

- `session_status: idle` — `context-handover` ran successfully; `.continue-here.md` is trustworthy
- `session_status: in_progress` — session was interrupted; `.continue-here.md` may be stale

The question: should `memo capture --auto` **require** STATE.md, or treat it as optional?

## Decision

STATE.md is an **optional enhancement signal**. `memo capture --auto` uses the following decision tree:

```
.planning/STATE.md exists?
  No  → transcript extraction (primary path)
  Yes → parse "Session Continuity" section
          session_status: idle AND Resume file present?
            Yes → read .continue-here.md + transcript extraction
            No  → transcript extraction (in_progress, parse error, missing field)
```

Parse errors (malformed YAML, missing section, unreadable file) are silently ignored — fall back to transcript extraction without warning.

## Consequences

- memobank works in any repo without `.planning/` — zero setup required for non-GSD users.
- When Harness is present and session ended cleanly, Capture quality improves without user action.
- memobank makes no assumptions about how `session_status` gets written — it only reads the value.
- The integration is one-directional: memobank reads Harness files, never writes them.

## Alternatives considered

**Hard dependency on STATE.md**: `capture --auto` errors if `.planning/STATE.md` is missing. Rejected — breaks memobank for all non-GSD users and contradicts the independence principle established in the architecture.

**Always read `.continue-here.md` if present (ignore `session_status`)**: Risks using stale content from an interrupted session. `session_status: idle` is the correctness gate — only use `.continue-here.md` when the Harness explicitly marks the handover complete.
