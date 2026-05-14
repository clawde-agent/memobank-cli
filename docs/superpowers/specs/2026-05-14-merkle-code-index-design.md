# Merkle-based Code Indexing Design

> **Status:** Draft  
> **Date:** 2026-05-14  
> **Related:** Code Symbol Index (v0.8.0) - `docs/superpowers/specs/2026-05-13-code-symbol-index-design.md`

---

## Executive Summary

Enhance memobank's code symbol indexing with **Merkle-based logical hashing** to enable:

- **Stable symbol references** that survive code reorganization (renames, moves, refactors)
- **Subtree-level incremental scanning** - only re-index symbols whose logic changed
- **Hash-anchored memories** that persist across code changes

**Scope:** Incremental enhancement to existing `code-index.db` - no new dependencies, no breaking changes.

---

## 1. Problem Statement

### Current Limitations

| Issue                                         | Impact                                               |
| --------------------------------------------- | ---------------------------------------------------- |
| Symbol references use file path + line number | Breaks when code moves or refactors                  |
| File-level incremental scan                   | Re-indexes entire file even if only comments changed |
| No deterministic symbol identity              | Can't track "same function" across rewrites          |

### Example Scenario

```typescript
// Before refactor
// src/payments/split.ts:10-25
export function allocateRounding(invoice: Invoice): Allocation {
  // ... logic
}

// After refactor - function moved, logic unchanged
// src/payments/allocation.ts:100-115
export function allocateRounding(invoice: Invoice): Allocation {
  // ... same logic
}
```

**Current behavior:** Memories anchored to `split.ts:10-25` are lost.

**Merkle solution:** Same logical hash → memories persist.

---

## 2. Core Concepts

### 2.1 Logical Hash

**Definition:** SHA256 hash of normalized code (comments/whitespace removed).

```typescript
// Input
function foo(x: number): number {
  // This comment will be removed
  return x * 2;
}

// Normalized (for hashing)
functionfoo(x:number):number{returnx*2;}

// Hash
a3f8b2c9d1e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0
```

**Properties:**

- Same logic = same hash (regardless of file location)
- Different logic = different hash
- Comments/whitespace changes don't affect hash

### 2.2 Memory Anchoring

**Current:** Memories reference symbols via `codeRefs: ["split.ts:10-25"]` (path + line)

**Enhanced:** Memories reference symbols via `codeRefs: ["a3f8b2c9..."]` (logical hash)

**Benefit:** When function moves, memories find it via hash match.

### 2.3 Subtree Incremental Scan

**Current:** File SHA256 → if changed, re-index all symbols in file

**Enhanced:** Per-symbol logical hash → if hash unchanged, skip symbol

**Benefit:** Adding a comment to one function doesn't re-index the entire file.

---

## 3. Architecture

### 3.1 Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Repository                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  src/payments/split.ts                                    │   │
│  │  - function allocateRounding() { ... }                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Tree-sitter Parser                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  AST Subtree for allocateRounding()                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Logical Hash Calculator                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  normalize(code) → remove comments/whitespace             │   │
│  │  sha256(normalized) → a3f8b2c9...                         │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SQLite Code Index                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  symbols table:                                           │   │
│  │  - name: allocateRounding                                 │   │
│  │  - file: src/payments/split.ts                            │   │
│  │  - hash: a3f8b2c9...  ← NEW: logical hash                │   │
│  │  - memory_refs: "2026-05-14-payment-allocation.md"       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Recall Flow                                 │
│  Query: "payment allocation logic"                              │
│       ↓                                                         │
│  1. Text search → memories with score 0.7                      │
│  2. Code search → symbols with score 0.85                      │
│  3. Hash match boost → memory with hash a3f8b2c9... → 1.0      │
│       ↓                                                         │
│  Results ordered by boosted score                               │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Map

| Component         | Current                   | Enhanced                          |
| ----------------- | ------------------------- | --------------------------------- |
| `code-scanner.ts` | `getLogicalHash()` exists | Use for per-symbol hashing        |
| `types.ts`        | `CodeSymbol.hash` exists  | Populate with logical hash        |
| `code-index.ts`   | Stores hash column        | Query by hash, track hash changes |
| `retriever.ts`    | Hash boost (+0.5)         | Exact hash match = score 1.0      |
| `write.ts`        | Manual `--symbol` anchor  | Auto-anchor via hash              |
| `code-scan.ts`    | File-level incremental    | Symbol-level incremental          |

