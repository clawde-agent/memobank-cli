# Code-Memory Bridge: Fix Four Bugs (P0–P4) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four specific bugs that prevent `capture --auto` from populating code refs, making the already-built `memory_symbol_refs` mechanism functional for 99% of captured memories — and surface those refs in recall output plus a new `memo code-context` reverse-lookup command.

**Architecture:** The infrastructure already exists (`memory_symbol_refs` table, `CodeIndex.linkMemory`, `CodeIndex.getLinkedMemories`, `codeRefs` on `MemoryFile`, `graphScores` ranker). Four bugs disconnect it from the main capture path: (1) `PendingCandidate` / `ExtractionResult` have no `codeRefs` field; (2) `writeMemory` ignores `codeRefs` even when present; (3) `codeRefs` stores opaque symbol hashes instead of human-readable `file::symbol` paths; (4) recall output never displays `codeRefs`. No schema changes — only code fixes and one new CLI command.

**Tech Stack:** TypeScript, better-sqlite3 (already used in `CodeIndex`), Jest, Commander.js (existing)

**Spec:** `docs/superpowers/specs/2026-05-26-code-memory-bridge-design.md`

---

## File Map

| File                           | Action | Responsibility                                                                               |
| ------------------------------ | ------ | -------------------------------------------------------------------------------------------- |
| `src/types.ts`                 | Modify | Add `codeRefs?: string[]` to `ExtractionResult`                                              |
| `src/core/store.ts`            | Modify | Add `codeRefs?: string[]` to `PendingCandidate`; branch `writeMemory` on `codeRefs` presence |
| `src/core/smart-extractor.ts`  | Modify | Add `code_refs` field to extraction JSON schema in `SYSTEM_PROMPT`                           |
| `src/engines/code-index.ts`    | Modify | Add `linkMemoryByRefs(memPath, refs)` method                                                 |
| `src/commands/write.ts`        | Modify | Change `codeRefs` from symbol hash to `file::symbolName` format                              |
| `src/core/retriever.ts`        | Modify | Render `codeRefs` inline in `formatResultsAsMarkdown`                                        |
| `src/commands/code-context.ts` | Create | Reverse-lookup: file/symbol → linked memories                                                |
| `src/cli.ts`                   | Modify | Register `code-context` command                                                              |
| `tests/code-index.test.ts`     | Modify | Add `linkMemoryByRefs` tests                                                                 |
| `tests/store.test.ts`          | Modify | Add `writeMemory` codeRefs branching test                                                    |
| `tests/recall.test.ts`         | Modify | Add codeRefs inline display test                                                             |
| `tests/code-context.test.ts`   | Create | Tests for `code-context` command                                                             |

---

## Chunk 1: P0 — Widen types and update extraction prompt

### Task 1: Add `codeRefs` to `ExtractionResult` and `PendingCandidate`

**Files:**

- Modify: `src/types.ts`
- Modify: `src/core/store.ts`

- [ ] **Step 1: Add `codeRefs` to `ExtractionResult` in `src/types.ts`**

Find the `ExtractionResult` interface (around line 121) and add the new optional field:

```typescript
// Before
export interface ExtractionResult {
  name: string;
  type: MemoryType;
  description: string;
  tags: string[];
  confidence: Confidence;
  content: string;
}

// After
export interface ExtractionResult {
  name: string;
  type: MemoryType;
  description: string;
  tags: string[];
  confidence: Confidence;
  content: string;
  codeRefs?: string[]; // file::symbol refs identified by LLM
}
```

- [ ] **Step 2: Add `codeRefs` to `PendingCandidate` in `src/core/store.ts`**

Find the `PendingCandidate` interface (around line 7) and add:

```typescript
// Before
export interface PendingCandidate {
  name: string;
  type: MemoryType;
  description: string;
  tags: string[];
  confidence: Confidence;
  content: string;
}

// After
export interface PendingCandidate {
  name: string;
  type: MemoryType;
  description: string;
  tags: string[];
  confidence: Confidence;
  content: string;
  codeRefs?: string[]; // file::symbol refs; flows through writeMemory spread
}
```

