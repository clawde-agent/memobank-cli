import * as path from 'path';
import type { CodeSymbol, CodeEdge, SymbolResult } from '../types';

interface SymbolRow {
  name: string;
  qualified_name: string;
  kind: string;
  file: string;
  line_start: number;
  line_end: number;
  signature: string | null;
  docstring: string | null;
  is_exported: number;
  memory_refs: string | null;
  fts_rank?: number;
}

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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3');
    this.db = new Database(dbPath);
    this.db.exec(SCHEMA);
  }

  static isAvailable(): boolean {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
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
    if (!row) {
      return true;
    }
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
    if (!file) {
      return;
    }

    const insertSymbol = this.db.prepare(
      `INSERT INTO symbols
         (file_id, name, qualified_name, kind, signature, docstring, line_start, line_end, is_exported, memory_refs)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertEdge = this.db.prepare(
      `INSERT INTO edges (source_id, target_name, kind, line) VALUES (?, ?, ?, ?)`
    );

    const insertMany = this.db.transaction(() => {
      this.db.prepare('DELETE FROM symbols WHERE file_id = ?').run(file.id);
      const idMap = new Map<string, number>();

      for (const sym of symbols) {
        const memRefs = Array.isArray(sym.memoryRefs) ? sym.memoryRefs.join(',') : null;
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
          memRefs
        );
        idMap.set(sym.qualifiedName, result.lastInsertRowid as number);
      }

      for (const edge of edges) {
        const sourceId = idMap.get(edge.sourceName);
        if (sourceId === undefined) {
          continue;
        }
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
      .all(query, topK) as SymbolRow[];

    if (rows.length === 0) {
      return [];
    }

    const ranks = rows.map((r) => r.fts_rank ?? 0);
    const minRank = Math.min(...ranks);
    const maxRank = Math.max(...ranks);
    const range = maxRank - minRank || 1;

    return rows.map((r) => ({
      symbol: {
        name: r.name,
        qualifiedName: r.qualified_name,
        kind: r.kind as CodeSymbol['kind'],
        file: r.file,
        lineStart: r.line_start,
        lineEnd: r.line_end,
        signature: r.signature ?? undefined,
        docstring: r.docstring ?? undefined,
        isExported: Boolean(r.is_exported),
        memoryRefs: r.memory_refs ? r.memory_refs.split(',') : undefined,
      },
      score: 1 - ((r.fts_rank ?? 0) - minRank) / range,
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
      .all(symbolName) as SymbolRow[];

    return rows.map((r) => ({
      symbol: {
        name: r.name,
        qualifiedName: r.qualified_name,
        kind: r.kind as CodeSymbol['kind'],
        file: r.file,
        lineStart: r.line_start,
        lineEnd: r.line_end,
        signature: r.signature ?? undefined,
        docstring: r.docstring ?? undefined,
        isExported: Boolean(r.is_exported),
        memoryRefs: r.memory_refs ? r.memory_refs.split(',') : undefined,
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
