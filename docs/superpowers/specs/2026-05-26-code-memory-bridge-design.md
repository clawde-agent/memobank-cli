# Code-Memory Bridge — Design Spec (Revised)

**Date**: 2026-05-26 (revised after codebase audit)
**Status**: Approved
**Depends on**: Batch 1 spec (`2026-05-26-bidirectional-memory-tools-design.md`)

---

## Audit Finding: Infrastructure Already Exists

Before audit, the assumption was "code-memory bridge needs to be built." After reading the code,
the infrastructure is largely **already there**:

| Component                                                          | State                                   |
| ------------------------------------------------------------------ | --------------------------------------- |
| `memory_symbol_refs` junction table (`memory_path`, `symbol_hash`) | ✅ exists, populated                    |
| `CodeIndex.linkMemory(path, description)`                          | ✅ exists, called by `writeMemory`      |
| `CodeIndex.getLinkedMemories(query)`                               | ✅ exists, called by `retriever.recall` |
| `graphScores` boost in `recall-ranker.ts`                          | ✅ exists, wired up                     |
| `codeRefs?: string[]` field on `MemoryFile`                        | ✅ exists in `types.ts`                 |
| `codeRefs` written to frontmatter in `writeMemory`                 | ✅ exists in `store.ts:63`              |
| `codeRefs` read back by `memory-loader.ts`                         | ✅ exists                               |
| `memo write` sets `codeRefs = [symbol.hash]`                       | ✅ exists in `write.ts:183`             |

**The problem is not missing infrastructure — it is 4 specific bugs that break the connection
for the common path (`capture --auto`).**

---

## Root Cause

**`capture --auto` is the main ingestion path (99% of memories), and it never participates
in code linking.**

`PendingCandidate` has no `codeRefs` field. The LLM extraction prompt never asks for code
references. So all auto-captured memories arrive at `writeMemory` with `codeRefs = undefined`,
forcing `linkMemory` to fall back to heuristic FTS on a one-line description — which produces
noisy, unreliable results.

---

## Bug Analysis

### Bug #1 (Root cause): `capture --auto` produces no `codeRefs`

**Location**: `src/types.ts` (`PendingCandidate`), `src/core/smart-extractor.ts`

`PendingCandidate` is missing `codeRefs?: string[]`. The LLM extraction prompt in
`smart-extractor.ts` has no instruction to identify code references. All auto-captured memories
enter `writeMemory` without explicit symbol links.

### Bug #2: `writeMemory` ignores `codeRefs` when calling `linkMemory`

**Location**: `src/core/store.ts:81`

```typescript
// current — always uses description FTS, ignores codeRefs
idx.linkMemory(path.relative(repoRoot, filePath), memory.description);
```

Even when `memory.codeRefs` is populated (e.g., from `memo write`), `writeMemory` ignores it
and runs FTS on the one-line description. The explicit refs are written to frontmatter but never
used to build `memory_symbol_refs`.

### Bug #3: `codeRefs` stores symbol hashes, not human-readable paths

**Location**: `src/commands/write.ts:183`

```typescript
memoryData.codeRefs = [syms[0].symbol.hash]; // e.g. "a3f9c2d8..."
```

Frontmatter contains opaque hashes. A human or agent reading the memory file cannot tell which
code it refers to without querying the DB.

### Bug #4: Two parallel mechanisms, mutually unaware

`memory_symbol_refs` (via `linkMemory`) and `memory_edges` (`mentions` edges via
`buildMemoryGraph`) both attempt code-memory association but never share data.
`graphExpand` reads only `memory_edges`; `getLinkedMemories` reads only `memory_symbol_refs`.
Recall quality depends on which path fired correctly.

---

## Fix Plan (ordered by impact)

### P0 — Add `codeRefs` to `capture --auto` pipeline

**Goal**: make `capture --auto` produce explicit code references alongside extracted memories.

**1. Widen `PendingCandidate`** (`src/types.ts`):

```typescript
export interface PendingCandidate {
  name: string;
  type: MemoryType;
  description: string;
  tags: string[];
  confidence: Confidence;
  content: string;
  codeRefs?: string[]; // ← add
}
```

Also add to `ExtractionResult` in `types.ts`.

**2. Update LLM extraction prompt** (`src/core/smart-extractor.ts`):

Add to the extraction instruction:

```
For each memory, if the session text mentions specific files or functions, include them as
code_refs. Format: "src/path/to/file.ts" or "src/path/to/file.ts::functionName".
Only include refs you are confident about. Omit if uncertain.
```

**3. Thread `codeRefs` through queue-processor** (`src/core/queue-processor.ts`):

`toWrite` candidates already flow from `deduplicate()` into `writeMemory()`. Add `codeRefs`
pass-through: `candidate.codeRefs` → `writeMemory({ ..., codeRefs: candidate.codeRefs })`.

**Files**: `src/types.ts`, `src/core/smart-extractor.ts`, `src/core/queue-processor.ts`

---

### P1 — Fix `writeMemory` to use `codeRefs` directly

**Goal**: when `codeRefs` is present, write `memory_symbol_refs` from it instead of running
heuristic FTS.

**Location**: `src/core/store.ts:68-88`