Note: `queue-processor.ts` already spreads `...candidate` into `writeMemory`, and `writeMemory` already writes `memory.codeRefs` to frontmatter at line 63 of `store.ts`. Once both interfaces have the field, the data flows end-to-end automatically — no changes to `queue-processor.ts` needed.

- [ ] **Step 3: Typecheck**

```
npm run typecheck
```

Expected: no errors

- [ ] **Step 4: Commit**

```
git add src/types.ts src/core/store.ts
git commit -m "feat(types): add codeRefs field to ExtractionResult and PendingCandidate"
```

---

### Task 2: Update LLM extraction prompt to produce code refs

**Files:**

- Modify: `src/core/smart-extractor.ts`
- Modify: `tests/smart-extractor.test.ts`

- [ ] **Step 1: Write a failing test that checks the prompt schema**

Open `tests/smart-extractor.test.ts` and add:

```typescript
describe('SYSTEM_PROMPT schema', () => {
  it('includes code_refs in the extraction JSON schema', async () => {
    // Access the module's internal SYSTEM_PROMPT constant
    const moduleText = await import('fs').then((fs) =>
      fs.promises.readFile('src/core/smart-extractor.ts', 'utf-8')
    );
    expect(moduleText).toContain('"code_refs"');
    expect(moduleText).toContain('file::symbolName');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/smart-extractor.test.ts --no-coverage -t "SYSTEM_PROMPT schema"
```

Expected: FAIL — `code_refs` not found in module text

- [ ] **Step 3: Update `SYSTEM_PROMPT` in `src/core/smart-extractor.ts`**

In `SYSTEM_PROMPT`, update the JSON schema block. Add `code_refs` field after `content`:

```typescript
// Replace the schema block inside SYSTEM_PROMPT:
{
  "name": "slug-format-kebab-case",
  "type": "lesson|decision|workflow|architecture",
  "description": "one sentence summary",
  "tags": ["tag1", "tag2"],
  "confidence": "low|medium|high",
  "content": "markdown body with the full insight",
  "code_refs": ["src/path/file.ts::symbolName"]
}
```

Add an instruction below the schema (before the `## Priority criteria` section):

```
For each memory, if the session text mentions specific source files or functions, include them as
"code_refs". Use format "src/path/to/file.ts" (file-level) or "src/path/to/file.ts::functionName"
(symbol-level). Examples: "src/core/store.ts::writePending", "src/engines/code-index.ts".
Only include refs you are confident about — omit the field entirely if uncertain.
```

Also map `code_refs` (snake_case from LLM) → `codeRefs` (camelCase TypeScript). Find the single line:

```typescript
const extracted = JSON.parse(jsonMatch[0]) as ExtractionResult[];
```

Replace **only that line** with:

```typescript
const extracted = (
  JSON.parse(jsonMatch[0]) as Array<ExtractionResult & { code_refs?: string[] }>
).map((item) => ({ ...item, codeRefs: item.code_refs }));
```

Leave the existing `return extracted.filter(...)` block immediately below it **completely unchanged** — it will continue to filter required fields; `codeRefs` is optional and is not part of the filter predicate.

