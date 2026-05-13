# Code Symbol Index — Design Spec

**Date:** 2026-05-13  
**Branch:** feat/code-symbol-index  
**Status:** Approved for implementation

---

## 1. Problem

memobank currently stores session memories (lessons, decisions, workflows) but has no awareness of the codebase itself. `memo recall "authentication"` returns your notes but not the actual functions — leaving AI agents to re-discover code structure every session.

---

## 2. Solution

Add a **dual-track recall** system:

- **Track 1** (existing): memory files searched via text-engine or LanceDB
- **Track 2** (new): code symbols indexed via tree-sitter + SQLite FTS5

Both tracks run in parallel on `memo recall --code`. Results are score-normalized and merged. The code index lives in `.memobank/meta/code-index.db` (local only, not committed).

---

## 3. Architecture

```
memo recall "query" --code
        │
        ├── Track 1: Memory Retriever (existing)
        │     text-engine / lancedb-engine
        │     → RecallResult[]
        │
        └── Track 2: Code Index (new)
              SQLite FTS5 search
              → SymbolResult[]
                      │
              ResultMerger (score normalization)
                      │
              MEMORY.md injection
```

`memo scan [path]` populates Track 2. Must be run manually before `--code` works.

---

## 4. New Files

| File                        | Responsibility                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/core/code-scanner.ts`  | tree-sitter AST parse → `Symbol[]` + `Edge[]`. Language-agnostic orchestrator. No DB knowledge. |
| `src/engines/code-index.ts` | SQLite FTS5 read/write. `upsert()`, `search()`, `getRefs()`. No tree-sitter knowledge.          |
| `src/core/result-merger.ts` | Normalize two score streams to 0–1, merge and sort.                                             |

**Modified files:**

| File                    | Change                                                                      |
| ----------------------- | --------------------------------------------------------------------------- |
| `src/commands/scan.ts`  | Upgrade existing stub: orchestrate scanner → index → optional `--summarize` |
| `src/core/retriever.ts` | Add parallel code-index branch; merge via `result-merger`                   |
| `src/types.ts`          | Add `SymbolResult`, `CodeRecallOptions`                                     |

---

## 5. SQLite Schema

```sql
-- Symbol full-text search
CREATE VIRTUAL TABLE symbols USING fts5(
  name,        -- "findRepoRoot"
  kind,        -- fn | class | interface | type | const | method
  file,        -- "src/core/store.ts"
  start_line,  -- "42"
  end_line,    -- "67"
  signature,   -- "findRepoRoot(cwd: string, repoFlag?: string): string"
  docstring,   -- up to 3 lines of leading comment/JSDoc
  language     -- typescript | python | go | rust | yaml | csharp
);

-- Call graph edges (enables --refs / basic blast radius)
CREATE TABLE edges (
  caller_file TEXT NOT NULL,
  caller_name TEXT NOT NULL,
  callee_name TEXT NOT NULL,
  line        INTEGER
);
CREATE INDEX idx_edges_callee ON edges(callee_name);
CREATE INDEX idx_edges_caller ON edges(caller_name);

-- Incremental scan state
CREATE TABLE scan_meta (
  file     TEXT PRIMARY KEY,
  mtime    INTEGER,
  checksum TEXT
);
```

---

## 6. Language Support

Supported via `optionalDependencies` (installed with `--include=optional`):

| Language   | Extension(s)    | Grammar package          |
| ---------- | --------------- | ------------------------ |
| TypeScript | `.ts`, `.tsx`   | `tree-sitter-typescript` |
| JavaScript | `.js`, `.mjs`   | `tree-sitter-javascript` |
| Python     | `.py`           | `tree-sitter-python`     |
| Go         | `.go`           | `tree-sitter-go`         |
| Rust       | `.rs`           | `tree-sitter-rust`       |
| YAML       | `.yaml`, `.yml` | `tree-sitter-yaml`       |
| C#         | `.cs`           | `tree-sitter-c-sharp`    |

Language auto-detected from file extension. Unsupported extensions are skipped silently.

---

## 7. Recall Output Format

Symbol results injected into MEMORY.md use format B (path + signature + docstring):

```markdown
### [score: 0.84 | symbol] findRepoRoot

> Resolve memobank repo root by walking up from cwd
> `src/core/store.ts:42–67` · fn · typescript

---

findRepoRoot(cwd: string, repoFlag?: string): string
```

Max 3 lines of docstring. No full function body injected (token budget preserved).

---

## 8. Commands

### `memo scan [path] [options]`

| Option           | Description                                               |
| ---------------- | --------------------------------------------------------- |
| `[path]`         | Directory to scan (default: `process.cwd()`)              |
| `--summarize`    | After scan, write an `architecture` memory to memobank    |
| `--force`        | Re-index all files (ignore mtime cache)                   |
| `--langs <list>` | Comma-separated language filter, e.g. `typescript,python` |

### `memo recall <query> --code`

Enables dual-track recall. Requires prior `memo scan`. If code-index.db is missing, warns and falls back to memory-only recall.

### `memo recall --refs <symbol>`

Returns callers of a symbol from the edges table.

---

## 9. `--summarize` Architecture Memory

When `memo scan --summarize` runs, it generates and writes one memory file:

```yaml
---
name: project-architecture-snapshot
type: architecture
status: active
tags: [architecture, codebase, auto-generated]
created: <date>
---
Entry points: src/cli.ts
Core modules: store, retriever, lifecycle-manager, code-scanner, code-index
Engines: text-engine (default, zero-deps), lancedb-engine (optional, vector)
Platform adapters: claude-code, cursor, codex, gemini, qwen
Languages indexed: typescript (73 files), javascript (23 files)
Symbols: 247 functions, 18 classes, 31 interfaces
```

Content derived purely from static AST + file counts. No git history. Overwrites previous snapshot on re-scan.

---

## 10. Dependencies

Added to `optionalDependencies`:

```json
{
  "better-sqlite3": "^9.x",
  "tree-sitter": "^0.21.x",
  "tree-sitter-typescript": "^0.21.x",
  "tree-sitter-javascript": "^0.21.x",
  "tree-sitter-python": "^0.21.x",
  "tree-sitter-go": "^0.21.x",
  "tree-sitter-rust": "^0.21.x",
  "tree-sitter-yaml": "^0.6.x",
  "tree-sitter-c-sharp": "^0.21.x"
}
```

At runtime, `scan.ts` checks for `better-sqlite3` and `tree-sitter`. If missing, prints:

```
memo scan requires optional dependencies. Run:
  npm install memobank-cli --include=optional
```

Core `memo recall`, `memo write`, `memo capture` are unaffected.

---

## 11. What Is Not In Scope

- Git history / churn analysis (static AST only)
- Full PageRank graph ranking (degree centrality from edge count is sufficient)
- LLM-based symbol classification (tree-sitter grammar handles this)
- Apache Arrow data exchange layer
- 6-type LLM memory taxonomy (Profile/Preferences/Entities etc.)
- Auto-indexing on file save (manual `memo scan` only)
