import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type { MemoryFile, MemoryType, Status, Confidence } from '../types';
import { loadAll } from './memory-loader';

export interface PendingCandidate {
  name: string;
  type: MemoryType;
  description: string;
  tags: string[];
  confidence: Confidence;
  content: string;
}

export interface PendingEntry {
  id: string;
  timestamp: string;
  projectId: string;
  candidates: PendingCandidate[];
}

export function writePending(memoBankDir: string, entry: PendingEntry): void {
  const pendingDir = path.resolve(memoBankDir, '.pending');
  if (!fs.existsSync(pendingDir)) {
    fs.mkdirSync(pendingDir, { recursive: true });
  }
  const safeId = entry.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const outPath = path.resolve(pendingDir, `${safeId}.json`);
  if (!outPath.startsWith(pendingDir + path.sep)) {
    throw new Error(`Security: pending file path escapes pending directory: ${outPath}`);
  }
  fs.writeFileSync(outPath, JSON.stringify(entry, null, 2), 'utf-8');
}

export function writeMemory(repoRoot: string, memory: Omit<MemoryFile, 'path' | 'scope'>): string {
  const typeDir = path.join(repoRoot, memory.type);
  if (!fs.existsSync(typeDir)) {
    fs.mkdirSync(typeDir, { recursive: true });
  }

  const date = new Date(memory.created);
  const dateStr = date.toISOString().split('T')[0];
  const slug = memory.name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  const filename = `${dateStr}-${slug}.md`;
  const filePath = path.join(typeDir, filename);

  const frontmatter: Record<string, unknown> = {
    name: memory.name,
    type: memory.type,
    description: memory.description,
    tags: memory.tags,
    created: memory.created,
    status: memory.status ?? 'experimental',
  };
  if (memory.updated) frontmatter.updated = memory.updated;
  if (memory.review_after) frontmatter.review_after = memory.review_after;
  if (memory.confidence) frontmatter.confidence = memory.confidence;
  if (memory.project) frontmatter.project = memory.project;
  if (memory.codeRefs) frontmatter.codeRefs = memory.codeRefs;

  const fileContent = matter.stringify(memory.content, frontmatter);
  fs.writeFileSync(filePath, fileContent, 'utf-8');

  try {
    interface CodeIndexModule {
      CodeIndex: {
        new (dbPath: string): { linkMemory(memPath: string, text: string): void; close(): void };
        getDbPath(repoRoot: string): string;
      };
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CodeIndex } = require('../engines/code-index') as CodeIndexModule;
    const dbPath = CodeIndex.getDbPath(repoRoot);
    if (fs.existsSync(dbPath)) {
      const idx = new CodeIndex(dbPath);
      try {
        idx.linkMemory(path.relative(repoRoot, filePath), memory.description);
      } finally {
        idx.close();
      }
    }
  } catch {
    // better-sqlite3 not installed or db locked — non-fatal
  }

  return filePath;
}

export function updateMemoryContent(repoRoot: string, name: string, newContent: string): void {
  const memories = loadAll(repoRoot, 'project');
  const target = memories.find((m) => m.name === name);
  if (!target) return;
  const raw = fs.readFileSync(target.path, 'utf-8');
  const fmEnd = raw.indexOf('\n---\n', 4);
  if (fmEnd === -1) return;
  const frontmatter = raw.slice(0, fmEnd + 5);
  fs.writeFileSync(target.path, frontmatter + newContent, 'utf-8');
}

export function updateMemoryStatus(filePath: string, status: Status): void {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = matter(content);
  (parsed.data as Record<string, unknown>).status = status;
  fs.writeFileSync(filePath, matter.stringify(parsed.content, parsed.data), 'utf-8');
}
