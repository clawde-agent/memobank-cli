# Spec: Code-Memory Graph & Self-Iterating Skills

**Date:** 2026-05-19
**Status:** Draft v3
**Scope:** memobank-cli + memobank-skill

---

## 1. Problem

memobank's recall is single-dimensional: a query returns ranked memories or ranked code symbols, but the two streams are not structurally connected. A memory about `processQueue` and the symbol `processQueue` have no explicit edge between them. Likewise, memories have no edges to each other beyond tag co-occurrence — there is no `related_to` or `contradicts` relationship.

The self-improvement loop (`memo study` → CLAUDE.md) exists but is entirely manual. Nothing signals when a lesson has earned promotion, and nothing tracks when the skill's own recall protocol is failing.

---

## 2. Goals

1. Connect code symbols and memories in a traversable graph stored in the existing SQLite `code-index.db`
2. Make `memo recall --code` traverse the graph (depth ≤ 2) instead of merging two independent ranked lists
3. Automate the CLAUDE.md promotion signal without removing human confirmation
4. Track recall failures and surface SKILL.md improvement suggestions on demand

---

## 3. Non-Goals

- No new database dependency (Neo4j, DGraph, etc.) — SQLite only
- No real-time per-message extraction (Mem0 pattern) — Stop hook batch architecture unchanged
- No entity/relationship graph (Zep pattern) — code-domain graph only
- No automatic SKILL.md edits — suggestions output only, human confirms
- No automatic CLAUDE.md injection — signal only, human runs `memo study <name>`
- No `supersedes` edges — when dedup rejects a duplicate, no node is written, so no valid edge source exists (YAGNI)

---

## 4. Design Principles Applied

- **DRY**: All edge sources reuse existing modules (`embedding.ts`, `dedup.ts`, FTS5 from `code-index.ts`, `lifecycle-manager.ts` access logs). `memory_nodes` is a separate table from `symbols` because they have different schemas: symbols carry AST-level fields (kind, signature, line, PR score); memory nodes carry semantic fields (type, tags, status, embedding). Sharing a table would require nullable columns and discriminator logic that violates KISS.
- **KISS**: SQLite recursive CTEs for graph traversal — zero new dependencies, proven pattern (Obsidian, Datasette). Memory graph logic extracted to `src/engines/memory-graph.ts` to keep `code-index.ts` focused on code symbols.
- **YAGNI**: Depth limit of 2, no embedding required (Jaccard fallback), no `supersedes` edges.
- **SOTA**: Embedding cosine similarity for semantic clustering when available; RRF reranking via existing `rrf.ts`; visited-set guard in recursive CTE to prevent cycle explosion.

---

## 5. Architecture

### 5.1 Feature A: Code-Memory Graph

```
┌──────────────────────────────────────────────────────────────────┐
│                      code-index.db (SQLite)                      │
│                                                                  │
│  symbols ──── edges ────► memory_nodes ──── memory_edges        │
│  (existing)   (existing)  (new, memory-graph.ts)  (new)         │
└──────────────────────────────────────────────────────────────────┘
```

**Two edge types** (supersedes removed — see Non-Goals):

| Edge         | Source → Target | Created by                                                                               | Algorithm                                                       |
| ------------ | --------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `mentions`   | symbol → memory | `memory-graph.ts` `incrementalEdgeUpdate()` on write; `buildMemoryGraph()` on full index | FTS5 symbol name lookup in memory content                       |
| `related_to` | memory → memory | `memory-graph.ts` `incrementalEdgeUpdate()` on write; `buildMemoryGraph()` on full index | cosine sim ≥ 0.8 (Jaccard tag overlap fallback if no embedding) |

**Edge type constraint**: `mentions` edges are only created by symbol FTS5 lookup (`source_type = 'symbol'`). `related_to` edges are only created by memory similarity (`source_type = 'memory'`). These invariants are enforced in `memory-graph.ts`, not in the schema (see §6 for PRIMARY KEY design).

### 5.2 Feature B: Self-Iterating Skills

**B1 — CLAUDE.md auto-signal**

`memo study --auto` runs as a standalone command, surfaced at session start via `recallCommand` (not in the Stop hook, to avoid reading incomplete queue state):

```
recallCommand (end of recall flow) → check study-suggestions.json
  → if pending candidates: print "💡 memo study <name> — recalled N times"

memo study --auto --silent (called from Stop hook after process-queue completes):
  ├─ loadAccessLogs()
  ├─ filter: type=lesson, access_count ≥ 3, status=active
  ├─ filter: last_study_suggested absent or > 7 days ago
  └─ write study-suggestions.json + update last_study_suggested
```