```typescript
// replace the current linkMemory call with:
if (memory.codeRefs && memory.codeRefs.length > 0) {
  // explicit refs: resolve file::symbol → symbol hash → write memory_symbol_refs directly
  idx.linkMemoryByRefs(path.relative(repoRoot, filePath), memory.codeRefs);
} else {
  // fallback: heuristic FTS on description (existing behaviour)
  idx.linkMemory(path.relative(repoRoot, filePath), memory.description);
}
```

**New method** `CodeIndex.linkMemoryByRefs(memPath, refs)` (`src/engines/code-index.ts`):

- Parse each ref: `"src/core/store.ts::writePending"` → file path + optional symbol name
- Query `symbols JOIN files` by file path (and name if `::symbol` present) → get `hash`
- Write to `memory_symbol_refs`

**Files**: `src/core/store.ts`, `src/engines/code-index.ts`

---

### P2 — Change `codeRefs` format from hash to `file::symbol` path

**Goal**: make `codeRefs` in frontmatter human-readable and stable across DB rebuilds.

**Location**: `src/commands/write.ts:183`

```typescript
// current
memoryData.codeRefs = [syms[0].symbol.hash];

// replace with
memoryData.codeRefs = [
  syms[0].symbol.file + (syms[0].symbol.name ? `::${syms[0].symbol.name}` : ''),
];
```

`CodeIndex.linkMemoryByRefs` (added in P1) already resolves `file::symbol` → hash, so the
DB linkage still works. Frontmatter becomes `codeRefs: [src/core/store.ts::writePending]`.

**Files**: `src/commands/write.ts`

---

### P3 — Show `codeRefs` inline in recall output

**Goal**: surface "which code does this memory reference" in `memo recall` results.

**Location**: `src/core/retriever.ts` → `writeRecallResults`

Add beneath each memory result:

```markdown
## decision: writePending-async-queue

Body...

📎 `src/core/store.ts::writePending` · `src/core/queue-processor.ts::processQueue`
```

Only render if `memory.codeRefs` is non-empty. No DB call needed — read directly from
loaded `MemoryFile.codeRefs`.

**Files**: `src/core/retriever.ts`

---

### P4 — `memo code-context <file-or-symbol>`

**Goal**: reverse lookup — given a file or symbol, find all memories that reference it.

**New command** `src/commands/code-context.ts`:

- If argument looks like a file path: query `symbols JOIN files WHERE f.path LIKE ?`,
  then join `memory_symbol_refs` on `symbol_hash`
- If argument looks like a symbol name: query `symbols WHERE name = ?`,
  then join `memory_symbol_refs`
- Load and display matched memories

```bash
$ memo code-context src/core/store.ts
→ decision: writePending-async-queue  (direct ref)
→ lesson: pending-dir-race-condition  (via call graph, depth 1)

$ memo code-context writePending
→ decision: writePending-async-queue  (direct ref)
```

**Files**: `src/commands/code-context.ts` (new), `src/cli.ts`

---

### P5 (optional) — Unify `memory_edges` and `memory_symbol_refs`

**Goal**: `graphExpand` also traverses `memory_symbol_refs` so both mechanisms benefit each other.

Currently `graphExpand` reads only `memory_edges`; `getLinkedMemories` reads only
`memory_symbol_refs`. After P0-P1, `memory_symbol_refs` becomes the high-quality source.

Add a post-step in `graphExpand`: for each returned memory, find its `codeRefs` → look up
neighbouring memories in `memory_symbol_refs` that share any symbol hash → include as depth-3
expansion candidates.

Low priority — P0-P3 already close the main gap.

**Files**: `src/engines/memory-graph.ts`

---

## Files Changed Summary

| File                           | Change                                                    | Priority |
| ------------------------------ | --------------------------------------------------------- | -------- |
| `src/types.ts`                 | Add `codeRefs?` to `PendingCandidate`, `ExtractionResult` | P0       |
| `src/core/smart-extractor.ts`  | Extraction prompt: add `code_refs` instruction            | P0       |
| `src/core/queue-processor.ts`  | Thread `codeRefs` through to `writeMemory`                | P0       |
| `src/core/store.ts`            | Branch on `codeRefs` presence in `writeMemory`            | P1       |
| `src/engines/code-index.ts`    | Add `linkMemoryByRefs(path, refs)` method                 | P1       |
| `src/commands/write.ts`        | Change `codeRefs` format to `file::symbol`                | P2       |
| `src/core/retriever.ts`        | Render `codeRefs` inline in recall output                 | P3       |
| `src/commands/code-context.ts` | New reverse-lookup command                                | P4       |
| `src/cli.ts`                   | Register `code-context`                                   | P4       |
| `src/engines/memory-graph.ts`  | `graphExpand` reads `memory_symbol_refs`                  | P5       |

**No changes to**: `memory_edges` schema, `memory_symbol_refs` schema, `getLinkedMemories`,
`graphScores` ranker — all already correct.

---

## What Was Removed from Previous Spec Version

The previous version proposed building these from scratch. All already exist:

- ~~`memory_symbol_refs` junction table~~ → exists
- ~~`CodeIndex.linkMemory` / `getLinkedMemories`~~ → exist
- ~~`codeRefs` frontmatter field~~ → exists
- ~~`graphScores` boost in ranker~~ → exists

The real work is **fixing the capture pipeline (P0) and the write path (P1)** — not infrastructure.
