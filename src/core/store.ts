import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { glob } from 'glob';
import * as yaml from 'js-yaml';
import type { MemoryFile, MemoryType, Confidence, MemoryScope, Status } from '../types';

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

/** Directories that are never a memobank project dir */
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

export function findRepoRoot(cwd: string, repoFlag?: string): string {
  if (repoFlag) {
    return path.resolve(repoFlag);
  }
  const envRepo = process.env.MEMOBANK_REPO;
  if (envRepo) {
    return path.resolve(envRepo);
  }

  let current = cwd;
  while (current !== path.dirname(current)) {
    // Fast path: check default .memobank dir first
    const defaultConfigPath = path.join(current, '.memobank', 'meta', 'config.yaml');
    if (fs.existsSync(defaultConfigPath)) {
      return path.join(current, '.memobank');
    }

    // Scan immediate subdirs for a custom-named memobank dir
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name === '.memobank') {
          continue;
        }
        const customConfigPath = path.join(current, entry.name, 'meta', 'config.yaml');
        if (fs.existsSync(customConfigPath)) {
          return path.join(current, entry.name);
        }
      }
    } catch {
      /* ignore permission errors */
    }

    // Legacy: meta/config.yaml at root
    if (fs.existsSync(path.join(current, 'meta', 'config.yaml'))) {
      return current;
    }
    current = path.dirname(current);
  }

  try {
    const gitRoot = path.join(cwd, '.git');
    if (fs.existsSync(gitRoot)) {
      const repoName = path.basename(cwd);
      return path.join(osHomeDir(), '.memobank', repoName);
    }
  } catch {
    /* ignore */
  }

  return path.join(osHomeDir(), '.memobank', 'default');
}

/** Find the git repo root (the dir containing .git), or return cwd. */
export function findGitRoot(cwd: string): string {
  let current = cwd;
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return cwd;
}

/**
 * Resolve a stable project identifier for the current repo.
 * Priority: git remote origin → config.project.name → parent directory name.
 * memoBankDir is the .memobank/ directory (e.g. /repo/.memobank).
 */
export function resolveProjectId(memoBankDir: string): string {
  const gitCwd = path.dirname(memoBankDir);

  // 1. git remote origin
  try {
    const remote = execSync('git remote get-url origin', {
      cwd: gitCwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    }).trim();
    const match = remote.match(/[:/]([^/:]+\/[^/.]+?)(?:\.git)?$/);
    if (match?.[1]) {
      return match[1];
    }
  } catch {
    /* no remote or not a git repo — fall through */
  }

  // 2. explicit project.name in config YAML (parsed directly — no defaults applied)
  try {
    const configPath = path.join(memoBankDir, 'meta', 'config.yaml');
    if (fs.existsSync(configPath)) {
      const raw = yaml.load(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown> | null;
      const name = (raw?.project as Record<string, unknown> | undefined)?.name as
        | string
        | undefined;
      if (name) {
        return name;
      }
    }
  } catch {
    /* config unreadable — fall through */
  }

  // 3. parent directory name
  return path.basename(gitCwd);
}

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
  // Sanitize entry.id to prevent path traversal: allow only alphanumeric, dash, underscore.
  const safeId = entry.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const outPath = path.resolve(pendingDir, `${safeId}.json`);
  if (!outPath.startsWith(pendingDir + path.sep)) {
    throw new Error(`Security: pending file path escapes pending directory: ${outPath}`);
  }
  fs.writeFileSync(outPath, JSON.stringify(entry, null, 2), 'utf-8');
}

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

  // Legacy fallback: no tier dirs exist, load from root
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
  if (memory.updated) {
    frontmatter.updated = memory.updated;
  }
  if (memory.review_after) {
    frontmatter.review_after = memory.review_after;
  }
  if (memory.confidence) {
    frontmatter.confidence = memory.confidence;
  }
  if (memory.project) {
    frontmatter.project = memory.project;
  }
  if (memory.codeRefs) {
    frontmatter.codeRefs = memory.codeRefs;
  }

  const fileContent = matter.stringify(memory.content, frontmatter);
  fs.writeFileSync(filePath, fileContent, 'utf-8');

  // Auto-link to code symbols (optional dep — silent failure if not installed)
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

/** Patch status in a memory file's frontmatter in-place */
export function updateMemoryStatus(filePath: string, status: Status): void {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = matter(content);
  (parsed.data as Record<string, unknown>).status = status;
  fs.writeFileSync(filePath, matter.stringify(parsed.content, parsed.data), 'utf-8');
}

export function writeMemoryMd(
  repoRoot: string,
  results: Array<{ memory: MemoryFile; score: number }>,
  query: string,
  engine: string
): void {
  if (!fs.existsSync(repoRoot)) {
    fs.mkdirSync(repoRoot, { recursive: true });
  }
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
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf-8');
}
