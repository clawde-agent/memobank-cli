/**
 * File I/O layer for memobank
 * Reads and writes .md files with YAML frontmatter
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { glob } from 'glob';
import { MemoryFile, MemoryType, Confidence, MemoryScope } from '../types';

const MEMORY_TYPES: MemoryType[] = ['lesson', 'decision', 'workflow', 'architecture'];

export function findRepoRoot(cwd: string, repoFlag?: string): string {
  if (repoFlag) { return path.resolve(repoFlag); }

  const envRepo = process.env.MEMOBANK_REPO;
  if (envRepo) { return path.resolve(envRepo); }

  let current = cwd;
  while (current !== path.dirname(current)) {
    const configPath = path.join(current, 'meta', 'config.yaml');
    if (fs.existsSync(configPath)) { return current; }
    current = path.dirname(current);
  }

  try {
    const gitRoot = path.join(cwd, '.git');
    if (fs.existsSync(gitRoot)) {
      const repoName = path.basename(cwd);
      return path.join(osHomeDir(), '.memobank', repoName);
    }
  } catch (e) { /* ignore */ }

  return path.join(osHomeDir(), '.memobank', 'default');
}

function osHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || '';
}

export function getPersonalDir(repoRoot: string): string {
  return path.join(repoRoot, 'personal');
}

export function getTeamDir(repoRoot: string): string {
  return path.join(repoRoot, 'team');
}

function loadFromDir(baseDir: string, scope?: MemoryScope): MemoryFile[] {
  const memories: MemoryFile[] = [];
  for (const type of MEMORY_TYPES) {
    const pattern = path.join(baseDir, type, '**', '*.md');
    const files = glob.sync(pattern);
    for (const filePath of files) {
      try {
        const memory = loadFile(filePath);
        if (scope) { memory.scope = scope; }
        memories.push(memory);
      } catch (e) {
        console.warn(`Warning: Could not load ${filePath}: ${(e as Error).message}`);
      }
    }
  }
  return memories;
}

export function loadAll(repoRoot: string, scope: MemoryScope = 'all'): MemoryFile[] {
  const personalDir = getPersonalDir(repoRoot);
  const teamDir = getTeamDir(repoRoot);
  const hasPersonal = fs.existsSync(personalDir);
  const hasTeam = fs.existsSync(teamDir);

  // Legacy fallback: memories at root level
  if (!hasPersonal && !hasTeam) {
    return loadFromDir(repoRoot);
  }

  const memories: MemoryFile[] = [];

  if ((scope === 'all' || scope === 'personal') && hasPersonal) {
    memories.push(...loadFromDir(personalDir, 'personal'));
  }
  if ((scope === 'all' || scope === 'team') && hasTeam) {
    memories.push(...loadFromDir(teamDir, 'team'));
  }

  return memories;
}

/**
 * Load a single memory file
 */
export function loadFile(filePath: string): MemoryFile {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const parsed = matter(fileContent);
  const data = parsed.data as any;

  if (!data.name || !data.type || !data.description || !data.created) {
    throw new Error(`Missing required frontmatter fields in ${filePath}`);
  }
  if (!MEMORY_TYPES.includes(data.type)) {
    throw new Error(`Invalid memory type "${data.type}" in ${filePath}`);
  }

  return {
    path: filePath,
    name: data.name,
    type: data.type as MemoryType,
    description: data.description,
    tags: Array.isArray(data.tags) ? data.tags : [],
    created: data.created,
    updated: data.updated,
    review_after: data.review_after,
    confidence: data.confidence as Confidence,
    content: parsed.content,
  };
}

export function writeMemory(repoRoot: string, memory: Omit<MemoryFile, 'path' | 'scope'>): string {
  const personalDir = getPersonalDir(repoRoot);
  const baseDir = fs.existsSync(personalDir) ? personalDir : repoRoot;
  const typeDir = path.join(baseDir, memory.type);

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

  const frontmatter: any = {
    name: memory.name,
    type: memory.type,
    description: memory.description,
    tags: memory.tags,
    created: memory.created,
  };
  if (memory.updated) { frontmatter.updated = memory.updated; }
  if (memory.review_after) { frontmatter.review_after = memory.review_after; }
  if (memory.confidence) { frontmatter.confidence = memory.confidence; }

  const fileContent = matter.stringify(memory.content, frontmatter);
  fs.writeFileSync(filePath, fileContent, 'utf-8');
  return filePath;
}

export function migrateToPersonal(repoRoot: string): { migrated: string[]; skipped: string[] } {
  const migrated: string[] = [];
  const skipped: string[] = [];
  const personalDir = getPersonalDir(repoRoot);

  for (const type of MEMORY_TYPES) {
    const srcTypeDir = path.join(repoRoot, type);
    if (!fs.existsSync(srcTypeDir)) { continue; }

    const dstTypeDir = path.join(personalDir, type);
    const files = glob.sync(path.join(srcTypeDir, '*.md'));

    for (const srcFile of files) {
      const filename = path.basename(srcFile);
      const dstFile = path.join(dstTypeDir, filename);

      if (fs.existsSync(dstFile)) {
        skipped.push(srcFile);
        continue;
      }

      fs.mkdirSync(dstTypeDir, { recursive: true });
      fs.renameSync(srcFile, dstFile);
      migrated.push(srcFile);
    }
  }

  return { migrated, skipped };
}

/**
 * Update MEMORY.md with recall results
 */
export function writeMemoryMd(
  repoRoot: string,
  results: Array<{ memory: MemoryFile; score: number }>,
  query: string,
  engine: string
): void {
  const memoryDir = path.join(repoRoot, 'memory');
  if (!fs.existsSync(memoryDir)) { fs.mkdirSync(memoryDir, { recursive: true }); }
  const filePath = path.join(memoryDir, 'MEMORY.md');

  let markdown = `<!-- Last updated: ${new Date().toISOString()} | query: "${query}" | engine: ${engine} | top ${results.length} -->\n\n`;
  markdown += `## Recalled Memory\n\n`;

  if (results.length === 0) {
    markdown += `*No memories found for "${query}"*\n`;
  } else {
    for (const result of results) {
      const { memory, score } = result;
      const relativePath = path.relative(repoRoot, memory.path);
      const confidenceStr = memory.confidence ? ` · ${memory.confidence} confidence` : '';
      const tagStr = memory.tags.length > 0 ? ` · tags: ${memory.tags.join(', ')}` : '';
      markdown += `### [${memory.type}] ${memory.name}${confidenceStr}\n`;
      markdown += `> ${memory.description}\n`;
      markdown += `> \`${relativePath}\`${tagStr}\n\n`;
    }
  }
  markdown += `---\n`;
  markdown += `*${results.length} memories · engine: ${engine}*`;
  fs.writeFileSync(filePath, markdown, 'utf-8');
}

/**
 * Read MEMORY.md content
 */
export function readMemoryMd(repoRoot: string): string | null {
  const filePath = path.join(repoRoot, 'memory', 'MEMORY.md');
  if (!fs.existsSync(filePath)) { return null; }
  return fs.readFileSync(filePath, 'utf-8');
}