- [ ] **Step 4: Run test to pass**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/smart-extractor.test.ts --no-coverage -t "SYSTEM_PROMPT schema"
```

Expected: PASS

- [ ] **Step 5: Typecheck**

```
npm run typecheck
```

Expected: no errors

- [ ] **Step 6: Commit**

```
git add src/core/smart-extractor.ts tests/smart-extractor.test.ts
git commit -m "feat(extractor): add code_refs to LLM extraction schema and prompt"
```

---

## Chunk 2: P1 — `linkMemoryByRefs` + `writeMemory` branch

### Task 3: Add `linkMemoryByRefs` to `CodeIndex`

This method resolves `file::symbol` refs to symbol hashes and writes `memory_symbol_refs` directly — bypassing noisy FTS.

**Files:**

- Modify: `src/engines/code-index.ts`
- Modify: `tests/code-index.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/code-index.test.ts` inside the existing `describe('CodeIndex', ...)` block:

```typescript
describe('linkMemoryByRefs', () => {
  it('writes memory_symbol_refs for a file::symbol ref', () => {
    index.upsertFile('src/core/store.ts', 'typescript', 'h1', Date.now());
    index.upsertSymbols(
      'src/core/store.ts',
      [makeSymbol({ name: 'writePending', qualifiedName: 'writePending', hash: 'hash-wp' })],
      []
    );

    index.linkMemoryByRefs('lesson/2026-01-01-test.md', ['src/core/store.ts::writePending']);

    const rows = (index as any).db
      .prepare('SELECT * FROM memory_symbol_refs WHERE memory_path = ?')
      .all('lesson/2026-01-01-test.md') as { memory_path: string; symbol_hash: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].symbol_hash).toBe('hash-wp');
  });

  it('writes memory_symbol_refs for a file-level ref (no symbol name)', () => {
    index.upsertFile('src/core/store.ts', 'typescript', 'h1', Date.now());
    index.upsertSymbols(
      'src/core/store.ts',
      [
        makeSymbol({ name: 'writeMemory', qualifiedName: 'writeMemory', hash: 'hash-wm' }),
        makeSymbol({ name: 'writePending', qualifiedName: 'writePending', hash: 'hash-wp' }),
      ],
      []
    );

    index.linkMemoryByRefs('lesson/file-ref.md', ['src/core/store.ts']);

    const rows = (index as any).db
      .prepare('SELECT symbol_hash FROM memory_symbol_refs WHERE memory_path = ?')
      .all('lesson/file-ref.md') as { symbol_hash: string }[];
    // Both symbols from that file should be linked
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('silently skips refs that do not match any indexed symbol', () => {
    expect(() => {
      index.linkMemoryByRefs('lesson/missing.md', ['src/nonexistent.ts::ghost']);
    }).not.toThrow();

    const rows = (index as any).db
      .prepare('SELECT * FROM memory_symbol_refs WHERE memory_path = ?')
      .all('lesson/missing.md') as unknown[];
    expect(rows).toHaveLength(0);
  });

  it('replaces existing refs on re-link (idempotent)', () => {
    index.upsertFile('src/core/store.ts', 'typescript', 'h1', Date.now());
    index.upsertSymbols(
      'src/core/store.ts',
      [makeSymbol({ name: 'writePending', qualifiedName: 'writePending', hash: 'hash-wp' })],
      []
    );

    index.linkMemoryByRefs('lesson/idem.md', ['src/core/store.ts::writePending']);
    index.linkMemoryByRefs('lesson/idem.md', ['src/core/store.ts::writePending']);

    const rows = (index as any).db
      .prepare('SELECT * FROM memory_symbol_refs WHERE memory_path = ?')
      .all('lesson/idem.md') as unknown[];
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/code-index.test.ts --no-coverage -t "linkMemoryByRefs"
```

Expected: FAIL — `linkMemoryByRefs is not a function`

- [ ] **Step 3: Implement `linkMemoryByRefs` in `src/engines/code-index.ts`**

Add the method after `linkMemory` (around line 300):

```typescript
linkMemoryByRefs(memoryPath: string, refs: string[]): void {
  const hashes: string[] = [];

  for (const ref of refs) {
    const sepIdx = ref.indexOf('::');
    const filePath = sepIdx === -1 ? ref : ref.slice(0, sepIdx);
    const symbolName = sepIdx === -1 ? null : ref.slice(sepIdx + 2);

    if (symbolName) {
      // file::symbol — look up by file path + symbol name
      const row = this.db
        .prepare(
          `SELECT s.hash FROM symbols s
           JOIN files f ON s.file_id = f.id
           WHERE f.path = ? AND s.name = ? AND s.hash IS NOT NULL
           LIMIT 1`
        )
        .get(filePath, symbolName) as { hash: string } | undefined;
      if (row) hashes.push(row.hash);
    } else {
      // file-level — link all exported symbols in the file
      const rows = this.db
        .prepare(
          `SELECT s.hash FROM symbols s
           JOIN files f ON s.file_id = f.id
           WHERE f.path = ? AND s.hash IS NOT NULL`
        )
        .all(filePath) as { hash: string }[];
      hashes.push(...rows.map((r) => r.hash));
    }
  }

  if (hashes.length === 0) return;

  const tx = this.db.transaction(() => {
    this.db
      .prepare('DELETE FROM memory_symbol_refs WHERE memory_path = ?')
      .run(memoryPath);
    const ins = this.db.prepare(
      'INSERT OR IGNORE INTO memory_symbol_refs (memory_path, symbol_hash) VALUES (?, ?)'
    );
    for (const hash of hashes) {
      ins.run(memoryPath, hash);
    }
  });
  tx();
}
```

- [ ] **Step 4: Run tests to pass**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/code-index.test.ts --no-coverage -t "linkMemoryByRefs"
```

Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck**

```
npm run typecheck
```

Expected: no errors

- [ ] **Step 6: Commit**

```
git add src/engines/code-index.ts tests/code-index.test.ts
git commit -m "feat(code-index): add linkMemoryByRefs to resolve file::symbol refs to symbol_hash rows"
```

---

### Task 4: Branch `writeMemory` to use `linkMemoryByRefs` when `codeRefs` is present

**Files:**

- Modify: `src/core/store.ts`
- Modify: `tests/store.test.ts`

- [ ] **Step 1: Write failing test**

Open `tests/store.test.ts` and add a new `describe` block:

```typescript
describe('writeMemory codeRefs branching', () => {
  it('calls linkMemoryByRefs (not linkMemory) when codeRefs is present', async () => {
    // We verify the branch by checking memory_symbol_refs directly
    // This requires better-sqlite3 (always available in test env)
    const { CodeIndex } = await import('../src/engines/code-index');
    const repo = makeTempRepo(); // use the existing makeTempRepo() helper in store.test.ts
    const dbPath = path.join(repo, 'meta', 'code-index.db');

    // Seed the code index with a symbol so linkMemoryByRefs can resolve it
    const idx = new CodeIndex(dbPath);
    idx.upsertFile('src/core/store.ts', 'typescript', 'h1', Date.now());
    idx.upsertSymbols(
      'src/core/store.ts',
      [
        {
          name: 'writePending',
          qualifiedName: 'writePending',
          kind: 'function',
          file: 'src/core/store.ts',
          lineStart: 23,
          lineEnd: 34,
          isExported: true,
          hash: 'hash-wp-test',
        },
      ],
      []
    );
    idx.close();

    // Write a memory with explicit codeRefs
    const { writeMemory } = await import('../src/core/store');
    writeMemory(repo, {
      name: 'test-coderefs',
      type: 'lesson',
      description: 'A test memory with code refs',
      tags: [],
      confidence: 'high',
      content: '## Body',
      created: new Date().toISOString(),
      codeRefs: ['src/core/store.ts::writePending'],
    });

    // Verify memory_symbol_refs was written via explicit ref (not FTS)
    const idx2 = new CodeIndex(dbPath);
    const rows = (idx2 as any).db.prepare('SELECT symbol_hash FROM memory_symbol_refs').all() as {
      symbol_hash: string;
    }[];
    idx2.close();

    expect(rows.some((r) => r.symbol_hash === 'hash-wp-test')).toBe(true);
    fs.rmSync(repo, { recursive: true });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/store.test.ts --no-coverage -t "codeRefs branching"
```

Expected: FAIL — `linkMemoryByRefs` not called (FTS fallback produces different result)

- [ ] **Step 3: Update the `linkMemory` call in `writeMemory` (`src/core/store.ts`)**

Find the `CodeIndexModule` interface and `require('../engines/code-index')` block (around line 69–88). Update the interface and the call:

```typescript
// Replace the existing CodeIndexModule interface:
interface CodeIndexModule {
  CodeIndex: {
    new (dbPath: string): {
      linkMemory(memPath: string, text: string): void;
      linkMemoryByRefs(memPath: string, refs: string[]): void;
      close(): void;
    };
    getDbPath(repoRoot: string): string;
  };
}
```

Replace the single `idx.linkMemory(...)` call with a branch:

```typescript
// Replace:
//   idx.linkMemory(path.relative(repoRoot, filePath), memory.description);
// With:
const memRelPath = path.relative(repoRoot, filePath);
if (memory.codeRefs && memory.codeRefs.length > 0) {
  idx.linkMemoryByRefs(memRelPath, memory.codeRefs);
} else {
  idx.linkMemory(memRelPath, memory.description);
}
```

- [ ] **Step 4: Run tests to pass**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/store.test.ts --no-coverage -t "codeRefs branching"
```

Expected: PASS

- [ ] **Step 5: Run full store test suite**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/store.test.ts --no-coverage
```

Expected: all store tests pass

- [ ] **Step 6: Typecheck**

```
npm run typecheck
```

Expected: no errors

- [ ] **Step 7: Commit**

```
git add src/core/store.ts tests/store.test.ts
git commit -m "fix(store): branch writeMemory on codeRefs presence — use linkMemoryByRefs when explicit refs available"
```

---

## Chunk 3: P2 + P3 — Human-readable refs format and recall display

### Task 5: Change `codeRefs` format from hash to `file::symbolName` in `write.ts`

**Files:**

- Modify: `src/commands/write.ts`

- [ ] **Step 1: Locate the hash assignment**

Find line 183 of `src/commands/write.ts`:

```typescript
// Current (stores opaque hash):
memoryData.codeRefs = [syms[0].symbol.hash];
```

- [ ] **Step 2: Replace with human-readable format**

```typescript
// Replace with file::symbolName format:
const sym = syms[0].symbol;
const ref = sym.name ? `${sym.file}::${sym.name}` : sym.file;
memoryData.codeRefs = [ref];
if (!options.silent) {
  console.log(`✓ Anchored to symbol: ${sym.qualifiedName} (${ref})`);
}
```

Remove the old `console.log` line that was below the hash assignment (which printed the hash slice).

- [ ] **Step 3: Typecheck**

```
npm run typecheck
```

Expected: no errors

- [ ] **Step 4: Smoke test**

If you have a code index available on a test repo, verify:

```bash
memo write --name test-anchor --description "test" --content "## body" --symbol "writeMemory"
```

Open the written `.md` file — frontmatter should contain `codeRefs: ['src/core/store.ts::writeMemory']`, not a hash.

- [ ] **Step 5: Commit**

```
git add src/commands/write.ts
git commit -m "fix(write): change codeRefs format from opaque symbol hash to human-readable file::symbolName"
```

---

### Task 6: Render `codeRefs` inline in recall output

**Files:**

- Modify: `src/core/retriever.ts`
- Modify: `tests/recall.test.ts`

- [ ] **Step 1: Write failing test**

Open `tests/recall.test.ts` and add:

```typescript
// Add this import to the test file's import block:
// import { loadConfig } from '../src/config';

describe('recall codeRefs display', () => {
  it('includes code refs line in markdown when memory has codeRefs', async () => {
    const { recall } = await import('../src/core/retriever');
    const { loadConfig } = await import('../src/core/config');
    const repo = makeTempRepo('text'); // pass required 'text' engine argument
    const { writeMemory } = await import('../src/core/store');
    writeMemory(repo, {
      name: 'anchored-memory',
      type: 'lesson',
      description: 'A memory with code refs',
      tags: [],
      confidence: 'high',
      content: '## Body\nSomething important.',
      created: new Date().toISOString(),
      codeRefs: ['src/core/store.ts::writeMemory'],
    });

    const config = loadConfig(repo);
    const result = await recall('anchored-memory', repo, config);
    expect(result.markdown).toContain('src/core/store.ts::writeMemory');
    fs.rmSync(repo, { recursive: true });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/recall.test.ts --no-coverage -t "codeRefs display"
```

Expected: FAIL — markdown does not contain the code ref

- [ ] **Step 3: Update `formatResultsAsMarkdown` in `src/core/retriever.ts`**

Find the loop body in `formatResultsAsMarkdown` that renders each memory (around line 168). After the description line (`markdown += '> ${memory.description}\n'`), add:

```typescript
if (memory.codeRefs && memory.codeRefs.length > 0) {
  const refStr = memory.codeRefs.map((r) => `\`${r}\``).join(' · ');
  markdown += `> 📎 ${refStr}\n`;
}
```

The full loop body then reads:

```typescript
markdown += `### [score: ${score.toFixed(2)}${sourcePart}] ${memory.name}${confidenceStr}\n`;
// ...explain block...
markdown += `> ${memory.description}\n`;
if (memory.codeRefs && memory.codeRefs.length > 0) {
  const refStr = memory.codeRefs.map((r) => `\`${r}\``).join(' · ');
  markdown += `> 📎 ${refStr}\n`;
}
markdown += `> \`${relativePath}\`${tagStr}\n\n`;
```

- [ ] **Step 4: Run tests to pass**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/recall.test.ts --no-coverage -t "codeRefs display"
```

Expected: PASS

- [ ] **Step 5: Run full recall test suite**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/recall.test.ts --no-coverage
```

Expected: all tests pass

- [ ] **Step 6: Typecheck**

```
npm run typecheck
```

Expected: no errors

- [ ] **Step 7: Commit**

```
git add src/core/retriever.ts tests/recall.test.ts
git commit -m "feat(recall): render codeRefs inline in recall output below each memory description"
```

---

## Chunk 4: P4 — `memo code-context` reverse-lookup command

### Task 7: Implement `code-context` command

Given a file path or symbol name, returns all memories that reference it via `memory_symbol_refs`.

**Files:**

- Create: `src/commands/code-context.ts`
- Create: `tests/code-context.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/code-context.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CodeIndex } from '../src/engines/code-index';
import { writeMemory } from '../src/core/store';
import type { CodeSymbol } from '../src/types';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-codeCtx-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'meta', 'config.yaml'),
    'project:\n  name: test\nembedding:\n  engine: text\nmemory:\n  token_budget: 4000\n  top_k: 10\n'
  );
  return dir;
}