**Stop hook order (safe sequencing):**

```bash
memo capture --auto && memo process-queue && memo study --auto --silent
```

`process-queue` runs synchronously (no `--background`). All `lifecycle-manager.ts` writes inside `processQueue` are synchronous and flushed before process exit, so `study --auto` reads the final access log state from the current session.

> **Note for SKILL.md:** The existing Stop hook uses `--background` for speed. This spec changes it to synchronous for correctness. The added latency is the lifecycle scan (~100ms), acceptable at session end.

**B2 — SKILL.md feedback**

```
memo skill-feedback   (manual, not in Stop hook)
  ├─ read recall-misses.json (queries with 0 results, written by recallCommand)
  ├─ read access logs → memories never recalled
  ├─ query memory_edges → isolated memory nodes (degree = 0)
  ├─ if ANTHROPIC_API_KEY set:
  │     LLM prompt → suggested SKILL.md trigger words / description patches
  └─ else: print raw statistics only (no LLM required)
```

---

## 6. Data Model

### New module: `src/engines/memory-graph.ts`

Owns all memory graph logic. `code-index.ts` calls `buildMemoryGraph()` during `memo index-code`. `queue-processor.ts` calls `incrementalEdgeUpdate()` after each `writeMemory()`.

### `incrementalEdgeUpdate` call interface

`queue-processor.ts` passes the fully-resolved memory object after `writeMemory()` returns:

```typescript
interface MemoryNodeInput {
  id: string; // frontmatter `name` field (slug)
  file_path: string; // absolute path written by writeMemory()
  type: string; // lesson|decision|workflow|architecture
  tags: string[]; // frontmatter tags array
  status: string; // active|needs-review|deprecated
  content_hash: string; // SHA256 computed by writeMemory() via hashFile()
  updated_at: string; // ISO timestamp from writeMemory()
}
// incrementalEdgeUpdate(db: Database, memory: MemoryNodeInput, embeddingConfig?: EmbeddingConfig): Promise<void>
```

`writeMemory()` already computes and returns these fields (it calls `hashFile()` internally); no new return type is required.

### New tables in `code-index.db`

```sql
-- Memory nodes (separate from symbols: different schema, different entity type)
CREATE TABLE IF NOT EXISTS memory_nodes (
  id           TEXT PRIMARY KEY,   -- memory slug (frontmatter name)
  file_path    TEXT NOT NULL,      -- absolute path to .md file
  type         TEXT NOT NULL,      -- lesson|decision|workflow|architecture
  tags         TEXT NOT NULL,      -- JSON array
  status       TEXT NOT NULL,      -- active|needs-review|deprecated
  embedding    BLOB,               -- float32[], NULL if no embedding configured
  content_hash TEXT NOT NULL,      -- SHA256 via hashFile(), for incremental skip
  updated_at   TEXT NOT NULL
);

-- Unified edge table for symbol→memory and memory→memory edges.
-- source_type is part of the PRIMARY KEY to prevent collision between a symbol
-- and a memory that share the same slug string.
CREATE TABLE IF NOT EXISTS memory_edges (
  source_id    TEXT NOT NULL,
  source_type  TEXT NOT NULL,      -- 'symbol' | 'memory'
  target_id    TEXT NOT NULL,
  target_type  TEXT NOT NULL,      -- always 'memory'
  edge_type    TEXT NOT NULL,      -- 'mentions' | 'related_to'
  weight       REAL DEFAULT 1.0,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (source_id, source_type, target_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_memory_edges_source ON memory_edges(source_id, source_type);
CREATE INDEX IF NOT EXISTS idx_memory_edges_target ON memory_edges(target_id);
```

**Slug uniqueness**: Enforced at write time by `dedup.ts` Stage 1 (exact slug match → skip). `buildMemoryGraph` upserts by `id`; if the same slug appears twice with different content, the later upsert wins — acceptable because dedup prevents this in normal operation.

### Extended AccessLog interface (`lifecycle-manager.ts`)

```typescript
interface AccessLog {
  // existing fields (access_count, last_accessed, status, etc.) ...
  last_study_suggested?: string; // ISO date — 7-day cooldown guard
}
```

### New metadata files

| File                                    | Purpose                                                            | Schema                                                                |
| --------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `.memobank/meta/study-suggestions.json` | Pending CLAUDE.md promotion candidates (written by `study --auto`) | `Array<{ name: string; access_count: number; suggested_at: string }>` |
| `.memobank/meta/recall-misses.json`     | Queries that returned 0 results (appended by `recallCommand`)      | `Array<{ query: string; timestamp: string; result_count: 0 }>`        |

