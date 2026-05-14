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
    kind: 'function',
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
    expect(() => new CodeIndex(path.join(tmpDir, 'code-index2.db'))).not.toThrow();
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

  describe('linkMemory', () => {
    it('stores links for matching symbols', () => {
      index.upsertFile('src/auth.ts', 'typescript', 'h1', Date.now());
      index.upsertSymbols(
        'src/auth.ts',
        [makeSymbol({ name: 'verifyToken', qualifiedName: 'verifyToken', hash: 'hash-vt' })],
        []
      );
      index.linkMemory('lesson/2026-01-01-jwt.md', 'verifyToken raises on expired JWT');
      const rows = (index as any).db
        .prepare('SELECT * FROM memory_symbol_refs WHERE memory_path = ?')
        .all('lesson/2026-01-01-jwt.md');
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].symbol_hash).toBe('hash-vt');
    });

    it('replaces links on re-call', () => {
      index.upsertFile('src/auth.ts', 'typescript', 'h1', Date.now());
      index.upsertSymbols(
        'src/auth.ts',
        [makeSymbol({ name: 'verifyToken', qualifiedName: 'verifyToken', hash: 'hash-vt' })],
        []
      );
      index.linkMemory('lesson/2026-01-01-jwt.md', 'verifyToken raises on expired JWT');
      index.linkMemory('lesson/2026-01-01-jwt.md', 'verifyToken raises on expired JWT');
      const rows = (index as any).db
        .prepare('SELECT * FROM memory_symbol_refs WHERE memory_path = ?')
        .all('lesson/2026-01-01-jwt.md');
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it('stores nothing when FTS finds no match', () => {
      index.linkMemory('lesson/2026-01-01-empty.md', 'completely unrelated xyz123');
      const rows = (index as any).db
        .prepare('SELECT * FROM memory_symbol_refs WHERE memory_path = ?')
        .all('lesson/2026-01-01-empty.md');
      expect(rows).toHaveLength(0);
    });

    it('skips symbols with null hash', () => {
      index.upsertFile('src/auth.ts', 'typescript', 'h1', Date.now());
      index.upsertSymbols(
        'src/auth.ts',
        [makeSymbol({ name: 'verifyToken', qualifiedName: 'verifyToken', hash: undefined })],
        []
      );
      index.linkMemory('lesson/x.md', 'verifyToken');
      const rows = (index as any).db.prepare('SELECT * FROM memory_symbol_refs').all();
      expect(rows).toHaveLength(0);
    });
  });

  describe('getLinkedMemories', () => {
    function setup(): void {
      // Two files, three symbols, one call edge
      index.upsertFile('src/auth.ts', 'typescript', 'h1', Date.now());
      index.upsertFile('src/jwt.ts', 'typescript', 'h2', Date.now());
      const verifyToken = makeSymbol({
        name: 'verifyToken',
        qualifiedName: 'verifyToken',
        hash: 'hash-vt',
        file: 'src/auth.ts',
      });
      const checkExpiry = makeSymbol({
        name: 'checkExpiry',
        qualifiedName: 'checkExpiry',
        hash: 'hash-ce',
        file: 'src/jwt.ts',
      });
      const unrelated = makeSymbol({
        name: 'parseHeaders',
        qualifiedName: 'parseHeaders',
        hash: 'hash-ph',
        file: 'src/jwt.ts',
      });
      // verifyToken calls checkExpiry
      index.upsertSymbols(
        'src/auth.ts',
        [verifyToken],
        [
          {
            sourceName: 'verifyToken',
            sourceFile: 'src/auth.ts',
            targetName: 'checkExpiry',
            kind: 'calls',
            line: 5,
          },
        ]
      );
      index.upsertSymbols('src/jwt.ts', [checkExpiry, unrelated], []);
      // memory anchored to verifyToken (depth 0)
      index.linkMemory('lesson/jwt-lesson.md', 'verifyToken raises on expired JWT');
      // memory anchored to checkExpiry (depth 1 from verifyToken query)
      index.linkMemory('lesson/expiry-lesson.md', 'checkExpiry validates exp claim');
    }

    it('returns depth-0 memory when query matches its symbol directly', () => {
      setup();
      const linked = index.getLinkedMemories('verifyToken');
      const found = linked.find((l) => l.memoryPath === 'lesson/jwt-lesson.md');
      expect(found).toBeDefined();
      expect(found!.minDepth).toBe(0);
    });

    it('returns depth-1 memory reachable via call edge', () => {
      setup();
      const linked = index.getLinkedMemories('verifyToken');
      const found = linked.find((l) => l.memoryPath === 'lesson/expiry-lesson.md');
      expect(found).toBeDefined();
      expect(found!.minDepth).toBe(1);
    });

    it('returns empty array when no symbols match query', () => {
      setup();
      const linked = index.getLinkedMemories('completelyUnknownXyz999');
      expect(linked).toHaveLength(0);
    });

    it('does not return memories beyond depth 2', () => {
      setup();
      const linked = index.getLinkedMemories('verifyToken');
      const allWithinBound = linked.every((l) => l.minDepth <= 2);
      expect(allWithinBound).toBe(true);
    });
  });
});