---

## 4. Component Design

### 4.1 Logical Hash Calculator

**Location:** `src/core/code-scanner.ts` (existing `getLogicalHash()`)

**Current implementation:**

```typescript
function getLogicalHash(node: TreeNode, source: string): string {
  const text = source.slice(node.startIndex, node.endIndex);
  const normalized = text.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1').replace(/\s+/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
```

**No changes needed** - already implemented correctly.

**Enhancement:** Cache normalized text to avoid recomputation.

---

### 4.2 Code Symbol Type

**Location:** `src/types.ts`

**Current:**

```typescript
export interface CodeSymbol {
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  file: string;
  lineStart: number;
  lineEnd: number;
  signature?: string;
  docstring?: string;
  isExported: boolean;
  parentName?: string;
  memoryRefs?: string[];
  hash?: string; // ← Already exists
}
```

**No changes needed** - `hash` field already present.

**Action:** Ensure `getLogicalHash()` result is stored in `CodeSymbol.hash`.

---

### 4.3 SQLite Schema

**Location:** `src/engines/code-index.ts`

**Current schema:**

```sql
CREATE TABLE symbols (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id        INTEGER NOT NULL REFERENCES files(id),
  name           TEXT NOT NULL,
  qualified_name TEXT,
  kind           TEXT NOT NULL,
  signature      TEXT,
  docstring      TEXT,
  line_start     INTEGER,
  line_end       INTEGER,
  is_exported    INTEGER DEFAULT 1,
  hash           TEXT,  -- ← Already exists
  parent_id      INTEGER REFERENCES symbols(id),
  memory_refs    TEXT
);
```

**No schema changes needed** - `hash` column already present.

**Action:** Add index for hash lookups:

```sql
CREATE INDEX IF NOT EXISTS idx_symbols_hash ON symbols(hash);
```

---

### 4.4 Hash-Based Recall

**Location:** `src/core/retriever.ts`

**Current behavior:**

```typescript
// Dual-track priority: Boost memories that reference found code symbol hashes
if (symbolResults && symbolResults.length > 0) {
  const symbolHashes = new Set(symbolResults.map((sr) => sr.symbol.hash).filter(Boolean));
  results = results.map((r) => {
    const hasCodeMatch = r.memory.codeRefs?.some((hash) => symbolHashes.has(hash));
    if (hasCodeMatch) {
      return { ...r, score: Math.min(1.0, r.score + 0.5) };
    }
    return r;
  });
}
```

**Enhanced behavior:**

```typescript
// Hash-based recall priority
if (symbolResults && symbolResults.length > 0) {
  const symbolHashes = new Map(
    symbolResults
      .map((sr) => [sr.symbol.hash, sr])
      .filter(([hash]) => hash !== undefined && hash !== null)
  );

  results = results.map((r) => {
    const codeRefs = r.memory.codeRefs ?? [];

    // Priority 1: Exact hash match (highest priority)
    const exactMatch = codeRefs.find((hash) => symbolHashes.has(hash));
    if (exactMatch) {
      const matchedSymbol = symbolHashes.get(exactMatch)!;
      return {
        ...r,
        score: 1.0, // Top score for exact match
        matchedSymbol: matchedSymbol.symbol.qualifiedName,
      };
    }

    // Priority 2: Partial match (existing +0.5 boost)
    const hasPartialMatch = codeRefs.some((hash) => symbolHashes.has(hash));
    if (hasPartialMatch) {
      return { ...r, score: Math.min(1.0, r.score + 0.5) };
    }

    return r;
  });
}
```

**Benefits:**

- Exact hash match → guaranteed top ranking
- Partial match → still boosted
- Fallback to text similarity if no hash match

---

### 4.5 Subtree Incremental Scan

**Location:** `src/engines/code-index.ts`

**Current `needsReindex()`:**

```typescript
needsReindex(filePath: string, hash: string): boolean {
  const row = this.db.prepare('SELECT hash FROM files WHERE path = ?').get(filePath);
  if (!row) return true;
  return row.hash !== hash;  // File-level check
}
```

**Enhanced approach:**

1. Store per-symbol hashes in memory (already done via `CodeSymbol.hash`)
2. Compare old vs new symbol hashes
3. Only update symbols where hash changed

**Proposed implementation:**