function seedIndex(repo: string, sym: Partial<CodeSymbol> & { hash: string }): CodeIndex {
  const dbPath = path.join(repo, 'meta', 'code-index.db');
  const idx = new CodeIndex(dbPath);
  idx.upsertFile(sym.file ?? 'src/core/store.ts', 'typescript', 'h1', Date.now());
  idx.upsertSymbols(
    sym.file ?? 'src/core/store.ts',
    [
      {
        name: sym.name ?? 'writeMemory',
        qualifiedName: sym.name ?? 'writeMemory',
        kind: 'function',
        file: sym.file ?? 'src/core/store.ts',
        lineStart: 36,
        lineEnd: 91,
        isExported: true,
        hash: sym.hash,
      },
    ],
    []
  );
  return idx;
}

describe('code-context command', () => {
  it('returns memories linked to a specific symbol', async () => {
    const { codeContext } = await import('../src/commands/code-context');
    const repo = makeTempRepo();

    // Write a memory and link it to the symbol via memory_symbol_refs
    const written = writeMemory(repo, {
      name: 'write-memory-design',
      type: 'decision',
      description: 'Decision about writeMemory implementation',
      tags: [],
      confidence: 'high',
      content: '## Decision\nUse writeMemory for all writes.',
      created: new Date().toISOString(),
    });

    const idx = seedIndex(repo, {
      hash: 'hash-wm',
      name: 'writeMemory',
      file: 'src/core/store.ts',
    });
    const relMemPath = path.relative(repo, written);
    (idx as any).db
      .prepare('INSERT OR IGNORE INTO memory_symbol_refs (memory_path, symbol_hash) VALUES (?, ?)')
      .run(relMemPath, 'hash-wm');
    idx.close();

    const results = await codeContext({ query: 'src/core/store.ts::writeMemory', repo });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((m) => m.name === 'write-memory-design')).toBe(true);

    fs.rmSync(repo, { recursive: true });
  });

  it('returns memories linked to all symbols in a file (no :: separator)', async () => {
    const { codeContext } = await import('../src/commands/code-context');
    const repo = makeTempRepo();

    const written = writeMemory(repo, {
      name: 'store-design',
      type: 'architecture',
      description: 'Store module design',
      tags: [],
      confidence: 'high',
      content: '## Architecture\nStore is the single write point.',
      created: new Date().toISOString(),
    });

    const idx = seedIndex(repo, {
      hash: 'hash-wm2',
      name: 'writePending',
      file: 'src/core/store.ts',
    });
    const relMemPath = path.relative(repo, written);
    (idx as any).db
      .prepare('INSERT OR IGNORE INTO memory_symbol_refs (memory_path, symbol_hash) VALUES (?, ?)')
      .run(relMemPath, 'hash-wm2');
    idx.close();

    const results = await codeContext({ query: 'src/core/store.ts', repo });
    expect(results.some((m) => m.name === 'store-design')).toBe(true);

    fs.rmSync(repo, { recursive: true });
  });

  it('returns empty array when no code index exists', async () => {
    const { codeContext } = await import('../src/commands/code-context');
    const repo = makeTempRepo();
    // No code-index.db created
    const results = await codeContext({ query: 'src/any.ts', repo });
    expect(results).toEqual([]);
    fs.rmSync(repo, { recursive: true });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/code-context.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../src/commands/code-context'`

- [ ] **Step 3: Create `src/commands/code-context.ts`**

```typescript
// src/commands/code-context.ts
import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot } from '../core/dir-resolver';
import { loadFile } from '../core/memory-loader';
import type { MemoryFile } from '../types';

export interface CodeContextOptions {
  query: string; // "src/core/store.ts" or "src/core/store.ts::writeMemory"
  repo?: string;
  format?: 'text' | 'json';
}

export async function codeContext(options: CodeContextOptions): Promise<MemoryFile[]> {
  const repoRoot = findRepoRoot(process.cwd(), options.repo);

  let dbPath: string;
  try {
    const { CodeIndex } = await import('../engines/code-index');
    dbPath = CodeIndex.getDbPath(repoRoot);
  } catch {
    return [];
  }

  if (!fs.existsSync(dbPath)) return [];

  const { CodeIndex } = await import('../engines/code-index');
  const idx = new CodeIndex(dbPath);

  try {
    const ref = options.query;
    const sepIdx = ref.indexOf('::');
    const filePath = sepIdx === -1 ? ref : ref.slice(0, sepIdx);
    const symbolName = sepIdx === -1 ? null : ref.slice(sepIdx + 2);

    // Resolve matching symbol hashes
    let hashes: string[];
    if (symbolName) {
      const rows = (idx as any).db
        .prepare(
          `SELECT s.hash FROM symbols s
           JOIN files f ON s.file_id = f.id
           WHERE f.path = ? AND s.name = ? AND s.hash IS NOT NULL`
        )
        .all(filePath, symbolName) as { hash: string }[];
      hashes = rows.map((r) => r.hash);
    } else {
      const rows = (idx as any).db
        .prepare(
          `SELECT s.hash FROM symbols s
           JOIN files f ON s.file_id = f.id
           WHERE f.path = ? AND s.hash IS NOT NULL`
        )
        .all(filePath) as { hash: string }[];
      hashes = rows.map((r) => r.hash);
    }

    if (hashes.length === 0) return [];

    // Look up memory paths from memory_symbol_refs
    const placeholders = hashes.map(() => '?').join(',');
    const memRows = (idx as any).db
      .prepare(
        `SELECT DISTINCT memory_path FROM memory_symbol_refs
         WHERE symbol_hash IN (${placeholders})`
      )
      .all(...hashes) as { memory_path: string }[];

    // Load memory files
    const memories: MemoryFile[] = [];
    for (const { memory_path } of memRows) {
      const absPath = path.join(repoRoot, memory_path);
      if (fs.existsSync(absPath)) {
        try {
          memories.push(loadFile(absPath));
        } catch {
          // skip unreadable files
        }
      }
    }
    return memories;
  } finally {
    idx.close();
  }
}
```

- [ ] **Step 4: Run tests to pass**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/code-context.test.ts --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck**

```
npm run typecheck
```

Expected: no errors

- [ ] **Step 6: Commit**

```
git add src/commands/code-context.ts tests/code-context.test.ts
git commit -m "feat(code-context): add memo code-context reverse-lookup command (file/symbol → linked memories)"
```

---

### Task 8: Register `code-context` in CLI

**Files:**

- Modify: `src/cli.ts`

- [ ] **Step 1: Add import and register command**

Add the import near the top of `src/cli.ts` (alongside other command imports):

```typescript
import { codeContext } from './commands/code-context';
import type { CodeContextOptions } from './commands/code-context';
```

Register the command (after the existing `write` or `refs` command):

```typescript
// memo code-context command
program
  .command('code-context <query>')
  .description('Find memories linked to a file or symbol (e.g. src/core/store.ts::writeMemory)')
  .option('--format <fmt>', 'Output format: text | json', 'text')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (query: string, options: { format?: string; repo?: string }) => {
    try {
      const memories = await codeContext({
        query,
        format: (options.format ?? 'text') as CodeContextOptions['format'],
        repo: options.repo,
      });
      if (memories.length === 0) {
        console.log('No memories linked to this file or symbol.');
        return;
      }
      if (options.format === 'json') {
        console.log(JSON.stringify(memories, null, 2));
        return;
      }
      for (const m of memories) {
        console.log(`→ [${m.type}] ${m.name}`);
        console.log(`  ${m.description}`);
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });
```

- [ ] **Step 2: Typecheck and build**

```
npm run typecheck && npm run build
```

Expected: no errors

- [ ] **Step 3: Smoke test**

```
node dist/cli.js code-context --help
```

Expected: help text showing `<query>`, `--format`, `--repo` options

- [ ] **Step 4: Run full test suite**

```
npm test
```

Expected: all tests pass; coverage thresholds met

- [ ] **Step 5: Commit**

```
git add src/cli.ts
git commit -m "feat(cli): register memo code-context command"
```

---

## Verification Checklist

Before marking this plan complete:

- [ ] `npm run typecheck` — no errors
- [ ] `npm run lint` — no errors
- [ ] `npm test` — all tests pass
- [ ] `node dist/cli.js code-context --help` — shows correct usage
- [ ] Write a memory with `--code-refs` flag: `memo remember --name test --description x --content y --code-refs src/core/store.ts::writePending`
- [ ] Verify the memory frontmatter contains `codeRefs: [src/core/store.ts::writePending]` (not a hash)
- [ ] Run `memo recall "test"` and verify output contains `📎 \`src/core/store.ts::writePending\``
- [ ] Run `memo code-context src/core/store.ts::writePending` and verify the test memory appears