---

## 7. Implementation Flow

### 7.1 New module: `memory-graph.ts`

```
buildMemoryGraph(db, memoDir, embeddingConfig?)
  ├─ scan .memobank/*.md
  ├─ for each file:
  │     compute content_hash (reuse hashFile())
  │     skip if hash matches existing memory_nodes row
  │     upsert memory_nodes
  │     if embedding configured: generate vector → store BLOB
  ├─ FTS5 query existing symbols table → mentions edges
  └─ related_to edges (scale-aware):
       if embeddings: cosine sim ≥ 0.8 between all pairs
       else: Jaccard tag overlap ≥ 0.3, capped at memories
             sharing at least 1 tag (avoids O(n²) on unrelated memories)

incrementalEdgeUpdate(db, memory: MemoryNodeInput, embeddingConfig?)
  ├─ upsert memory_nodes for memory
  ├─ FTS5 symbol lookup in memory.content → upsert mentions edges
  └─ similarity vs existing memory_nodes → upsert related_to edges
       (same scale-aware logic as buildMemoryGraph)
```

**Scale bound for `related_to` edges**: With tag pre-filtering, pairwise Jaccard runs only on memories sharing ≥ 1 tag. At 1,000 memories with average 3 tags and uniform tag distribution, the candidate set per new memory is ~100 pairs — O(1) in practice. Without tag pre-filtering (e.g., two memories with no tags), no `related_to` edge is created.

### 7.2 Index build (`code-index.ts` — minimal change)

```
memo index-code
  ├─ existing: scan src/ → symbols + code edges  (unchanged)
  └─ new: call buildMemoryGraph(db, memoDir, config.embedding)
```

### 7.3 Write-time edge update (`queue-processor.ts`)

```
processQueue → writeMemory(newMemory) → returns MemoryNodeInput
  └─ new: if code-index.db exists → incrementalEdgeUpdate(db, memoryNodeInput)
           else: skip silently (graph is optional)
```

### 7.4 Graph-aware recall (`recall.ts`)

```
memo recall "query" --code
  ├─ path A: text/vector memory search → ranked memories  (existing)
  │     → tag each result: { id, node_type: 'memory' }
  ├─ path B: FTS5 symbol search → ranked symbols           (existing)
  │     → tag each result: { id, node_type: 'symbol' }
  └─ path C: graph expansion (depth ≤ 2, cycle-safe)      (new)
        ├─ seeds: A results + B results, each carrying their node_type
        ├─ for each seed: run CTE with (:seed_id, :seed_type)
        └─ collect expanded memory IDs
  → merge A + B + C via RRF (reuse rrf.ts)
  → write MEMORY.md (existing flow)
  → if study-suggestions.json readable and has entries: print hint
    (file absent or corrupt: silently skip)
```

**Graph traversal query (cycle-safe):**

Each seed from paths A and B is traversed independently with its `node_type`:

```sql
-- Called once per seed: :seed_id and :seed_type supplied by caller
-- Visited string format: '|id1|id2|...' — each node ID delimited by '|' on both sides.
-- Example trace: seed='processQueue' → visited='|processQueue|'
--   depth-1 expand to 'api-timeout' → visited='|processQueue|api-timeout|'
--   LIKE check for 'processQueue': '%|processQueue|%' matches '|processQueue|api-timeout|' ✓
WITH RECURSIVE graph(id, node_type, depth, visited) AS (
  SELECT :seed_id, :seed_type, 0, '|' || :seed_id || '|'
  UNION ALL
  SELECT e.target_id, e.target_type, g.depth + 1,
         g.visited || e.target_id || '|'
  FROM memory_edges e
  JOIN graph g ON e.source_id = g.id AND e.source_type = g.node_type
  WHERE g.depth < 2
    AND g.visited NOT LIKE '%|' || e.target_id || '|%'
)
SELECT DISTINCT id, node_type FROM graph;
```

The JOIN now includes `e.source_type = g.node_type` to prevent a symbol seed from accidentally matching memory edges with the same source string ID.

### 7.5 CLAUDE.md auto-signal (`study.ts` + `lifecycle-manager.ts`)

```
memo study --auto [--silent]
  ├─ loadAccessLogs()                           (existing)
  ├─ filter: type=lesson, access_count ≥ 3, status=active
  ├─ filter: last_study_suggested absent OR > 7 days ago
  ├─ write .memobank/meta/study-suggestions.json
  └─ update last_study_suggested in access log  (new field)
```