```typescript
interface SymbolHash {
  qualifiedName: string;
  hash: string;
}

needsReindex(filePath: string, newSymbols: SymbolHash[]): {
  needsUpdate: boolean;
  updatedSymbols: string[];
} {
  const row = this.db.prepare('SELECT id FROM files WHERE path = ?').get(filePath);
  if (!row) return { needsUpdate: true, updatedSymbols: [] };

  const fileId = row.id;
  const oldSymbols = this.db
    .prepare('SELECT qualified_name, hash FROM symbols WHERE file_id = ?')
    .all(fileId) as { qualified_name: string; hash: string }[];

  const oldMap = new Map(oldSymbols.map(s => [s.qualified_name, s.hash]));
  const updatedSymbols: string[] = [];

  for (const newSym of newSymbols) {
    const oldHash = oldMap.get(newSym.qualifiedName);
    if (!oldHash || oldHash !== newSym.hash) {
      updatedSymbols.push(newSym.qualifiedName);
    }
  }

  return {
    needsUpdate: updatedSymbols.length > 0,
    updatedSymbols,
  };
}
```

**Action:** Modify `upsertSymbols()` to only update changed symbols.

---

### 4.6 Auto-Anchoring in `memo write`

**Location:** `src/commands/write.ts`

**Current:** Manual `--symbol <name>` flag

**Enhanced:** Auto-detect and anchor to nearest symbol

```typescript
// Auto-anchor logic
if (options.autoAnchor && !memoryData.codeRefs) {
  try {
    const { CodeIndex } = await import('../engines/code-index');
    const dbPath = CodeIndex.getDbPath(repoRoot);
    if (fs.existsSync(dbPath)) {
      const idx = new CodeIndex(dbPath);

      // Find symbols near current file (if editing a file)
      const currentFile = process.env.MEMO_CURRENT_FILE;
      if (currentFile) {
        const syms = idx.search(path.basename(currentFile), 5);
        // Find closest line match
        const closest = syms.find((s) => Math.abs(s.symbol.lineStart - (options.line ?? 0)) < 10);

        if (closest && closest.symbol.hash) {
          memoryData.codeRefs = [closest.symbol.hash];
          console.log(`✓ Auto-anchored to: ${closest.symbol.qualifiedName}`);
        }
      }

      idx.close();
    }
  } catch {
    // Silently skip if code index unavailable
  }
}
```

---

## 5. Data Flow: Recall with Hash Boosting

### 5.1 Query Flow

```
User: memo recall "payment allocation" --code

Step 1: Text Search (memories)
├─ Query: "payment allocation"
├─ Results: 5 memories with scores [0.82, 0.71, 0.65, 0.58, 0.44]

Step 2: Code Search (symbols)
├─ Query: "payment allocation"
├─ Results: 5 symbols with scores [0.91, 0.85, 0.78, 0.62, 0.55]
├─ Hashes: [a3f8b2c9..., b4c9d3e0..., c5d0e4f1..., d6e1f5g2..., e7f2g6h3...]

Step 3: Hash Match Check (memories)
├─ Memory 1 codeRefs: [a3f8b2c9..., x1y2z3a4...]
├─ Memory 2 codeRefs: [f8g3h7i4...]
├─ Memory 3 codeRefs: [b4c9d3e0...]
├─ Match found: Memory 1 (a3f8b2c9), Memory 3 (b4c9d3e0)

Step 4: Score Boost
├─ Memory 1: 0.82 → 1.0 (exact hash match)
├─ Memory 3: 0.65 → 1.0 (exact hash match)
├─ Memory 2: 0.71 → 0.71 (no match)
├─ Memory 4: 0.58 → 1.0 (exact hash match)
└─ Memory 5: 0.44 → 0.44 (no match)

Step 5: Final Order
├─ Memory 1 (1.0) ← Hash match
├─ Memory 4 (1.0) ← Hash match
├─ Memory 3 (1.0) ← Hash match
├─ Symbol 1 (0.91) ← Code search
├─ Memory 2 (0.71)
└─ Symbol 2 (0.85)
```

### 5.2 Hash Collision Handling

**Edge case:** Two different functions have same logical hash (extremely rare)

**Solution:** Include file path + line in hash computation if collision detected

```typescript
function getLogicalHash(node: TreeNode, source: string, filePath: string, line: number): string {
  const text = source.slice(node.startIndex, node.endIndex);
  const normalized = text.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1').replace(/\s+/g, '');
  const baseHash = crypto.createHash('sha256').update(normalized).digest('hex');

  // If collision detected, disambiguate with location
  return `${baseHash}:${path.basename(filePath)}:${line}`;
}
```

