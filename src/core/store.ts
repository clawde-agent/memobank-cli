import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { glob } from 'glob';
import { MemoryFile, MemoryType, Confidence, MemoryScope, Status } from '../types';

const MEMORY_TYPES: MemoryType[] = ['lesson', 'decision', 'workflow', 'architecture'];

function osHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || '';
}

/** Personal tier: ~/.memobank/<project-name>/ */
export function getGlobalDir(projectName: string): string {
  return path.join(osHomeDir(), '.memobank', projectName);
}

/** Project/team tier: the repo root itself (.memobank/ in repo) */
export function getProjectDir(repoRoot: string): string {
  return repoRoot;
}

/** Workspace tier (cross-repo): ~/.memobank/_workspace/<name>/ */
export function getWorkspaceDir(workspaceName: string): string {
  return path.join(osHomeDir(), '.memobank', '_workspace', workspaceName);
}

export function findRepoRoot(cwd: string, repoFlag?: string): string {
  if (repoFlag) { return path.resolve(repoFlag); }
  const envRepo = process.env.MEMOBANK_REPO;
  if (envRepo) { return path.resolve(envRepo); }

  let current = cwd;
  while (current !== path.dirname(current)) {
    const configPath = path.join(current, '.memobank', 'meta', 'config.yaml');
    if (fs.existsSync(configPath)) { return path.join(current, '.memobank'); }
    // Legacy: meta/config.yaml at root
    if (fs.existsSync(path.join(current, 'meta', 'config.yaml'))) { return current; }
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

function loadFromDir(baseDir: string, scope: MemoryScope): MemoryFile[] {
  const memories: MemoryFile[] = [];
  for (const type of MEMORY_TYPES) {
    const pattern = path.join(baseDir, type, '**', '*.md');
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

/**
 * Load memories from all configured tiers.
 * Priority: project > personal > workspace (for deduplication by filename).
 * globalDir and workspaceDir are optional; if absent, those tiers are skipped silently.
 */
export function loadAll(
  repoRoot: string,
  scope: MemoryScope | 'all' = 'all',
  globalDir?: string,
  workspaceDir?: string
): MemoryFile[] {
  const seenFilenames = new Set<string>();
  const memories: MemoryFile[] = [];

  const addFromDir = (dir: string, tierScope: MemoryScope) => {
    if (!fs.existsSync(dir)) { return; }
    const tierMemories = loadFromDir(dir, tierScope);
    for (const m of tierMemories) {
      const filename = path.basename(m.path);
      if (!seenFilenames.has(filename)) {
        seenFilenames.add(filename);
        memories.push(m);
      }
    }
  };

  if (scope === 'all' || scope === 'project') { addFromDir(repoRoot, 'project'); }
  if (scope === 'all' || scope === 'personal') {
    if (globalDir) { addFromDir(globalDir, 'personal'); }
  }
  if (scope === 'all' || scope === 'workspace') {
    if (workspaceDir) { addFromDir(workspaceDir, 'workspace'); }
  }

  // Legacy fallback: no tier dirs exist, load from root
  if (memories.length === 0 && scope === 'all') {
    return loadFromDir(repoRoot, 'project');
  }

  return memories;
}

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
    status: data.status as Status | undefined,
    content: parsed.content,
  };
}

export function writeMemory(
  repoRoot: string,
  memory: Omit<MemoryFile, 'path' | 'scope'>
): string {
  const typeDir = path.join(repoRoot, memory.type);
  if (!fs.existsSync(typeDir)) { fs.mkdirSync(typeDir, { recursive: true }); }

  const date = new Date(memory.created);
  const dateStr = date.toISOString().split('T')[0];
  const slug = memory.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const filename = `${dateStr}-${slug}.md`;
  const filePath = path.join(typeDir, filename);

  const frontmatter: any = {
    name: memory.name,
    type: memory.type,
    description: memory.description,
    tags: memory.tags,
    created: memory.created,
    status: memory.status ?? 'experimental',
  };
  if (memory.updated) { frontmatter.updated = memory.updated; }
  if (memory.review_after) { frontmatter.review_after = memory.review_after; }
  if (memory.confidence) { frontmatter.confidence = memory.confidence; }

  const fileContent = matter.stringify(memory.content, frontmatter);
  fs.writeFileSync(filePath, fileContent, 'utf-8');
  return filePath;
}

/** Patch status in a memory file's frontmatter in-place */
export function updateMemoryStatus(filePath: string, status: Status): void {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = matter(content);
  parsed.data.status = status;
  fs.writeFileSync(filePath, matter.stringify(parsed.content, parsed.data), 'utf-8');
}

export function writeMemoryMd(
  repoRoot: string,
  results: Array<{ memory: MemoryFile; score: number }>,
  query: string,
  engine: string
): void {
  if (!fs.existsSync(repoRoot)) { fs.mkdirSync(repoRoot, { recursive: true }); }
  const filePath = path.join(repoRoot, 'MEMORY.md');

  let markdown = `<!-- Last updated: ${new Date().toISOString()} | query: "${query}" | engine: ${engine} | top ${results.length} -->\n\n`;
  markdown += `## Recalled Memory\n\n`;

  if (results.length === 0) {
    markdown += `*No memories found for "${query}"*\n`;
  } else {
    for (const result of results) {
      const { memory } = result;
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

export function readMemoryMd(repoRoot: string): string | null {
  const filePath = path.join(repoRoot, 'MEMORY.md');
  if (!fs.existsSync(filePath)) { return null; }
  return fs.readFileSync(filePath, 'utf-8');
}
