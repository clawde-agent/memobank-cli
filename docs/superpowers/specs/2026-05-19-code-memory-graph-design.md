# Spec: Code-Memory Graph & Self-Iterating Skills

**Date:** 2026-05-19
**Status:** Draft
**Scope:** memobank-cli + memobank-skill

---

## 1. Problem

memobank's recall is single-dimensional: a query returns ranked memories or ranked code symbols, but the two streams are not structurally connected. A memory about `processQueue` and the symbol `processQueue` have no explicit edge between them. Likewise, memories have no edges to each other beyond tag co-occurrence — there is no `supersedes`, `related_to`, or `contradicts` relationship.

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

---

## 4. Design Principles Applied

- **DRY**: All edge sources reuse existing modules (`embedding.ts`, `dedup.ts`, `code-index.ts` FTS5, `lifecycle-manager.ts` access logs)
- **KISS**: SQLite recursive CTEs for graph traversal — zero new dependencies, proven pattern (Obsidian, Datasette)
- **YAGNI**: Depth limit of 2, max 20 scenes, no embedding required (Jaccard fallback)
- **SOTA**: Embedding cosine similarity for semantic clustering when available; RRF reranking (already implemented in `rrf.ts`) for merged graph results

---

## 5. Architecture

### 5.1 Feature A: Code-Memory Graph

```
┌─────────────────────────────────────────────────────────────┐
│                    code-index.db (SQLite)                    │
│                                                             │
│  symbols ──── edges ────► memory_nodes ──── memory_edges   │
│  (existing)   (existing)  (new)             (new)          │
└─────────────────────────────────────────────────────────────┘
```

**Three edge types:**

| Edge         | Source → Target | Created by                     | Algorithm                                                             |
| ------------ | --------------- | ------------------------------ | --------------------------------------------------------------------- |
| `mentions`   | symbol → memory | `queue-processor.ts` on write  | FTS5 symbol name lookup in memory content                             |
| `related_to` | memory → memory | `code-index.ts` during index   | cosine sim ≥ 0.8 (Jaccard fallback if no embedding)                   |
| `supersedes` | memory → memory | `queue-processor.ts` via dedup | existing `dedup.ts` DUPLICATE verdict → write edge instead of discard |

### 5.2 Feature B: Self-Iterating Skills

**B1 — CLAUDE.md auto-signal**

```
Stop hook (extended):
  memo capture --auto
  memo process-queue --background
  memo study --auto --silent        ← new
```

`memo study --auto` checks access logs for lessons with `access_count ≥ 3`, filters by 7-day cooldown, writes candidates to `.memobank/meta/study-suggestions.json`. Printed at next interactive session start, not during background hook.

**B2 — SKILL.md feedback**

```
memo skill-feedback   (manual, not in Stop hook)
  ├─ reads .memobank/meta/recall-misses.json
  ├─ reads access logs for zero-recall memories
  ├─ reads memory_edges for isolated nodes (no edges)
  └─ LLM synthesis → prints suggested SKILL.md additions
     (no file writes without user confirmation)
```

---

## 6. Data Model

### New tables in `code-index.db`

```sql
CREATE TABLE IF NOT EXISTS memory_nodes (
  id           TEXT PRIMARY KEY,
  file_path    TEXT NOT NULL,
  type         TEXT NOT NULL,      -- lesson|decision|workflow|architecture
  tags         TEXT NOT NULL,      -- JSON array
  status       TEXT NOT NULL,
  embedding    BLOB,               -- float32[], NULL if no embedding configured
  content_hash TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_edges (
  source_id    TEXT NOT NULL,
  target_id    TEXT NOT NULL,
  source_type  TEXT NOT NULL,      -- 'symbol' | 'memory'
  target_type  TEXT NOT NULL,
  edge_type    TEXT NOT NULL,      -- 'mentions' | 'related_to' | 'supersedes'
  weight       REAL DEFAULT 1.0,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (source_id, target_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_memory_edges_source ON memory_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_memory_edges_target ON memory_edges(target_id);
```

### New field in access log (`lifecycle-manager.ts`)

```typescript
interface AccessLog {
  // existing fields ...
  last_study_suggested?: string; // ISO date, for 7-day cooldown
}
```

### New metadata files

| File                                    | Purpose                                |
| --------------------------------------- | -------------------------------------- |
| `.memobank/meta/study-suggestions.json` | Pending CLAUDE.md promotion candidates |
| `.memobank/meta/recall-misses.json`     | Queries that returned 0 results        |

---

## 7. Implementation Flow

### 7.1 Index build (`code-index.ts`)

```
memo index-code
  ├─ existing: scan src/ → symbols + code edges
  └─ new: scan .memobank/*.md
        ├─ compute content_hash (SHA256, reuse hashFile())
        ├─ skip if hash unchanged (incremental)
        ├─ upsert memory_nodes
        ├─ if embedding configured: generate vector, store BLOB
        ├─ FTS5 query: find symbol names in memory content → mentions edges
        └─ pairwise similarity across memory_nodes → related_to edges
           (cosine if embeddings present, Jaccard tag overlap otherwise)
```