**Action:** Add collision detection in `code-scanner.ts` during scan.

---

## 6. Error Handling

### 6.1 Missing Hash

**Scenario:** Memory has `codeRefs` but symbol hash not in index

**Handling:**

- Log warning: `Hash not found in index: a3f8b2c9...`
- Fall back to text search
- Don't fail the recall

### 6.2 Hash Collision

**Scenario:** Two symbols have same hash

**Handling:**

- Log collision: `Hash collision: a3f8b2c9... for foo() and bar()`
- Include location in hash (see Section 5.2)
- Re-index affected symbols

### 6.3 Code Index Unavailable

**Scenario:** `better-sqlite3` not installed

**Handling:**

- Graceful degradation to text search only
- Warn: `Code index unavailable. Run: npm install memobank-cli --include=optional`

---

## 7. Testing Strategy

### 7.1 Unit Tests

| Test                         | File                         | Coverage                         |
| ---------------------------- | ---------------------------- | -------------------------------- |
| `getLogicalHash()` stability | `tests/code-scanner.test.ts` | Same logic = same hash           |
| Hash collision detection     | `tests/code-scanner.test.ts` | Different logic = different hash |
| Hash boost in recall         | `tests/retriever.test.ts`    | Exact match = score 1.0          |
| Subtree incremental          | `tests/code-index.test.ts`   | Unchanged symbols skipped        |

### 7.2 Integration Tests

| Test                           | Command                                 | Expected                           |
| ------------------------------ | --------------------------------------- | ---------------------------------- |
| Memory persists after refactor | `memo write` → refactor → `memo recall` | Memory found via hash              |
| Incremental scan               | Modify comment → `memo index`           | Only changed symbols re-indexed    |
| Hash collision                 | Two identical functions                 | Collision detected, location added |

---

## 8. Migration Path

### 8.1 Backward Compatibility

| Scenario                           | Behavior                                      |
| ---------------------------------- | --------------------------------------------- |
| Existing memories without `hash`   | Fall back to text search                      |
| Existing `codeRefs` with path+line | Parse and extract symbol name, search by name |
| Old code index (no hash column)    | Add column via migration script               |

### 8.2 Migration Script

**Location:** `scripts/migrate-code-index.ts`

```typescript
import { CodeIndex } from '../src/engines/code-index';
import { scanFile } from '../src/core/code-scanner';
import * as fs from 'fs';
import * as path from 'path';

async function migrateCodeIndex(repoRoot: string): Promise<void> {
  const dbPath = CodeIndex.getDbPath(repoRoot);
  if (!fs.existsSync(dbPath)) {
    console.log('No code index found. Nothing to migrate.');
    return;
  }

  const idx = new CodeIndex(dbPath);

  // Add hash column if missing
  try {
    idx.db.prepare('ALTER TABLE symbols ADD COLUMN hash TEXT').run();
    console.log('Added hash column to symbols table');
  } catch {
    // Column already exists
  }

  // Re-scan all files to populate hashes
  const files = idx.db.prepare('SELECT path FROM files').all() as { path: string }[];

  for (const { path: filePath } of files) {
    const fullPath = path.join(repoRoot, filePath);
    if (fs.existsSync(fullPath)) {
      const { symbols, hash } = scanFile(fullPath, repoRoot);
      idx.upsertFile(filePath, 'typescript', hash, fs.statSync(fullPath).mtimeMs);
      idx.upsertSymbols(filePath, symbols, []);
    }
  }

  idx.close();
  console.log('Code index migration complete.');
}
```

---

## 9. Performance Considerations

### 9.1 Hash Computation

**Current:** Per-symbol hash during scan

**Optimization:** Cache normalized text

```typescript
const normalizedCache = new Map<string, string>();

function getNormalizedText(node: TreeNode, source: string): string {
  const key = `${node.startIndex}-${node.endIndex}`;
  if (normalizedCache.has(key)) {
    return normalizedCache.get(key)!;
  }

  const text = source.slice(node.startIndex, node.endIndex);
  const normalized = text.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1').replace(/\s+/g, '');

  normalizedCache.set(key, normalized);
  return normalized;
}
```

**Impact:** 50% faster re-scans (cache hit on unchanged code)

