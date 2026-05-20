import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CodeIndex } from '../src/engines/code-index';
import { buildMemoryGraph, graphExpand, incrementalEdgeUpdate } from '../src/engines/memory-graph';
import type { MemoryNodeInput } from '../src/types';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memo-mgraph-'));
}

function makeMemoryInput(overrides: Partial<MemoryNodeInput> = {}): MemoryNodeInput {
  return {
    id: 'test-lesson',
    file_path: '/tmp/test/lesson/2026-01-01-test-lesson.md',
    content: 'processQueue was causing issues with queue drain order',
    type: 'lesson',
    tags: ['queue', 'performance'],
    status: 'active',
    content_hash: 'abc123',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('memory-graph schema', () => {
  let tmpDir: string;
  let idx: CodeIndex;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    idx = new CodeIndex(path.join(tmpDir, 'code-index.db'));
  });

  afterEach(() => {
    idx.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('creates memory_nodes table', () => {
    const row = (idx as any).db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memory_nodes'")
      .get();
    expect(row).toBeDefined();
    expect(row.name).toBe('memory_nodes');
  });

  it('creates memory_edges table', () => {
    const row = (idx as any).db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memory_edges'")
      .get();
    expect(row).toBeDefined();
    expect(row.name).toBe('memory_edges');
  });
});

describe('incrementalEdgeUpdate', () => {
  let tmpDir: string;
  let idx: CodeIndex;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    idx = new CodeIndex(path.join(tmpDir, 'code-index.db'));
  });

  afterEach(() => {
    idx.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('upserts a memory_nodes row', async () => {
    const db = (idx as any).db;
    const mem = makeMemoryInput();
    await incrementalEdgeUpdate(db, mem);
    const row = db.prepare('SELECT id, type, status FROM memory_nodes WHERE id = ?').get(mem.id);
    expect(row).toBeDefined();
    expect(row.type).toBe('lesson');
    expect(row.status).toBe('active');
  });

  it('skips rebuild when content_hash unchanged', async () => {
    const db = (idx as any).db;
    const mem = makeMemoryInput();
    await incrementalEdgeUpdate(db, mem);
    // Insert a spurious edge, then re-run — it should survive (not deleted on skip)
    db.prepare(
      "INSERT INTO memory_edges (source_id, source_type, target_id, target_type, edge_type, created_at) VALUES ('sentinel', 'symbol', 'test-lesson', 'memory', 'mentions', '2026-01-01')"
    ).run();
    await incrementalEdgeUpdate(db, mem); // same hash — skips
    const edgeCount = db
      .prepare('SELECT COUNT(*) AS n FROM memory_edges WHERE target_id = ?')
      .get(mem.id).n;
    expect(edgeCount).toBe(1); // sentinel still there
  });

  it('creates mentions edge when symbol name appears in content', async () => {
    const db = (idx as any).db;
    // Seed a symbol named 'processQueue'
    idx.upsertFile('src/queue.ts', 'typescript', 'h1', Date.now());
    idx.upsertSymbols(
      'src/queue.ts',
      [
        {
          name: 'processQueue',
          qualifiedName: 'processQueue',
          kind: 'function',
          file: 'src/queue.ts',
          lineStart: 1,
          lineEnd: 10,
          isExported: true,
          hash: 'hpq',
        },
      ],
      []
    );
    const mem = makeMemoryInput({ content: 'processQueue was causing issues' });
    await incrementalEdgeUpdate(db, mem);
    const edge = db
      .prepare("SELECT * FROM memory_edges WHERE target_id = ? AND edge_type = 'mentions'")
      .get(mem.id);
    expect(edge).toBeDefined();
    expect(edge.source_type).toBe('symbol');
    expect(edge.source_id).toBe('processQueue');
  });

  it('creates related_to edge for memories sharing a tag', async () => {
    const db = (idx as any).db;
    // Pre-insert another memory with overlapping tag
    db.prepare(
      `INSERT INTO memory_nodes (id, file_path, type, tags, status, content_hash, updated_at)
       VALUES ('other-lesson', '/tmp/other.md', 'lesson', '["queue","retry"]', 'active', 'xyz', '2026-01-01')`
    ).run();
    const mem = makeMemoryInput({ tags: ['queue', 'performance'] });
    await incrementalEdgeUpdate(db, mem);
    const edge = db
      .prepare("SELECT * FROM memory_edges WHERE source_id = ? AND edge_type = 'related_to'")
      .get(mem.id);
    expect(edge).toBeDefined();
    expect(edge.target_id).toBe('other-lesson');
    expect(edge.source_type).toBe('memory');
  });

  it('does not create related_to edge when no shared tags', async () => {
    const db = (idx as any).db;
    db.prepare(
      `INSERT INTO memory_nodes (id, file_path, type, tags, status, content_hash, updated_at)
       VALUES ('unrelated', '/tmp/unrelated.md', 'decision', '["database"]', 'active', 'xyz', '2026-01-01')`
    ).run();
    const mem = makeMemoryInput({ tags: ['queue', 'performance'] });
    await incrementalEdgeUpdate(db, mem);
    const edges = db
      .prepare("SELECT * FROM memory_edges WHERE source_id = ? AND edge_type = 'related_to'")
      .all(mem.id);
    expect(edges).toHaveLength(0);
  });

  it('caps related_to candidates at 50 per memory', async () => {
    const db = (idx as any).db;
    // Insert 60 memories all sharing tag 'shared'
    const insertNode = db.prepare(
      `INSERT INTO memory_nodes (id, file_path, type, tags, status, content_hash, updated_at)
       VALUES (?, ?, 'lesson', '["shared"]', 'active', ?, '2026-01-01')`
    );
    for (let i = 0; i < 60; i++) {
      insertNode.run(`node-${i}`, `/tmp/${i}.md`, `hash-${i}`);
    }
    const mem = makeMemoryInput({ id: 'new-memory', tags: ['shared'] });
    await incrementalEdgeUpdate(db, mem);
    const count = db
      .prepare(
        "SELECT COUNT(*) AS n FROM memory_edges WHERE source_id = 'new-memory' AND edge_type = 'related_to'"
      )
      .get().n;
    expect(count).toBeLessThanOrEqual(50);
  });

  it('node is still upserted when createMentionsEdges throws (partial-write resilience)', async () => {
    // Simulate a corrupt symbols_fts by dropping it after CodeIndex creates schema
    const db = (idx as any).db;
    db.exec('DROP TABLE IF EXISTS symbols_fts');
    // createMentionsEdges catches its own error internally, so this should not throw
    const mem = makeMemoryInput({ content: 'processQueue causes issues' });
    await expect(incrementalEdgeUpdate(db, mem)).resolves.toBeUndefined();
    // Node must be present even though mentions edges could not be created
    const row = db.prepare('SELECT id FROM memory_nodes WHERE id = ?').get(mem.id);
    expect(row).toBeDefined();
  });
});

describe('buildMemoryGraph', () => {
  let tmpDir: string;
  let memoDir: string;
  let idx: CodeIndex;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    memoDir = path.join(tmpDir, 'memobank');
    fs.mkdirSync(path.join(memoDir, 'lesson'), { recursive: true });
    idx = new CodeIndex(path.join(tmpDir, 'code-index.db'));
  });

  afterEach(() => {
    idx.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('creates memory_nodes rows for each .md file', async () => {
    const db = (idx as any).db;
    fs.writeFileSync(
      path.join(memoDir, 'lesson', '2026-01-01-my-lesson.md'),
      '---\nname: my-lesson\ntype: lesson\ndescription: test\ntags: [a]\nstatus: active\ncreated: "2026-01-01"\n---\nsome content'
    );
    await buildMemoryGraph(db, memoDir);
    const row = db.prepare('SELECT id FROM memory_nodes WHERE id = ?').get('my-lesson');
    expect(row).toBeDefined();
  });

  it('skips files with unchanged content_hash (incremental)', async () => {
    const db = (idx as any).db;
    const filePath = path.join(memoDir, 'lesson', '2026-01-01-cached.md');
    const fileContent =
      '---\nname: cached\ntype: lesson\ndescription: d\ntags: []\nstatus: active\ncreated: "2026-01-01"\n---\nbody';
    fs.writeFileSync(filePath, fileContent);
    await buildMemoryGraph(db, memoDir); // first run — inserts
    // Inject a spurious row to verify it survives
    db.prepare(
      "INSERT INTO memory_edges (source_id, source_type, target_id, target_type, edge_type, created_at) VALUES ('sentinel', 'symbol', 'cached', 'memory', 'mentions', '2026-01-01')"
    ).run();
    await buildMemoryGraph(db, memoDir); // second run — should skip
    const edges = db
      .prepare('SELECT COUNT(*) AS n FROM memory_edges WHERE target_id = ?')
      .get('cached').n;
    expect(edges).toBe(1); // sentinel survives
  });
});

describe('CTE cycle guard', () => {
  let tmpDir: string;
  let idx: CodeIndex;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    idx = new CodeIndex(path.join(tmpDir, 'code-index.db'));
  });

  afterEach(() => {
    idx.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('does not infinite-loop on cyclic edges', () => {
    const db = (idx as any).db;
    // Create two memory nodes with a mutual related_to cycle
    db.prepare(
      `INSERT INTO memory_nodes (id, file_path, type, tags, status, content_hash, updated_at)
       VALUES ('node-a', '/a.md', 'lesson', '[]', 'active', 'ha', '2026-01-01'),
              ('node-b', '/b.md', 'lesson', '[]', 'active', 'hb', '2026-01-01')`
    ).run();
    db.prepare(
      `INSERT INTO memory_edges (source_id, source_type, target_id, target_type, edge_type, created_at)
       VALUES ('node-a', 'memory', 'node-b', 'memory', 'related_to', '2026-01-01'),
              ('node-b', 'memory', 'node-a', 'memory', 'related_to', '2026-01-01')`
    ).run();

    expect(() => {
      db.prepare(
        `
        WITH RECURSIVE graph(id, node_type, depth, visited) AS (
          SELECT 'node-a', 'memory', 0, '|node-a|'
          UNION ALL
          SELECT e.target_id, e.target_type, g.depth + 1,
                 g.visited || e.target_id || '|'
          FROM memory_edges e
          JOIN graph g ON e.source_id = g.id AND e.source_type = g.node_type
          WHERE g.depth < 2
            AND g.visited NOT LIKE '%|' || e.target_id || '|%'
        )
        SELECT DISTINCT id, node_type FROM graph
      `
      ).all();
    }).not.toThrow();
  });

  it('graphExpand from symbol seed only returns memory nodes (source_type isolation)', () => {
    const db = (idx as any).db;
    // Symbol → memory via 'mentions', then memory → memory via 'related_to'
    db.prepare(
      `INSERT INTO memory_nodes (id, file_path, type, tags, status, content_hash, updated_at)
       VALUES ('mem-1', '/m1.md', 'lesson', '[]', 'active', 'h1', '2026-01-01'),
              ('mem-2', '/m2.md', 'lesson', '[]', 'active', 'h2', '2026-01-01')`
    ).run();
    db.prepare(
      `INSERT INTO memory_edges (source_id, source_type, target_id, target_type, edge_type, created_at)
       VALUES ('sym-foo', 'symbol', 'mem-1', 'memory', 'mentions', '2026-01-01'),
              ('mem-1',  'memory', 'mem-2', 'memory', 'related_to', '2026-01-01')`
    ).run();

    const expanded = graphExpand(db, [{ id: 'sym-foo', node_type: 'symbol' }]);
    const expandedIds = expanded.map((r) => r.id);
    // Must include both reachable memory nodes; must NOT include the symbol itself
    expect(expandedIds).toContain('mem-1');
    expect(expandedIds).toContain('mem-2');
    expect(expandedIds).not.toContain('sym-foo');
    // mem-1 is depth 1 (direct from symbol), mem-2 is depth 2 (via mem-1)
    expect(expanded.find((r) => r.id === 'mem-1')?.minDepth).toBe(1);
    expect(expanded.find((r) => r.id === 'mem-2')?.minDepth).toBe(2);
  });
});