### 7.6 SKILL.md feedback (`skill-feedback.ts`)

```
memo skill-feedback
  ├─ read recall-misses.json
  ├─ access logs → find memories with access_count = 0
  ├─ memory_edges → find memory_nodes with no edges (LEFT JOIN, NULL target)
  ├─ if ANTHROPIC_API_KEY: LLM → print suggested SKILL.md patches
  └─ else: print raw counts only
```

---

## 8. Error Handling

| Scenario                                   | Behaviour                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `code-index.db` absent                     | graph expansion skipped; recall uses existing dual-track mode unchanged                    |
| No embedding configured                    | `related_to` edges use Jaccard tag overlap with tag pre-filtering; no error or warning     |
| `ANTHROPIC_API_KEY` absent                 | `skill-feedback` prints statistics only; `study --auto` works without LLM                  |
| SQLite lock conflict                       | reuse existing `acquireLock()` in `lifecycle-manager.ts`                                   |
| Content hash unchanged                     | node + edge rebuild skipped (incremental, reuses `hashFile()`)                             |
| Graph CTE visited string                   | bounded by node count; for realistic memory sets (< 10K nodes) negligible overhead         |
| `process-queue` failure in Stop hook       | `&&` chain halts; `study --auto` not called — access logs remain consistent                |
| `study-suggestions.json` absent or corrupt | hint silently skipped; no error                                                            |
| `recall-misses.json` absent                | `skill-feedback` reports zero misses; no error                                             |
| Memory with no tags                        | no `related_to` edges created for that memory (tag pre-filter returns empty candidate set) |

---

## 9. Testing Strategy

| Test file                      | Coverage                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/memory-graph.test.ts`   | `memory_nodes` upsert, `mentions` + `related_to` edge creation, hash-based skip, **cycle detection in CTE**, source_type isolation in CTE JOIN |
| `tests/graph-recall.test.ts`   | graph expansion, RRF merge, depth limit, **regression: existing dual-track recall unchanged when no code-index.db**, seed node_type tagging    |
| `tests/study-auto.test.ts`     | access_count threshold, 7-day cooldown, `--silent` JSON output, `last_study_suggested` update, access log flush before study reads             |
| `tests/skill-feedback.test.ts` | recall-misses tracking, isolated node detection, LLM mock, absent-file graceful skip                                                           |

Not tested: LLM output quality, embedding vector accuracy (provider responsibility).

---

## 10. Affected Files

| File                             | Change type                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `src/engines/memory-graph.ts`    | **New file** — `buildMemoryGraph()`, `incrementalEdgeUpdate()` (~150 lines)      |
| `src/engines/code-index.ts`      | Extend: call `buildMemoryGraph()`, create new tables (~30 lines)                 |
| `src/core/queue-processor.ts`    | Extend: call `incrementalEdgeUpdate()` after write (~15 lines)                   |
| `src/commands/recall.ts`         | Extend: graph expansion + RRF merge + study-suggestions hint (~70 lines)         |
| `src/core/lifecycle-manager.ts`  | Extend: `last_study_suggested` field in AccessLog (~15 lines)                    |
| `src/commands/study.ts`          | Extend: `--auto` flag, write suggestions JSON (~30 lines)                        |
| `src/commands/skill-feedback.ts` | **New file** (~120 lines)                                                        |
| `src/cli.ts`                     | Register `skill-feedback` command (~5 lines)                                     |
| `SKILL.md` (memobank-skill)      | Change Stop hook: `--background` → synchronous; add `memo study --auto --silent` |

**Estimated total: ~435 lines changed/added. No new npm dependencies.**

---

## 11. Rollout Sequencing

1. **`memory-graph.ts` + schema** — new module + two new tables; no existing behaviour changed
2. **`code-index.ts` integration** — `memo index-code` calls `buildMemoryGraph()`; passively builds graph
3. **`queue-processor.ts` integration** — write-time edge updates; graph grows with each capture
4. **`recall.ts` graph expansion** — first user-visible improvement; falls back gracefully if DB absent
5. **CLAUDE.md auto-signal** (`study.ts` + `lifecycle-manager.ts`) — graph-independent logic; but the Stop hook change (`process-queue` synchronous + `study --auto --silent`) must ship **after step 3** so `processQueue` has already written access logs before `study --auto` reads them. Steps 2 and 5 can ship in parallel; step 5 must not ship before step 3.
6. **`skill-feedback.ts`** — needs recall-misses data to accumulate; ship last