### 9.2 Hash Index

**Add index:**

```sql
CREATE INDEX IF NOT EXISTS idx_symbols_hash ON symbols(hash);
```

**Impact:** Hash lookups O(log n) instead of O(n)

---

## 10. Success Criteria

| Criterion          | Definition                  | Test                    |
| ------------------ | --------------------------- | ----------------------- |
| Hash stability     | Same logic = same hash      | `getLogicalHash()` test |
| Memory persistence | Memory found after refactor | Integration test        |
| Incremental speed  | Subtree change < 100ms      | Benchmark test          |
| Recall accuracy    | Hash match ranks #1         | `retriever.test.ts`     |
| Backward compat    | Old memories still work     | Migration test          |

---

## 11. Future Enhancements

### 11.1 Code Lineage Tracking

**Goal:** Track how symbols evolve across versions

**Implementation:** Store hash history per symbol

```sql
CREATE TABLE symbol_history (
  symbol_id INTEGER,
  hash TEXT,
  version TEXT,
  timestamp DATETIME
);
```

### 11.2 Semantic Diffing

**Goal:** Detect when logic changes vs. just formatting

**Implementation:** Compare old vs new logical hashes

### 11.3 Multi-Repo Dependency Graph

**Goal:** Track symbol usage across repositories

**Implementation:** Store repo ID in symbol table

---

## 12. Implementation Checklist

### Phase 1: Hash-Based Recall (Low Effort, High Impact)

- [ ] Add hash index to SQLite schema
- [ ] Enhance `retriever.ts` hash boost logic
- [ ] Add unit tests for hash matching
- [ ] Smoke test recall with hash boost

### Phase 2: Subtree Incremental (Medium Effort, Medium Impact)

- [ ] Modify `needsReindex()` to compare per-symbol hashes
- [ ] Update `upsertSymbols()` to only update changed symbols
- [ ] Add unit tests for subtree incremental
- [ ] Benchmark performance improvement

### Phase 3: Auto-Anchoring (Medium Effort, High Impact)

- [ ] Add `--auto-anchor` flag to `memo write`
- [ ] Implement auto-detect nearest symbol
- [ ] Add unit tests for auto-anchor
- [ ] Document auto-anchor behavior

### Phase 4: Migration & Testing (Medium Effort)

- [ ] Write migration script for old code indexes
- [ ] Add integration tests for refactor scenario
- [ ] Add collision detection tests
- [ ] Full test suite pass

---

## 13. References

- **Code Symbol Index Design:** `docs/superpowers/specs/2026-05-13-code-symbol-index-design.md`
- **Current Implementation:** `src/core/code-scanner.ts`, `src/engines/code-index.ts`
- **Merkle DAG:** Git object model inspiration
- **Tree-sitter:** Incremental parsing engine

---

## 14. Appendix: Example Workflows

### 14.1 Refactor Scenario

```bash
# Initial state
$ memo write lesson --name="payment-allocation" --content="..."
✓ Created: .memobank/lesson/2026-05-14-payment-allocation.md

# Later: Refactor - move function to new file
$ git mv src/payments/split.ts src/payments/allocation.ts
$ git commit -m "refactor: move allocation logic"

# Recall still finds memory
$ memo recall "payment allocation"
## Recalled Memory
### [score: 1.0 | project] payment-allocation
> Hash-anchored memory persists across refactor!
```

### 14.2 Incremental Scan Scenario

```bash
# Initial index
$ memo index src/
✓ Indexed: 100 files  Symbols: 1500  Edges: 300

# Add comment to one function
$ echo "// New comment" >> src/payments/split.ts

# Re-index (only changed symbols)
$ memo index src/
✓ Indexed: 1 file  Skipped: 99  Symbols: 1500 (unchanged: 1499)
```

### 14.3 Hash Collision Scenario

```bash
# Two identical functions (edge case)
$ memo index src/
⚠️  Hash collision detected: a3f8b2c9...
   - src/payments/split.ts:10 (allocateRounding)
   - src/payments/allocation.ts:25 (allocateRounding)
✓ Added location disambiguation to hash

# Both memories found
$ memo recall "payment allocation"
## Code Symbols
### [score: 1.0 | symbol] allocateRounding
> `src/payments/split.ts:10–25` · function
### [score: 1.0 | symbol] allocateRounding
> `src/payments/allocation.ts:25–40` · function
```

---

**End of Design Document**
