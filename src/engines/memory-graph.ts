import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import matter from 'gray-matter';
import type { MemoryNodeInput } from '../types';

const MEMORY_TYPES = ['lesson', 'decision', 'workflow', 'architecture'];

const GRAPH_SCHEMA = `
CREATE TABLE IF NOT EXISTS memory_nodes (
  id           TEXT PRIMARY KEY,
  file_path    TEXT NOT NULL,
  type         TEXT NOT NULL,
  tags         TEXT NOT NULL,
  status       TEXT NOT NULL,
  embedding    BLOB,
  content_hash TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_edges (
  source_id    TEXT NOT NULL,
  source_type  TEXT NOT NULL CHECK (source_type IN ('symbol', 'memory')),
  target_id    TEXT NOT NULL,
  target_type  TEXT NOT NULL CHECK (target_type = 'memory'),
  edge_type    TEXT NOT NULL CHECK (
    (edge_type = 'mentions'   AND source_type = 'symbol') OR
    (edge_type = 'related_to' AND source_type = 'memory')
  ),
  weight       REAL DEFAULT 1.0,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (source_id, source_type, target_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_memory_edges_source ON memory_edges(source_id, source_type);
CREATE INDEX IF NOT EXISTS idx_memory_edges_target ON memory_edges(target_id);
`;

export function ensureGraphSchema(db: any): void {
  db.exec(GRAPH_SCHEMA);
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

function jaccardTagOverlap(tagsA: string[], tagsB: string[]): number {
  const setA = new Set(tagsA);
  const setB = new Set(tagsB);
  const intersection = [...setA].filter((t) => setB.has(t)).length;
  if (intersection === 0) return 0;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

function upsertMemoryNode(db: any, mem: MemoryNodeInput): void {
  db.prepare(
    `INSERT INTO memory_nodes (id, file_path, type, tags, status, content_hash, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       file_path=excluded.file_path, type=excluded.type, tags=excluded.tags,
       status=excluded.status, content_hash=excluded.content_hash, updated_at=excluded.updated_at`
  ).run(
    mem.id,
    mem.file_path,
    mem.type,
    JSON.stringify(mem.tags),
    mem.status,
    mem.content_hash,
    mem.updated_at
  );
}

function createMentionsEdges(db: any, mem: MemoryNodeInput): void {
  const words = mem.content
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9_]/g, ''))
    .filter((w) => w.length > 2);
  if (words.length === 0) return;

  const ftsQuery = words.join(' OR ');
  let symbolRows: { source_id: string }[];
  try {
    symbolRows = db
      .prepare(
        `SELECT DISTINCT s.name AS source_id
         FROM symbols_fts
         JOIN symbols s ON symbols_fts.rowid = s.id
         WHERE symbols_fts MATCH ?
         LIMIT 20`
      )
      .all(ftsQuery);
  } catch {
    return; // symbols_fts not present
  }

  const ins = db.prepare(
    `INSERT OR REPLACE INTO memory_edges
       (source_id, source_type, target_id, target_type, edge_type, created_at)
     VALUES (?, 'symbol', ?, 'memory', 'mentions', ?)`
  );
  const now = new Date().toISOString();
  for (const row of symbolRows) {
    ins.run(row.source_id, mem.id, now);
  }
}

function createRelatedToEdges(db: any, mem: MemoryNodeInput): void {
  if (mem.tags.length === 0) return;

  // Only consider memories that share at least one tag (pre-filter)
  const tagConditions = mem.tags.map(() => "tags LIKE '%' || ? || '%'").join(' OR ');
  const candidates: { id: string; tags: string }[] = db
    .prepare(`SELECT id, tags FROM memory_nodes WHERE id != ? AND (${tagConditions})`)
    .all(mem.id, ...mem.tags);

  const scored = candidates
    .map((row) => {
      let otherTags: string[];
      try {
        otherTags = JSON.parse(row.tags);
      } catch {
        return null;
      }
      const score = jaccardTagOverlap(mem.tags, otherTags);
      return score > 0 ? { id: row.id, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b!.score - a!.score)
    .slice(0, 50) as { id: string; score: number }[];

  const ins = db.prepare(
    `INSERT OR REPLACE INTO memory_edges
       (source_id, source_type, target_id, target_type, edge_type, weight, created_at)
     VALUES (?, 'memory', ?, 'memory', 'related_to', ?, ?)`
  );
  const now = new Date().toISOString();
  for (const candidate of scored) {
    if (candidate.score >= 0.3) {
      ins.run(mem.id, candidate.id, candidate.score, now);
    }
  }
}

export async function incrementalEdgeUpdate(db: any, memory: MemoryNodeInput): Promise<void> {
  ensureGraphSchema(db);

  // Skip rebuild if content_hash unchanged
  const existing = db
    .prepare('SELECT content_hash FROM memory_nodes WHERE id = ?')
    .get(memory.id) as { content_hash: string } | undefined;
  if (existing?.content_hash === memory.content_hash) return;

  upsertMemoryNode(db, memory);
  createMentionsEdges(db, memory);
  createRelatedToEdges(db, memory);
}

export async function buildMemoryGraph(db: any, memoDir: string): Promise<void> {
  ensureGraphSchema(db);

  for (const type of MEMORY_TYPES) {
    const typeDir = path.join(memoDir, type);
    if (!fs.existsSync(typeDir)) continue;

    for (const file of fs.readdirSync(typeDir).filter((f) => f.endsWith('.md'))) {
      const filePath = path.join(typeDir, file);
      let fileContent: string;
      try {
        fileContent = fs.readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }

      const contentHash = sha256(fileContent);
      const existing = db
        .prepare('SELECT content_hash FROM memory_nodes WHERE file_path = ?')
        .get(filePath) as { content_hash: string } | undefined;
      if (existing?.content_hash === contentHash) continue;

      let parsed: matter.GrayMatterFile<string>;
      try {
        parsed = matter(fileContent);
      } catch {
        continue;
      }
      const data = parsed.data as Record<string, unknown>;
      if (!data.name || !data.type) continue;

      const mem: MemoryNodeInput = {
        id: data.name as string,
        file_path: filePath,
        content: parsed.content,
        type: data.type as string,
        tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
        status: (data.status as string) ?? 'experimental',
        content_hash: contentHash,
        updated_at: new Date().toISOString(),
      };

      upsertMemoryNode(db, mem);
      createMentionsEdges(db, mem);
      createRelatedToEdges(db, mem);
    }
  }
}

export function graphExpand(db: any, seeds: Array<{ id: string; node_type: string }>): string[] {
  ensureGraphSchema(db);

  const expandedIds = new Set<string>();
  const cte = db.prepare(`
    WITH RECURSIVE graph(id, node_type, depth, visited) AS (
      SELECT ?, ?, 0, '|' || ? || '|'
      UNION ALL
      SELECT e.target_id, e.target_type, g.depth + 1,
             g.visited || e.target_id || '|'
      FROM memory_edges e
      JOIN graph g ON e.source_id = g.id AND e.source_type = g.node_type
      WHERE g.depth < 2
        AND g.visited NOT LIKE '%|' || e.target_id || '|%'
    )
    SELECT DISTINCT id, node_type FROM graph WHERE node_type = 'memory'
  `);

  for (const seed of seeds) {
    const rows = cte.all(seed.id, seed.node_type, seed.id) as { id: string }[];
    for (const row of rows) {
      expandedIds.add(row.id);
    }
  }
  return [...expandedIds];
}