### 7.2 Write-time edge update (`queue-processor.ts`)

```
processQueue → writeMemory(newMemory)
  └─ new: incrementalEdgeUpdate(newMemory)
        ├─ FTS5 symbol lookup → upsert mentions edges
        ├─ similarity against existing memory_nodes → upsert related_to edges
        └─ if dedup verdict was DUPLICATE: write supersedes edge
           (dedup.ts returns verdict; queue-processor acts on it)
```

### 7.3 Graph-aware recall (`recall.ts`)

```
memo recall "query" --code
  ├─ existing path A: text/vector memory search → ranked memories
  ├─ existing path B: FTS5 symbol search → ranked symbols
  └─ new path C: graph expansion (depth ≤ 2)
        ├─ from hit memories → traverse related_to + mentions edges
        ├─ from hit symbols → traverse mentions edges (reverse)
        └─ deduplicate expanded set
  → merge A + B + C via RRF (reuse rrf.ts)
  → write MEMORY.md (existing flow)
```

**Graph traversal query:**

```sql
WITH RECURSIVE graph(id, node_type, depth) AS (
  SELECT :seed_id, :seed_type, 0
  UNION ALL
  SELECT e.target_id, e.target_type, g.depth + 1
  FROM memory_edges e
  JOIN graph g ON e.source_id = g.id
  WHERE g.depth < 2
)
SELECT DISTINCT id, node_type FROM graph;
```

### 7.4 CLAUDE.md auto-signal (`study.ts` + `lifecycle-manager.ts`)

```
memo study --auto [--silent]
  ├─ loadAccessLogs()
  ├─ filter: type=lesson, access_count ≥ 3, status=active
  ├─ filter: last_study_suggested absent or > 7 days ago
  ├─ if candidates found:
  │     --silent: write study-suggestions.json
  │     interactive: print "💡 memo study <name> — recalled N times"
  └─ update last_study_suggested in access log
```

### 7.5 SKILL.md feedback (`skill-feedback.ts`)

```
memo skill-feedback
  ├─ read recall-misses.json (queries with 0 results)
  ├─ read access logs → memories never recalled
  ├─ query memory_edges → isolated memory nodes (no edges)
  ├─ if ANTHROPIC_API_KEY set:
  │     LLM prompt → suggested SKILL.md trigger words / description patches
  └─ else: print raw statistics only
```

---

## 8. Error Handling

| Scenario                   | Behaviour                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `code-index.db` absent     | graph expansion skipped; recall falls back to existing dual-track mode              |
| No embedding configured    | `related_to` edges use Jaccard tag overlap; no error                                |
| `ANTHROPIC_API_KEY` absent | `skill-feedback` prints statistics only; `study --auto` still works (no LLM needed) |
| SQLite lock conflict       | reuse existing `acquireLock()` in `lifecycle-manager.ts`                            |
| Content hash unchanged     | node + edge rebuild skipped (incremental)                                           |
| Graph CTE exceeds depth 2  | hard limit in SQL; bounded at O(n²) nodes                                           |

---

## 9. Testing Strategy

| Test file                      | Coverage                                                             |
| ------------------------------ | -------------------------------------------------------------------- |
| `tests/memory-graph.test.ts`   | `memory_nodes` upsert, edge creation, CTE traversal, hash-based skip |
| `tests/graph-recall.test.ts`   | graph expansion, RRF merge, depth limit enforcement                  |
| `tests/study-auto.test.ts`     | access_count threshold, 7-day cooldown, `--silent` JSON output       |
| `tests/skill-feedback.test.ts` | recall-misses tracking, isolated node detection, LLM mock            |

Not tested: LLM output quality, embedding vector accuracy (provider responsibility).

---

## 10. Affected Files

| File                             | Change type                                                     |
| -------------------------------- | --------------------------------------------------------------- |
| `src/engines/code-index.ts`      | Extend: memory_nodes table, memory scan, edge build (~80 lines) |
| `src/core/queue-processor.ts`    | Extend: incrementalEdgeUpdate after write (~40 lines)           |
| `src/commands/recall.ts`         | Extend: graph expansion + RRF merge (~60 lines)                 |
| `src/core/lifecycle-manager.ts`  | Extend: `last_study_suggested` field (~30 lines)                |
| `src/commands/study.ts`          | Extend: `--auto` flag (~25 lines)                               |
| `src/commands/skill-feedback.ts` | New file (~120 lines)                                           |
| `src/cli.ts`                     | Register `skill-feedback` command                               |
| `SKILL.md` (memobank-skill)      | Add `memo study --auto --silent` to Stop hook                   |

**Estimated total: ~370 lines changed/added. No new npm dependencies.**

---

## 11. Rollout Sequencing

1. **Schema migration** (`code-index.ts`) — foundation for everything else
2. **Write-time edges** (`queue-processor.ts`) — starts building the graph passively
3. **Graph recall** (`recall.ts`) — first user-visible improvement
4. **CLAUDE.md auto-signal** (`study.ts`, `lifecycle-manager.ts`) — quick win, independent of graph
5. **SKILL.md feedback** (`skill-feedback.ts`) — depends on recall-misses data accumulating over time
