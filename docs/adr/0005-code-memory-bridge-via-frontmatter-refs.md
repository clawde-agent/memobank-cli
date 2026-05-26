# ADR 0005 — Code-memory bridge via frontmatter `code_refs` and existing `memory_refs` column

## Status

Accepted

## Context

A codebase audit revealed that the code-memory bridge infrastructure **already exists**:
`memory_symbol_refs` junction table, `CodeIndex.linkMemory()`, `CodeIndex.getLinkedMemories()`,
`codeRefs` field on `MemoryFile`, and `graphScores` boost in `recall-ranker` are all implemented
and wired together.

The disconnection has a single root cause: **`capture --auto` (the main ingestion path) never
produces `codeRefs`**. `PendingCandidate` has no `codeRefs` field, the LLM extraction prompt
never asks for code references, and `writeMemory` falls back to heuristic FTS on a one-line
description — which is too short to produce reliable symbol matches.

A secondary issue: `writeMemory` ignores `memory.codeRefs` when present (e.g. from `memo write`)
and always runs FTS on description, so even the interactive write path underperforms.

## Decision

Fix the four specific bugs rather than replace the architecture:

1. **P0**: Add `codeRefs?: string[]` to `PendingCandidate` and `ExtractionResult`; update the
   LLM extraction prompt to identify `file::symbol` references; thread `codeRefs` through
   `queue-processor` to `writeMemory`.

2. **P1**: In `writeMemory` (`store.ts`), branch on `codeRefs` presence: if set, call new
   `CodeIndex.linkMemoryByRefs(path, refs)` which resolves `file::symbol` → hash → writes
   `memory_symbol_refs` directly. Fall back to FTS only when `codeRefs` is absent.

3. **P2**: Change `codeRefs` format from opaque symbol hash (`a3f9c2`) to human-readable
   `file/path.ts::symbolName`. `linkMemoryByRefs` resolves to hash internally.

4. **P3/P4**: Surface in output — render `codeRefs` inline in recall, add `memo code-context`
   reverse lookup command.

### `code_refs` format

`src/path/to/file.ts` (file-level) or `src/path/to/file.ts::symbolName` (split on `::`).

## Consequences

- No schema changes — `memory_symbol_refs`, `memory_edges`, `graphScores` ranker all unchanged.
- `capture --auto` becomes the primary producer of code refs (via LLM extraction).
- `memo remember --code-refs` (from Batch 1 spec) provides agent-explicit override.
- FTS fallback preserved for memories with no explicit refs.
- `memo code-context` exposes the already-implemented `getLinkedMemories` traversal as a CLI.

## Alternatives considered

**Replace `memory_symbol_refs` with `memory_edges` `memory→symbol` edges**: requires SQLite
`CHECK` constraint migration. Rejected — `memory_symbol_refs` was purpose-built for this and
already has the correct indices.

**Embedding-based code-memory matching**: high quality but requires LanceDB. Rejected as
primary mechanism — `code_refs` + FTS fallback works with the zero-dependency text engine.
