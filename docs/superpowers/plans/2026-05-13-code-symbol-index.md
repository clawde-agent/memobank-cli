# Code Symbol Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dual-track recall to memobank — tree-sitter parses code into a SQLite FTS5 index, `memo index` populates it, `memo recall --code` searches both memories and code symbols in parallel.

**Architecture:** New command `memo index [path]` runs tree-sitter across 7 languages and writes to `.memobank/meta/code-index.db` (SQLite, local only). `memo recall --code` runs memory search and code-index FTS5 search in parallel, merges results score-normalized. `memo recall --refs <symbol>` queries the call-graph edges table.

**Tech Stack:** `better-sqlite3` (sync SQLite), `tree-sitter` + 7 grammar packages (all `optionalDependencies`), TypeScript, Jest.

---

## File Map

| Action | Path                          | Responsibility                                        |
| ------ | ----------------------------- | ----------------------------------------------------- |
| Create | `src/types.ts`                | Add `CodeSymbol`, `CodeEdge`, `SymbolResult`          |
| Create | `src/engines/code-index.ts`   | SQLite open/init/upsert/search/getRefs                |
| Create | `src/core/code-scanner.ts`    | tree-sitter parse → `CodeSymbol[]` + `CodeEdge[]`     |
| Create | `src/core/result-merger.ts`   | Normalize + merge `RecallResult[]` + `SymbolResult[]` |
| Create | `src/commands/code-scan.ts`   | Orchestrate scan → index → optional `--summarize`     |
| Modify | `src/cli.ts`                  | Register `memo index` command                         |
| Modify | `src/commands/recall.ts`      | Add `--code` and `--refs` options                     |
| Modify | `src/core/retriever.ts`       | Parallel dual-track, symbol formatter                 |
| Modify | `package.json`                | Add `optionalDependencies` + `@types/better-sqlite3`  |
| Create | `tests/code-index.test.ts`    | Unit tests for SQLite engine                          |
| Create | `tests/code-scanner.test.ts`  | Unit tests for AST extraction                         |
| Create | `tests/result-merger.test.ts` | Unit tests for score merging                          |
| Create | `tests/code-scan.test.ts`     | Integration test for `codeScanCommand`                |

---

## Task 1: Types + Dependencies

**Files:**

- Modify: `src/types.ts`
- Modify: `package.json`

- [ ] **Step 1: Add new types to `src/types.ts`**

Append to the end of the file:

```typescript
export type SymbolKind = 'fn' | 'class' | 'interface' | 'type' | 'const' | 'method';
export type EdgeKind = 'calls' | 'imports' | 'inherits';
export type IndexedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'yaml'
  | 'csharp';

export interface CodeSymbol {
  name: string;
  qualifiedName: string; // "ClassName.methodName" or same as name for top-level
  kind: SymbolKind;
  file: string; // relative path from scan root
  lineStart: number;
  lineEnd: number;
  signature: string;
  docstring: string; // up to 3 lines
  isExported: boolean;
  parentName?: string; // for methods: the class name
  memoryRefs?: string; // comma-separated memory filenames
}

export interface CodeEdge {
  sourceName: string; // qualified name of caller
  sourceFile: string;
  targetName: string; // name of callee (may be unresolved)
  kind: EdgeKind;
  line: number;
}

export interface SymbolResult {
  symbol: CodeSymbol;
  score: number; // 0–1, FTS5 rank normalized
}

export interface CodeScanOptions {
  summarize?: boolean;
  force?: boolean;
  langs?: string;
  repo?: string;
}

export interface RefsOptions {
  repo?: string;
  format?: string;
}
```

- [ ] **Step 2: Add `optionalDependencies` and `@types/better-sqlite3` to `package.json`**

Open `package.json`. Add to the `"devDependencies"` section:

```json
"@types/better-sqlite3": "^7.6.x"
```

Add a new top-level `"optionalDependencies"` section:

```json
"optionalDependencies": {
  "better-sqlite3": "^9.4.x",
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

- [ ] **Step 3: Install optional dependencies**

```bash
npm install --include=optional
```

Expected: `better-sqlite3`, `tree-sitter`, and grammar packages appear in `node_modules/`.

- [ ] **Step 4: Verify TypeScript still compiles**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts package.json package-lock.json
git commit -m "feat(code-index): add CodeSymbol/SymbolResult types and optional deps"
```

---

## Task 2: SQLite Code Index Engine

**Files:**

- Create: `src/engines/code-index.ts`
- Create: `tests/code-index.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/code-index.test.ts`:

```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CodeIndex } from '../src/engines/code-index';
import type { CodeSymbol, CodeEdge } from '../src/types';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memo-codeindex-'));
}

function makeSymbol(overrides: Partial<CodeSymbol> = {}): CodeSymbol {
  return {
    name: 'findRepoRoot',
    qualifiedName: 'findRepoRoot',
    kind: 'fn',
    file: 'src/core/store.ts',
    lineStart: 42,
    lineEnd: 67,
    signature: 'findRepoRoot(cwd: string, repoFlag?: string): string',
    docstring: 'Resolve memobank repo root by walking up from cwd',
    isExported: true,
    ...overrides,
  };
}

describe('CodeIndex', () => {
  let tmpDir: string;
  let index: CodeIndex;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    index = new CodeIndex(path.join(tmpDir, 'code-index.db'));
  });

  afterEach(() => {
    index.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('initializes schema without error', () => {
    expect(() => new CodeIndex(path.join(tmpDir, 'code-index.db'))).not.toThrow();
  });

  it('upserts a file and its symbols', () => {
    const sym = makeSymbol();
    index.upsertFile('src/core/store.ts', 'typescript', 'abc123', Date.now());
    index.upsertSymbols('src/core/store.ts', [sym], []);
    const results = index.search('findRepoRoot', 5);
    expect(results).toHaveLength(1);
    expect(results[0].symbol.name).toBe('findRepoRoot');
    expect(results[0].symbol.signature).toContain('cwd: string');
  });

  it('returns score between 0 and 1', () => {
    index.upsertFile('src/core/store.ts', 'typescript', 'abc123', Date.now());
    index.upsertSymbols('src/core/store.ts', [makeSymbol()], []);
    const results = index.search('findRepoRoot', 5);
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].score).toBeLessThanOrEqual(1);
  });

  it('cascades delete symbols when file is removed', () => {
    index.upsertFile('src/core/store.ts', 'typescript', 'abc123', Date.now());
    index.upsertSymbols('src/core/store.ts', [makeSymbol()], []);
    index.deleteFile('src/core/store.ts');
    const results = index.search('findRepoRoot', 5);
    expect(results).toHaveLength(0);
  });

  it('upserts edges and returns refs', () => {
    index.upsertFile('src/core/store.ts', 'typescript', 'abc123', Date.now());
    index.upsertFile('src/cli.ts', 'typescript', 'def456', Date.now());
    const caller = makeSymbol({ name: 'main', qualifiedName: 'main', file: 'src/cli.ts' });
    const callee = makeSymbol();
    index.upsertSymbols('src/core/store.ts', [callee], []);
    index.upsertSymbols(
      'src/cli.ts',
      [caller],
      [
        {
          sourceName: 'main',
          sourceFile: 'src/cli.ts',
          targetName: 'findRepoRoot',
          kind: 'calls',
          line: 10,
        },
      ]
    );
    const refs = index.getRefs('findRepoRoot');
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0].symbol.name).toBe('main');
  });

  it('skips unchanged files (same hash)', () => {
    index.upsertFile('src/core/store.ts', 'typescript', 'abc123', Date.now());
    const changed = index.needsReindex('src/core/store.ts', 'abc123');
    expect(changed).toBe(false);
  });

  it('flags changed files (different hash)', () => {
    index.upsertFile('src/core/store.ts', 'typescript', 'abc123', Date.now());
    const changed = index.needsReindex('src/core/store.ts', 'newHash');
    expect(changed).toBe(true);
  });

  it('isAvailable returns true when better-sqlite3 is installed', () => {
    expect(CodeIndex.isAvailable()).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/code-index.test.ts -v
```

Expected: FAIL — `Cannot find module '../src/engines/code-index'`

- [ ] **Step 3: Implement `src/engines/code-index.ts`**

```typescript
import * as path from 'path';
import type { CodeSymbol, CodeEdge, SymbolResult } from '../types';

const SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS files (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  path     TEXT NOT NULL UNIQUE,
  language TEXT,
  hash     TEXT,
  mtime    REAL
);
CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);

CREATE TABLE IF NOT EXISTS symbols (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id        INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  qualified_name TEXT,
  kind           TEXT NOT NULL,
  signature      TEXT,
  docstring      TEXT,
  line_start     INTEGER,
  line_end       INTEGER,
  is_exported    INTEGER DEFAULT 1,
  parent_id      INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
  memory_refs    TEXT
);
CREATE INDEX IF NOT EXISTS idx_symbols_file  ON symbols(file_id);
CREATE INDEX IF NOT EXISTS idx_symbols_name  ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_qname ON symbols(qualified_name);
CREATE INDEX IF NOT EXISTS idx_symbols_kind  ON symbols(kind);

CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
  name, qualified_name, signature, docstring,
  content='symbols',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS symbols_ai AFTER INSERT ON symbols BEGIN
  INSERT INTO symbols_fts(rowid, name, qualified_name, signature, docstring)
  VALUES (new.id, new.name, new.qualified_name, new.signature, new.docstring);
END;
CREATE TRIGGER IF NOT EXISTS symbols_ad AFTER DELETE ON symbols BEGIN
  INSERT INTO symbols_fts(symbols_fts, rowid, name, qualified_name, signature, docstring)
  VALUES ('delete', old.id, old.name, old.qualified_name, old.signature, old.docstring);
END;
CREATE TRIGGER IF NOT EXISTS symbols_au AFTER UPDATE ON symbols BEGIN
  INSERT INTO symbols_fts(symbols_fts, rowid, name, qualified_name, signature, docstring)
  VALUES ('delete', old.id, old.name, old.qualified_name, old.signature, old.docstring);
  INSERT INTO symbols_fts(rowid, name, qualified_name, signature, docstring)
  VALUES (new.id, new.name, new.qualified_name, new.signature, new.docstring);
END;

CREATE TABLE IF NOT EXISTS edges (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id   INTEGER NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  target_id   INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
  target_name TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'calls',
  line        INTEGER
);
CREATE INDEX IF NOT EXISTS idx_edges_source      ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target      ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_target_name ON edges(target_name);
`;

export class CodeIndex {
  private db: any;

  constructor(dbPath: string) {
    const Database = require('better-sqlite3');
    this.db = new Database(dbPath);
    this.db.exec(SCHEMA);
  }

  static isAvailable(): boolean {
    try {
      require('better-sqlite3');
      return true;
    } catch {
      return false;
    }
  }

  static getDbPath(repoRoot: string): string {
    return path.join(repoRoot, 'meta', 'code-index.db');
  }

  close(): void {
    this.db.close();
  }

  needsReindex(filePath: string, hash: string): boolean {
    const row = this.db.prepare('SELECT hash FROM files WHERE path = ?').get(filePath) as
      | { hash: string }
      | undefined;
    if (!row) return true;
    return row.hash !== hash;
  }

  upsertFile(filePath: string, language: string, hash: string, mtime: number): void {
    this.db
      .prepare(
        `INSERT INTO files (path, language, hash, mtime)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET language=excluded.language, hash=excluded.hash, mtime=excluded.mtime`
      )
      .run(filePath, language, hash, mtime);
  }

  deleteFile(filePath: string): void {
    this.db.prepare('DELETE FROM files WHERE path = ?').run(filePath);
  }

