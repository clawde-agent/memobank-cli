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

4 tables. Inspired by roam-code's schema but scoped to KISS+SOTA principles.

```sql
-- 1. Files — anchor for CASCADE deletes, incremental scan state
CREATE TABLE files (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  path     TEXT NOT NULL UNIQUE,  -- relative to scanned root
  language TEXT,                  -- typescript | python | go | rust | yaml | csharp
  hash     TEXT,                  -- SHA256 of file content (incremental skip)
  mtime    REAL                   -- file mtime (fast pre-check before hashing)
);
CREATE INDEX idx_files_path ON files(path);

-- 2. Symbols — structured data with FK cascade
CREATE TABLE symbols (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id        INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  qualified_name TEXT,           -- "ClassName.methodName" (disambiguates overloads)
  kind           TEXT NOT NULL,  -- fn | class | interface | type | const | method
  signature      TEXT,           -- full signature line
  docstring      TEXT,           -- up to 3 lines of leading comment/JSDoc
  line_start     INTEGER,
  line_end       INTEGER,
  is_exported    INTEGER DEFAULT 1,
  parent_id      INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
  memory_refs    TEXT            -- comma-separated memobank memory filenames (SOTA bridge)
);
CREATE INDEX idx_symbols_file   ON symbols(file_id);
CREATE INDEX idx_symbols_name   ON symbols(name);
CREATE INDEX idx_symbols_qname  ON symbols(qualified_name);
CREATE INDEX idx_symbols_kind   ON symbols(kind);

-- 3. FTS5 content table — full-text search over symbols (mirrors row 2)
--    Uses content= so no data is duplicated; triggers keep it in sync.
CREATE VIRTUAL TABLE symbols_fts USING fts5(
  name, qualified_name, signature, docstring,
  content='symbols',
  content_rowid='id'
);

-- Triggers to keep FTS5 mirror in sync with symbols table
CREATE TRIGGER symbols_ai AFTER INSERT ON symbols BEGIN
  INSERT INTO symbols_fts(rowid, name, qualified_name, signature, docstring)
  VALUES (new.id, new.name, new.qualified_name, new.signature, new.docstring);
END;
CREATE TRIGGER symbols_ad AFTER DELETE ON symbols BEGIN
  INSERT INTO symbols_fts(symbols_fts, rowid, name, qualified_name, signature, docstring)
  VALUES ('delete', old.id, old.name, old.qualified_name, old.signature, old.docstring);
END;
CREATE TRIGGER symbols_au AFTER UPDATE ON symbols BEGIN
  INSERT INTO symbols_fts(symbols_fts, rowid, name, qualified_name, signature, docstring)
  VALUES ('delete', old.id, old.name, old.qualified_name, old.signature, old.docstring);
  INSERT INTO symbols_fts(rowid, name, qualified_name, signature, docstring)
  VALUES (new.id, new.name, new.qualified_name, new.signature, new.docstring);
END;

-- 4. Edges — call graph (enables --refs)
CREATE TABLE edges (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id   INTEGER NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  target_id   INTEGER REFERENCES symbols(id) ON DELETE SET NULL,  -- null if unresolved
  target_name TEXT NOT NULL,  -- preserved for unresolved cross-file calls
  kind        TEXT NOT NULL DEFAULT 'calls',  -- calls | imports | inherits
  line        INTEGER
);
CREATE INDEX idx_edges_source      ON edges(source_id);
CREATE INDEX idx_edges_target      ON edges(target_id);
CREATE INDEX idx_edges_target_name ON edges(target_name);
```

**Design decisions (vs roam):**

- `files` table is separate — enables `ON DELETE CASCADE` so rescanning a file atomically removes all its stale symbols/edges
- FTS5 uses `content=` mode with triggers — no data duplication, stays in sync automatically
- `symbols.memory_refs` bridges code symbols to memobank memory files — unique to memobank, roam has no equivalent
- `symbols.qualified_name` resolves same-name symbols across files (`store.findRepoRoot` vs `utils.findRepoRoot`)
- `edges.target_id` nullable — cross-file calls may not resolve at parse time; `target_name` is always set

**Deferred to v2:** `file_edges` (file-level dependency graph), `graph_metrics` (PageRank), `symbol_metrics` (complexity scores)

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
