import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { glob } from 'glob';
import type { MemoryFile, MemoryType, Confidence, MemoryScope, Status } from '../types';

const MEMORY_TYPES: MemoryType[] = ['lesson', 'decision', 'workflow', 'architecture'];

function loadFromDir(baseDir: string, scope: MemoryScope): MemoryFile[] {
  const memories: MemoryFile[] = [];
  for (const type of MEMORY_TYPES) {
    const pattern = path.join(baseDir, type, '**', '*.md').split(path.sep).join('/');
    const files = glob.sync(pattern);
    for (const filePath of files) {
      try {
        const memory = loadFile(filePath);
        memory.scope = scope;
        memories.push(memory);
      } catch (e) {
        console.warn(`Warning: Could not load ${filePath}: ${(e as Error).message}`);
      }
    }
  }
  return memories;
}

export function loadAll(
  repoRoot: string,
  scope: MemoryScope | 'all' = 'all',
  globalDir?: string,
  workspaceDir?: string
): MemoryFile[] {
  const seenFilenames = new Set<string>();
  const memories: MemoryFile[] = [];

  const addFromDir = (dir: string, tierScope: MemoryScope): void => {
    if (!fs.existsSync(dir)) {
      return;
    }
    const tierMemories = loadFromDir(dir, tierScope);
    for (const m of tierMemories) {
      const filename = path.basename(m.path);
      if (!seenFilenames.has(filename)) {
        seenFilenames.add(filename);
        memories.push(m);
      }
    }
  };

  if (scope === 'all' || scope === 'project') {
    addFromDir(repoRoot, 'project');
  }
  if (scope === 'all' || scope === 'personal') {
    if (globalDir) {
      addFromDir(globalDir, 'personal');
    }
  }
  if (scope === 'all' || scope === 'workspace') {
    if (workspaceDir) {
      addFromDir(workspaceDir, 'workspace');
    }
  }

  if (memories.length === 0 && scope === 'all') {
    return loadFromDir(repoRoot, 'project');
  }

  return memories;
}

export function loadFile(filePath: string): MemoryFile {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const parsed = matter(fileContent);
  const data = parsed.data as Record<string, unknown>;

  if (!data.name || !data.type || !data.description || !data.created) {
    throw new Error(`Missing required frontmatter fields in ${filePath}`);
  }
  const dataType = data.type as string;
  if (!MEMORY_TYPES.includes(data.type as MemoryType)) {
    throw new Error(`Invalid memory type "${dataType}" in ${filePath}`);
  }

  return {
    path: filePath,
    name: data.name as string,
    type: data.type as MemoryType,
    description: data.description as string,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    created: data.created as string,
    updated: data.updated as string | undefined,
    review_after: data.review_after as string | undefined,
    confidence: (data.confidence as Confidence) || 'medium',
    status: (data.status as Status) || 'experimental',
    content: parsed.content,
    project: data.project as string | undefined,
    codeRefs: Array.isArray(data.codeRefs) ? (data.codeRefs as string[]) : undefined,
  };
}