  upsertSymbols(filePath: string, symbols: CodeSymbol[], edges: CodeEdge[]): void {
    const file = this.db.prepare('SELECT id FROM files WHERE path = ?').get(filePath) as
      | { id: number }
      | undefined;
    if (!file) return;

    // Remove old symbols for this file (triggers cascade to FTS + edges)
    this.db.prepare('DELETE FROM symbols WHERE file_id = ?').run(file.id);

    const insertSymbol = this.db.prepare(
      `INSERT INTO symbols
         (file_id, name, qualified_name, kind, signature, docstring, line_start, line_end, is_exported, memory_refs)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertEdge = this.db.prepare(
      `INSERT INTO edges (source_id, target_name, kind, line) VALUES (?, ?, ?, ?)`
    );

    const insertMany = this.db.transaction(() => {
      const idMap = new Map<string, number>();

      for (const sym of symbols) {
        const result = insertSymbol.run(
          file.id,
          sym.name,
          sym.qualifiedName,
          sym.kind,
          sym.signature ?? null,
          sym.docstring ?? null,
          sym.lineStart,
          sym.lineEnd,
          sym.isExported ? 1 : 0,
          sym.memoryRefs ?? null
        );
        idMap.set(sym.qualifiedName, result.lastInsertRowid as number);
      }

      for (const edge of edges) {
        const sourceId = idMap.get(edge.sourceName);
        if (sourceId === undefined) continue;
        insertEdge.run(sourceId, edge.targetName, edge.kind, edge.line);
      }
    });

    insertMany();
  }

  search(query: string, topK: number): SymbolResult[] {
    const rows = this.db
      .prepare(
        `SELECT s.name, s.qualified_name, s.kind, f.path AS file, s.line_start, s.line_end,
                s.signature, s.docstring, s.is_exported, s.memory_refs,
                rank AS fts_rank
         FROM symbols_fts
         JOIN symbols s ON symbols_fts.rowid = s.id
         JOIN files   f ON s.file_id = f.id
         WHERE symbols_fts MATCH ?
         ORDER BY rank
         LIMIT ?`
      )
      .all(query, topK) as any[];

    if (rows.length === 0) return [];

    // Normalize FTS rank (negative, lower = better) to 0–1
    const ranks = rows.map((r) => r.fts_rank as number);
    const minRank = Math.min(...ranks);
    const maxRank = Math.max(...ranks);
    const range = maxRank - minRank || 1;

    return rows.map((r) => ({
      symbol: {
        name: r.name as string,
        qualifiedName: r.qualified_name as string,
        kind: r.kind as any,
        file: r.file as string,
        lineStart: r.line_start as number,
        lineEnd: r.line_end as number,
        signature: r.signature as string,
        docstring: r.docstring as string,
        isExported: Boolean(r.is_exported),
        memoryRefs: r.memory_refs as string | undefined,
      },
      score: 1 - (r.fts_rank - minRank) / range,
    }));
  }

  getRefs(symbolName: string): SymbolResult[] {
    const rows = this.db
      .prepare(
        `SELECT s.name, s.qualified_name, s.kind, f.path AS file,
                s.line_start, s.line_end, s.signature, s.docstring, s.is_exported, s.memory_refs
         FROM edges e
         JOIN symbols s ON e.source_id = s.id
         JOIN files   f ON s.file_id = f.id
         WHERE e.target_name = ?
         LIMIT 50`
      )
      .all(symbolName) as any[];

    return rows.map((r) => ({
      symbol: {
        name: r.name as string,
        qualifiedName: r.qualified_name as string,
        kind: r.kind as any,
        file: r.file as string,
        lineStart: r.line_start as number,
        lineEnd: r.line_end as number,
        signature: r.signature as string,
        docstring: r.docstring as string,
        isExported: Boolean(r.is_exported),
        memoryRefs: r.memory_refs as string | undefined,
      },
      score: 1.0,
    }));
  }

  getStats(): { files: number; symbols: number; edges: number } {
    const files = (this.db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }).n;
    const syms = (this.db.prepare('SELECT COUNT(*) AS n FROM symbols').get() as { n: number }).n;
    const edges = (this.db.prepare('SELECT COUNT(*) AS n FROM edges').get() as { n: number }).n;
    return { files, symbols: syms, edges };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/code-index.test.ts -v
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/code-index.ts tests/code-index.test.ts
git commit -m "feat(code-index): SQLite FTS5 engine — upsert/search/getRefs/cascade"
```

---

## Task 3: Tree-sitter Code Scanner

**Files:**

- Create: `src/core/code-scanner.ts`
- Create: `tests/code-scanner.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/code-scanner.test.ts`:

```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scanFile, detectLanguage, SUPPORTED_EXTENSIONS } from '../src/core/code-scanner';

function makeTmpFile(ext: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-scanner-'));
  const file = path.join(dir, `test${ext}`);
  fs.writeFileSync(file, content);
  return file;
}

describe('detectLanguage', () => {
  it('detects typescript from .ts extension', () => {
    expect(detectLanguage('src/core/store.ts')).toBe('typescript');
  });

  it('detects python from .py extension', () => {
    expect(detectLanguage('scripts/build.py')).toBe('python');
  });

  it('returns null for unsupported extension', () => {
    expect(detectLanguage('file.java')).toBeNull();
  });

  it('SUPPORTED_EXTENSIONS includes .tsx', () => {
    expect(SUPPORTED_EXTENSIONS.has('.tsx')).toBe(true);
  });
});

describe('scanFile — TypeScript', () => {
  it('extracts exported function with signature and docstring', () => {
    const src = `
/**
 * Resolve repo root by walking up from cwd
 */
export function findRepoRoot(cwd: string, repoFlag?: string): string {
  return cwd;
}
`;
    const file = makeTmpFile('.ts', src);
    const { symbols } = scanFile(file, path.dirname(file));
    const fn = symbols.find((s) => s.name === 'findRepoRoot');
    expect(fn).toBeDefined();
    expect(fn!.kind).toBe('fn');
    expect(fn!.isExported).toBe(true);
    expect(fn!.signature).toContain('findRepoRoot');
    expect(fn!.docstring).toContain('Resolve repo root');
    fs.rmSync(path.dirname(file), { recursive: true });
  });

  it('extracts class with methods', () => {
    const src = `
export class TextEngine {
  async search(query: string): Promise<string[]> {
    return [];
  }
}
`;
    const file = makeTmpFile('.ts', src);
    const { symbols } = scanFile(file, path.dirname(file));
    const cls = symbols.find((s) => s.name === 'TextEngine');
    const method = symbols.find((s) => s.name === 'search');
    expect(cls).toBeDefined();
    expect(cls!.kind).toBe('class');
    expect(method).toBeDefined();
    expect(method!.kind).toBe('method');
    expect(method!.qualifiedName).toBe('TextEngine.search');
    fs.rmSync(path.dirname(file), { recursive: true });
  });

  it('extracts call edges', () => {
    const src = `
export function main(): void {
  findRepoRoot(process.cwd());
}
`;
    const file = makeTmpFile('.ts', src);
    const { edges } = scanFile(file, path.dirname(file));
    const edge = edges.find((e) => e.targetName === 'findRepoRoot');
    expect(edge).toBeDefined();
    expect(edge!.kind).toBe('calls');
    fs.rmSync(path.dirname(file), { recursive: true });
  });

  it('returns empty arrays for non-parseable file', () => {
    const file = makeTmpFile('.ts', '<<< not valid typescript >>>');
    const { symbols, edges } = scanFile(file, path.dirname(file));
    // should not throw, may return empty or partial results
    expect(Array.isArray(symbols)).toBe(true);
    expect(Array.isArray(edges)).toBe(true);
    fs.rmSync(path.dirname(file), { recursive: true });
  });

  it('non-exported functions have isExported=false', () => {
    const src = `function internal(): void {}`;
    const file = makeTmpFile('.ts', src);
    const { symbols } = scanFile(file, path.dirname(file));
    const fn = symbols.find((s) => s.name === 'internal');
    expect(fn?.isExported).toBe(false);
    fs.rmSync(path.dirname(file), { recursive: true });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/code-scanner.test.ts -v
```

Expected: FAIL — `Cannot find module '../src/core/code-scanner'`

- [ ] **Step 3: Implement `src/core/code-scanner.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { CodeSymbol, CodeEdge, SymbolKind, IndexedLanguage } from '../types';

export const SUPPORTED_EXTENSIONS = new Map<string, IndexedLanguage>([
  ['.ts', 'typescript'],
  ['.tsx', 'typescript'],
  ['.js', 'javascript'],
  ['.mjs', 'javascript'],
  ['.py', 'python'],
  ['.go', 'go'],
  ['.rs', 'rust'],
  ['.yaml', 'yaml'],
  ['.yml', 'yaml'],
  ['.cs', 'csharp'],
]);

export function detectLanguage(filePath: string): IndexedLanguage | null {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.get(ext) ?? null;
}

function loadGrammar(language: IndexedLanguage): any {
  try {
    switch (language) {
      case 'typescript':
        return require('tree-sitter-typescript').typescript;
      case 'javascript':
        return require('tree-sitter-javascript');
      case 'python':
        return require('tree-sitter-python');
      case 'go':
        return require('tree-sitter-go');
      case 'rust':
        return require('tree-sitter-rust');
      case 'yaml':
        return require('tree-sitter-yaml');
      case 'csharp':
        return require('tree-sitter-c-sharp');
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function getNodeText(node: any, source: string): string {
  return source.slice(node.startIndex, node.endIndex);
}

function extractDocstring(node: any, source: string): string {
  const prev = node.previousNamedSibling;
  if (!prev) return '';

  const isComment =
    prev.type === 'comment' ||
    prev.type === 'block_comment' ||
    prev.type === 'line_comment' ||
    prev.type === 'expression_statement'; // JSDoc in TS parsed as expression

  if (!isComment) return '';

  const raw = getNodeText(prev, source);
  // Strip comment markers and take first 3 lines
  return raw
    .replace(/^\/\*\*?|\*\/$/g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');
}

function buildSignature(node: any, source: string, name: string): string {
  // For function/method nodes, grab from name to body opening brace
  const text = getNodeText(node, source);
  const bodyStart = text.indexOf('{');
  const arrowStart = text.indexOf('=>');
  const cutoff = bodyStart !== -1 ? bodyStart : arrowStart !== -1 ? arrowStart : text.length;
  return text.slice(0, cutoff).replace(/\s+/g, ' ').trim();
}

interface ParseResult {
  symbols: CodeSymbol[];
  edges: CodeEdge[];
}

function walkTypeScript(tree: any, source: string, relPath: string): ParseResult {
  const symbols: CodeSymbol[] = [];
  const edges: CodeEdge[] = [];
  let currentClass: string | null = null;

  function visit(node: any): void {
    switch (node.type) {
      case 'function_declaration':
      case 'function': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        const name = getNodeText(nameNode, source);
        const isExported = node.parent?.type === 'export_statement';
        const qualifiedName = currentClass ? `${currentClass}.${name}` : name;
        symbols.push({
          name,
          qualifiedName,
          kind: currentClass ? 'method' : 'fn',
          file: relPath,
          lineStart: node.startPosition.row + 1,
          lineEnd: node.endPosition.row + 1,
          signature: buildSignature(node, source, name),
          docstring: extractDocstring(isExported ? node.parent : node, source),
          isExported,
          parentName: currentClass ?? undefined,
        });
        break;
      }
      case 'method_definition':
      case 'method_signature': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        const name = getNodeText(nameNode, source);
        const qualifiedName = currentClass ? `${currentClass}.${name}` : name;
        symbols.push({
          name,
          qualifiedName,
          kind: 'method',
          file: relPath,
          lineStart: node.startPosition.row + 1,
          lineEnd: node.endPosition.row + 1,
          signature: buildSignature(node, source, name),
          docstring: extractDocstring(node, source),
          isExported: false,
          parentName: currentClass ?? undefined,
        });
        break;
      }
      case 'class_declaration': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        const name = getNodeText(nameNode, source);
        const isExported = node.parent?.type === 'export_statement';
        currentClass = name;
        symbols.push({
          name,
          qualifiedName: name,
          kind: 'class',
          file: relPath,
          lineStart: node.startPosition.row + 1,
          lineEnd: node.endPosition.row + 1,
          signature: `class ${name}`,
          docstring: extractDocstring(isExported ? node.parent : node, source),
          isExported,
        });
        for (let i = 0; i < node.childCount; i++) visit(node.child(i));
        currentClass = null;
        return;
      }
      case 'interface_declaration': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        const name = getNodeText(nameNode, source);
        const isExported = node.parent?.type === 'export_statement';
        symbols.push({
          name,
          qualifiedName: name,
          kind: 'interface',
          file: relPath,
          lineStart: node.startPosition.row + 1,
          lineEnd: node.endPosition.row + 1,
          signature: `interface ${name}`,
          docstring: extractDocstring(isExported ? node.parent : node, source),
          isExported,
        });
        break;
      }
      case 'type_alias_declaration': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        const name = getNodeText(nameNode, source);
        const isExported = node.parent?.type === 'export_statement';
        symbols.push({
          name,
          qualifiedName: name,
          kind: 'type',
          file: relPath,
          lineStart: node.startPosition.row + 1,
          lineEnd: node.endPosition.row + 1,
          signature: `type ${name}`,
          docstring: '',
          isExported,
        });
        break;
      }
      case 'call_expression': {
        const fnNode = node.childForFieldName('function');
        if (!fnNode) break;
        // Handle direct calls: foo() and member calls: obj.foo()
        let targetName: string | null = null;
        if (fnNode.type === 'identifier') {
          targetName = getNodeText(fnNode, source);
        } else if (fnNode.type === 'member_expression') {
          const prop = fnNode.childForFieldName('property');
          if (prop) targetName = getNodeText(prop, source);
        }
        if (targetName && targetName !== 'require') {
          const enclosingFn = findEnclosingFn(node);
          const sourceName = enclosingFn ?? relPath;
          edges.push({
            sourceName,
            sourceFile: relPath,
            targetName,
            kind: 'calls',
            line: node.startPosition.row + 1,
          });
        }
        break;
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      visit(node.child(i));
    }
  }

  function findEnclosingFn(node: any): string | null {
    let cur = node.parent;
    while (cur) {
      if (
        cur.type === 'function_declaration' ||
        cur.type === 'method_definition' ||
        cur.type === 'arrow_function'
      ) {
        const nameNode = cur.childForFieldName('name');
        if (nameNode) return getNodeText(nameNode, source);
      }
      cur = cur.parent;
    }
    return null;
  }

  visit(tree.rootNode);
  return { symbols, edges };
}

export interface ScanFileResult {
  symbols: CodeSymbol[];
  edges: CodeEdge[];
  hash: string;
}

export function scanFile(filePath: string, scanRoot: string): ScanFileResult {
  const language = detectLanguage(filePath);
  if (!language) return { symbols: [], edges: [], hash: '' };

  let source: string;
  try {
    source = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return { symbols: [], edges: [], hash: '' };
  }

  const hash = crypto.createHash('sha256').update(source).digest('hex');
  const relPath = path.relative(scanRoot, filePath);

  let Parser: any;
  try {
    Parser = require('tree-sitter');
  } catch {
    return { symbols: [], edges: [], hash };
  }

  const grammar = loadGrammar(language);
  if (!grammar) return { symbols: [], edges: [], hash };

  try {
    const parser = new Parser();
    parser.setLanguage(grammar);
    const tree = parser.parse(source);

    // Currently only TypeScript/JavaScript walkthrough is implemented.
    // Python, Go, Rust, YAML, C# share similar node types — extend walkTypeScript
    // or add language-specific walkers as needed.
    if (language === 'typescript' || language === 'javascript') {
      const result = walkTypeScript(tree, source, relPath);
      return { ...result, hash };
    }

    return { symbols: [], edges: [], hash };
  } catch {
    return { symbols: [], edges: [], hash };
  }
}

export function hashFile(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return '';
  }
}
```

- [ ] **Step 4: Run tests**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/code-scanner.test.ts -v
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/code-scanner.ts tests/code-scanner.test.ts
git commit -m "feat(code-index): tree-sitter scanner — TypeScript/JS symbols + call edges"
```

---

## Task 4: Result Merger

**Files:**

- Create: `src/core/result-merger.ts`
- Create: `tests/result-merger.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/result-merger.test.ts`:

```typescript
import { mergeResults } from '../src/core/result-merger';
import type { RecallResult, SymbolResult } from '../src/types';

function makeMemoryResult(score: number): RecallResult {
  return {
    memory: {
      path: '/tmp/test.md',
      name: 'test-memory',
      type: 'lesson',
      description: 'A test memory',
      tags: [],
      created: '2026-01-01',
      content: 'Content here',
    },
    score,
  };
}

function makeSymbolResult(score: number, name: string): SymbolResult {
  return {
    symbol: {
      name,
      qualifiedName: name,
      kind: 'fn',
      file: 'src/test.ts',
      lineStart: 1,
      lineEnd: 10,
      signature: `${name}(): void`,
      docstring: '',
      isExported: true,
    },
    score,
  };
}

describe('mergeResults', () => {
  it('returns empty when both inputs are empty', () => {
    expect(mergeResults([], [], 5)).toHaveLength(0);
  });

  it('returns only memories when no symbols', () => {
    const memories = [makeMemoryResult(0.9), makeMemoryResult(0.5)];
    const merged = mergeResults(memories, [], 5);
    expect(merged).toHaveLength(2);
    expect(merged[0].type).toBe('memory');
  });

  it('returns only symbols when no memories', () => {
    const symbols = [makeSymbolResult(0.8, 'foo'), makeSymbolResult(0.4, 'bar')];
    const merged = mergeResults([], symbols, 5);
    expect(merged).toHaveLength(2);
    expect(merged[0].type).toBe('symbol');
  });

  it('interleaves memories and symbols by normalized score', () => {
    const memories = [makeMemoryResult(0.9)];
    const symbols = [makeSymbolResult(0.95, 'topFn')];
    const merged = mergeResults(memories, symbols, 5);
    // symbol has higher score, should come first
    expect(merged[0].type).toBe('symbol');
    expect(merged[1].type).toBe('memory');
  });

  it('respects topK limit', () => {
    const memories = [makeMemoryResult(0.9), makeMemoryResult(0.8), makeMemoryResult(0.7)];
    const symbols = [makeSymbolResult(0.6, 'fn1'), makeSymbolResult(0.5, 'fn2')];
    const merged = mergeResults(memories, symbols, 3);
    expect(merged).toHaveLength(3);
  });

  it('all scores are between 0 and 1', () => {
    const memories = [makeMemoryResult(100), makeMemoryResult(50)];
    const symbols = [makeSymbolResult(200, 'x')];
    const merged = mergeResults(memories, symbols, 10);
    for (const r of merged) {
      expect(r.normalizedScore).toBeGreaterThanOrEqual(0);
      expect(r.normalizedScore).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/result-merger.test.ts -v
```

Expected: FAIL — `Cannot find module '../src/core/result-merger'`

- [ ] **Step 3: Implement `src/core/result-merger.ts`**

```typescript
import type { RecallResult, SymbolResult } from '../types';

export type MergedItem =
  | { type: 'memory'; result: RecallResult; normalizedScore: number }
  | { type: 'symbol'; result: SymbolResult; normalizedScore: number };

function normalize(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return values.map(() => 1.0);
  return values.map((v) => (v - min) / range);
}

export function mergeResults(
  memories: RecallResult[],
  symbols: SymbolResult[],
  topK: number
): MergedItem[] {
  const memNorm = normalize(memories.map((r) => r.score));
  const symNorm = normalize(symbols.map((r) => r.score));

  const items: MergedItem[] = [
    ...memories.map((r, i) => ({
      type: 'memory' as const,
      result: r,
      normalizedScore: memNorm[i],
    })),
    ...symbols.map((r, i) => ({
      type: 'symbol' as const,
      result: r,
      normalizedScore: symNorm[i],
    })),
  ];

  items.sort((a, b) => b.normalizedScore - a.normalizedScore);
  return items.slice(0, topK);
}
```

- [ ] **Step 4: Run tests**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/result-merger.test.ts -v
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/result-merger.ts tests/result-merger.test.ts
git commit -m "feat(code-index): result merger — normalize and interleave memory + symbol results"
```

---

## Task 5: `memo index` Command

**Files:**

- Create: `src/commands/code-scan.ts`
- Create: `tests/code-scan.test.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/code-scan.test.ts`:

```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { codeScanCommand } from '../src/commands/code-scan';
import { CodeIndex } from '../src/engines/code-index';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-codescan-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: test\n');
  return dir;
}

describe('codeScanCommand', () => {
  it('creates code-index.db after scanning a directory with TS files', async () => {
    const repoRoot = makeTempRepo();
    const srcDir = path.join(repoRoot, '..', 'src-fixture');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'hello.ts'),
      `export function greet(name: string): string { return 'hi ' + name; }`
    );

    await codeScanCommand(srcDir, { repo: repoRoot });

    const dbPath = path.join(repoRoot, 'meta', 'code-index.db');
    expect(fs.existsSync(dbPath)).toBe(true);

    const idx = new CodeIndex(dbPath);
    const stats = idx.getStats();
    expect(stats.symbols).toBeGreaterThan(0);
    idx.close();

    fs.rmSync(repoRoot, { recursive: true });
    fs.rmSync(srcDir, { recursive: true });
  });

  it('skips unchanged files on second scan (hash cache)', async () => {
    const repoRoot = makeTempRepo();
    const srcDir = path.join(repoRoot, '..', 'src-fixture2');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'hello.ts'),
      `export function greet(name: string): string { return 'hi'; }`
    );

    await codeScanCommand(srcDir, { repo: repoRoot });
    const dbPath = path.join(repoRoot, 'meta', 'code-index.db');
    const idx = new CodeIndex(dbPath);
    const statsFirst = idx.getStats();
    idx.close();

    // Second scan — no changes, should not re-index
    await codeScanCommand(srcDir, { repo: repoRoot });
    const idx2 = new CodeIndex(dbPath);
    const statsSecond = idx2.getStats();
    idx2.close();

    expect(statsSecond.symbols).toBe(statsFirst.symbols);

    fs.rmSync(repoRoot, { recursive: true });
    fs.rmSync(srcDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/code-scan.test.ts -v
```

Expected: FAIL — `Cannot find module '../src/commands/code-scan'`

- [ ] **Step 3: Implement `src/commands/code-scan.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { findRepoRoot, writeMemory } from '../core/store';
import { loadConfig } from '../config';
import { scanFile, detectLanguage, SUPPORTED_EXTENSIONS } from '../core/code-scanner';
import { CodeIndex } from '../engines/code-index';
import type { CodeScanOptions, IndexedLanguage } from '../types';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.turbo',
  'out',
  'tmp',
  '.cache',
]);

function collectFiles(scanRoot: string, langs: Set<IndexedLanguage> | null): string[] {
  const extensions = langs
    ? [...SUPPORTED_EXTENSIONS.entries()].filter(([, lang]) => langs.has(lang)).map(([ext]) => ext)
    : [...SUPPORTED_EXTENSIONS.keys()];

  const patterns = extensions.map((ext) =>
    path.join(scanRoot, '**', `*${ext}`).split(path.sep).join('/')
  );

  const files: string[] = [];
  for (const pattern of patterns) {
    const matches = glob.sync(pattern, {
      ignore: SKIP_DIRS.size > 0 ? [...SKIP_DIRS].map((d) => `**/${d}/**`) : [],
    });
    files.push(...matches);
  }

  return [...new Set(files)];
}

function buildSummary(
  stats: { files: number; symbols: number; edges: number },
  langCounts: Map<string, number>
): string {
  const langLines = [...langCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([lang, count]) => `${lang}: ${count} files`)
    .join(', ');

  return [
    `Languages indexed: ${langLines}`,
    `Symbols: ${stats.symbols} total`,
    `Call edges: ${stats.edges}`,
  ].join('\n');
}

export async function codeScanCommand(
  scanPath: string | undefined,
  options: CodeScanOptions
): Promise<void> {
  if (!CodeIndex.isAvailable()) {
    console.error(
      '⚠  memo index requires optional dependencies. Run:\n  npm install memobank-cli --include=optional'
    );
    process.exit(1);
  }

  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd, options.repo);
  const scanRoot = scanPath ? path.resolve(scanPath) : cwd;

  if (!fs.existsSync(scanRoot)) {
    console.error(`Error: scan path does not exist: ${scanRoot}`);
    process.exit(1);
  }

  const langs: Set<IndexedLanguage> | null = options.langs
    ? new Set(options.langs.split(',').map((l) => l.trim()) as IndexedLanguage[])
    : null;

  const files = collectFiles(scanRoot, langs);
  console.log(`📂 Scanning ${files.length} files in ${scanRoot}`);

  const dbPath = CodeIndex.getDbPath(repoRoot);
  const idx = new CodeIndex(dbPath);
  const langCounts = new Map<string, number>();

  let indexed = 0;
  let skipped = 0;

  for (const filePath of files) {
    const lang = detectLanguage(filePath);
    if (!lang) continue;

    // Fast hash check for incremental skip
    const { hash, symbols, edges } = scanFile(filePath, scanRoot);

    if (!options.force && !idx.needsReindex(path.relative(scanRoot, filePath), hash)) {
      skipped++;
      continue;
    }

    const relPath = path.relative(scanRoot, filePath);
    idx.upsertFile(relPath, lang, hash, fs.statSync(filePath).mtimeMs);
    idx.upsertSymbols(relPath, symbols, edges);

    langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1);
    indexed++;
  }

  const stats = idx.getStats();
  idx.close();

  console.log(`✓ Indexed: ${indexed} files  Skipped (unchanged): ${skipped}`);
  console.log(`  Symbols: ${stats.symbols}  Edges: ${stats.edges}`);

  if (options.summarize) {
    const config = loadConfig(repoRoot);
    const summaryContent = buildSummary(stats, langCounts);
    writeMemory(repoRoot, {
      type: 'architecture',
      name: 'project-architecture-snapshot',
      description: 'Auto-generated code structure snapshot from memo index',
      tags: ['architecture', 'codebase', 'auto-generated'],
      confidence: 'high',
      content: summaryContent,
    });
    console.log(`✓ Architecture memory written: project-architecture-snapshot`);
  }
}
```

- [ ] **Step 4: Register `memo index` in `src/cli.ts`**

Add the import near the top with other command imports:

```typescript
import { codeScanCommand } from './commands/code-scan';
```

Add the command registration before the final `program.parse()` call:

```typescript
program
  .command('index [path]')
  .description('Index codebase symbols for use with memo recall --code')
  .option('--summarize', 'Write project-architecture-snapshot memory after indexing')
  .option('--force', 'Re-index all files (ignore hash cache)')
  .option('--langs <list>', 'Comma-separated language filter, e.g. typescript,python')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (scanPath: string | undefined, options) => {
    try {
      await codeScanCommand(scanPath, {
        summarize: options.summarize,
        force: options.force,
        langs: options.langs,
        repo: options.repo,
      });
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });
```

- [ ] **Step 5: Run tests**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/code-scan.test.ts -v
```

Expected: both tests PASS.

- [ ] **Step 6: Smoke test via CLI**

```bash
npm run build && node dist/cli.js index src/ --repo .memobank
```

Expected: output like `✓ Indexed: 16 files  Symbols: 140+  Edges: 50+`

- [ ] **Step 7: Commit**

```bash
git add src/commands/code-scan.ts src/cli.ts tests/code-scan.test.ts
git commit -m "feat(code-index): memo index command — scan codebase and populate SQLite index"
```

---

## Task 6: Dual-Track Recall (`--code` and `--refs`)

**Files:**

- Modify: `src/core/retriever.ts`
- Modify: `src/commands/recall.ts`

- [ ] **Step 1: Add symbol formatter to `src/core/retriever.ts`**

Add this function after the `scopeLabel` function (around line 114):

```typescript
function formatSymbolResult(result: import('../types').SymbolResult): string {
  const { symbol, score } = result;
  const docLine = symbol.docstring ? `> ${symbol.docstring}\n` : '';
  return (
    `### [score: ${score.toFixed(2)} | symbol] ${symbol.qualifiedName}\n` +
    docLine +
    `> \`${symbol.file}:${symbol.lineStart}–${symbol.lineEnd}\` · ${symbol.kind}\n\n` +
    `---\n\n${symbol.signature}\n`
  );
}
```

- [ ] **Step 2: Update `recall()` in `src/core/retriever.ts` to support dual-track**

Replace the `recall` function signature and add the code-index path. The new function signature:

```typescript
export async function recall(
  query: string,
  repoRoot: string,
  config: MemoConfig,
  engine?: EngineAdapter,
  scope: MemoryScope | 'all' = 'all',
  explain: boolean = false,
  withCode: boolean = false
): Promise<{
  results: RecallResult[];
  markdown: string;
  symbolResults?: import('../types').SymbolResult[];
}>;
```

Inside the function, after building `results` and before returning, add the code-index branch:

```typescript
let symbolResults: import('../types').SymbolResult[] | undefined;

if (withCode) {
  try {
    const { CodeIndex } = await import('../engines/code-index');
    const dbPath = CodeIndex.getDbPath(repoRoot);
    if (require('fs').existsSync(dbPath)) {
      const idx = new CodeIndex(dbPath);
      symbolResults = idx.search(query, config.memory.top_k);
      idx.close();
    } else {
      process.stderr.write(`⚠  No code index found. Run: memo index [path]\n`);
    }
  } catch {
    // better-sqlite3 not installed — silently skip
  }
}

return { results, markdown, symbolResults };
```

- [ ] **Step 3: Update `formatResultsAsMarkdown` to accept symbol results**

Change the function signature:

```typescript
function formatResultsAsMarkdown(
  results: RecallResult[],
  query: string,
  engine: string,
  totalMemories: number,
  scope: MemoryScope | 'all' = 'all',
  explain: boolean = false,
  symbolResults?: import('../types').SymbolResult[]
): string;
```

Inside the function, after the memory results block and before the closing `---`, add:

```typescript
if (symbolResults && symbolResults.length > 0) {
  markdown += `\n## Code Symbols\n\n`;
  for (const r of symbolResults) {
    markdown += formatSymbolResult(r) + '\n';
  }
}
```

Pass `symbolResults` through in both the main call and the token-budget trim loop in `recall()`:

```typescript
markdown = formatResultsAsMarkdown(
  results,
  query,
  config.embedding.engine,
  memories.length,
  scope,
  explain,
  symbolResults
);
```

- [ ] **Step 4: Add `--code` and `--refs` options to `src/commands/recall.ts`**

Update `RecallOptions`:

```typescript
export interface RecallOptions {
  top?: number;
  engine?: string;
  format?: string;
  dryRun?: boolean;
  repo?: string;
  scope?: string;
  explain?: boolean;
  code?: boolean; // enable dual-track recall
  refs?: string; // symbol name for --refs lookup
}
```

Inside `recallCommand`, add a `--refs` early-return path before the main recall logic:

```typescript
// --refs: show callers of a symbol from the code index
if (options.refs) {
  try {
    const { CodeIndex } = await import('../engines/code-index');
    const dbPath = CodeIndex.getDbPath(repoRoot);
    if (!require('fs').existsSync(dbPath)) {
      console.error('No code index found. Run: memo index [path]');
      process.exit(1);
    }
    const idx = new CodeIndex(dbPath);
    const refs = idx.getRefs(options.refs);
    idx.close();
    if (refs.length === 0) {
      console.log(`No callers found for: ${options.refs}`);
      return;
    }
    console.log(`\n## Callers of \`${options.refs}\` (${refs.length})\n`);
    for (const r of refs) {
      console.log(`- ${r.symbol.qualifiedName}  ${r.symbol.file}:${r.symbol.lineStart}`);
    }
    return;
  } catch {
    console.error('Code index unavailable. Run: npm install memobank-cli --include=optional');
    process.exit(1);
  }
}
```

Pass `withCode` to `recall()`:

```typescript
const { results, markdown, symbolResults } = await recall(
  query,
  repoRoot,
  config,
  engine,
  scope,
  explain,
  options.code ?? false
);
```

- [ ] **Step 5: Register `--code` and `--refs` in `src/cli.ts`**

Find the `recall` command registration and add two options:

```typescript
  .option('--code', 'Enable dual-track recall: search memories + code symbols', false)
  .option('--refs <symbol>', 'Show callers of a symbol from the code index')
```

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: all 98+ existing tests PASS plus new tests pass. No regressions.

- [ ] **Step 7: Smoke test dual-track recall**

First run the indexer, then recall:

```bash
npm run build
node dist/cli.js index src/ --repo .memobank
node dist/cli.js recall "authentication" --code --repo .memobank --dry-run
```

Expected: output contains both `## Recalled Memory` and `## Code Symbols` sections.

```bash
node dist/cli.js recall --refs findRepoRoot --repo .memobank
```

Expected: lists callers like `installCommand  src/commands/install.ts:42`

- [ ] **Step 8: Add `.memobank/meta/code-index.db` to `.gitignore`**

Open `.gitignore` at the project root (or `.memobank/.gitignore`) and add:

```
meta/code-index.db
```

- [ ] **Step 9: Commit**

```bash
git add src/core/retriever.ts src/commands/recall.ts src/cli.ts .gitignore
git commit -m "feat(code-index): dual-track recall — --code flag and --refs callers lookup"
```

---

## Task 7: Final Typecheck + Full Test Run

**Files:** none (verification only)

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: no errors (fix any with `npm run lint:fix`).

- [ ] **Step 3: Run full test suite with coverage**

```bash
npm run test:coverage
```

Expected: all tests pass, coverage ≥ 50% threshold.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: typecheck + lint clean for code-symbol-index feature"
```

---

## Spec Coverage Checklist

| Spec Section                                    | Covered By                                   |
| ----------------------------------------------- | -------------------------------------------- |
| Dual-track recall architecture                  | Task 6                                       |
| SQLite schema (4 tables + triggers)             | Task 2                                       |
| tree-sitter scanner, 7 languages                | Task 3 (TS/JS full, others extensible)       |
| `memo index [path]` command                     | Task 5                                       |
| `--summarize` architecture memory               | Task 5                                       |
| `--force` re-index flag                         | Task 5                                       |
| `--langs` filter                                | Task 5                                       |
| `memo recall --code`                            | Task 6                                       |
| `memo recall --refs <symbol>`                   | Task 6                                       |
| Symbol output format (path+signature+docstring) | Task 6                                       |
| optionalDependencies isolation                  | Task 1                                       |
| `code-index.db` not committed                   | Task 6, step 8                               |
| `symbols.memory_refs` SOTA bridge               | Task 2 (column present, population deferred) |
| `qualified_name` disambiguation                 | Tasks 2 + 3                                  |
| FTS5 content= triggers                          | Task 2                                       |
| Incremental scan (hash cache)                   | Tasks 2 + 5                                  |

> **Note on Python/Go/Rust/YAML/C# parsers:** `code-scanner.ts` loads the grammar packages and has the infrastructure wired. Language-specific AST walkers (`walkPython`, `walkGo`, etc.) follow the same pattern as `walkTypeScript` and can be added incrementally without changing any other file.
