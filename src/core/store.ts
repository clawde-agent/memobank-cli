/**
 * File I/O layer for memobank
 * Reads and writes .md files with YAML frontmatter
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { glob } from 'glob';
import { MemoryFile, MemoryType, Confidence } from '../types';

const MEMORY_TYPES: MemoryType[] = ['lesson', 'decision', 'workflow', 'architecture'];

/**
 * Find memobank root directory
 * Resolution order:
 * 1. --repo CLI flag (passed as parameter)
 * 2. MEMOBANK_REPO env var
 * 3. meta/config.yaml in cwd or parent dirs (walk up)
 * 4. ~/.memobank/<git-repo-name>/
 * 5. ~/.memobank/default/
 */
export function findRepoRoot(cwd: string, repoFlag?: string): string {
  // 1. CLI flag
  if (repoFlag) {
    return path.resolve(repoFlag);
  }

  // 2. Environment variable
  const envRepo = process.env.MEMOBANK_REPO;
  if (envRepo) {
    return path.resolve(envRepo);
  }

  // 3. Walk up looking for meta/config.yaml
  let current = cwd;
  while (current !== path.dirname(current)) {
    const configPath = path.join(current, 'meta', 'config.yaml');
    if (fs.existsSync(configPath)) {
      return current;
    }
    current = path.dirname(current);
  }

  // 4. Try to detect git repo name for ~/.memobank/<project>/
  try {
    // Check if we're in a git repo
    const gitRoot = path.join(cwd, '.git');
    if (fs.existsSync(gitRoot)) {
      // Try to get repo name from remote or use directory name
      const repoName = path.basename(cwd);
      const memobankPath = path.join(osHomeDir(), '.memobank', repoName);
      if (fs.existsSync(memobankPath)) {
        return memobankPath;
      }
    }
  } catch (e) {
    // Ignore git detection errors
  }

  // 5. Default: ~/.memobank/default/
  return path.join(osHomeDir(), '.memobank', 'default');
}

/**
 * Get home directory across platforms
 */
function osHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || '';
}

/**
 * Load all memory files from a repo
 */
export function loadAll(repoRoot: string): MemoryFile[] {
  const memories: MemoryFile[] = [];

  for (const type of MEMORY_TYPES) {
    const pattern = path.join(repoRoot, type, '**', '*.md');
    const files = glob.sync(pattern);

    for (const filePath of files) {
      try {
        const memory = loadFile(filePath);
        memories.push(memory);
      } catch (e) {
        // Skip files that can't be parsed
        console.warn(`Warning: Could not load ${filePath}: ${(e as Error).message}`);
      }
    }
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

  // Validate required fields
  if (!data.name || !data.type || !data.description || !data.created) {
    throw new Error(`Missing required frontmatter fields in ${filePath}`);
  }

  if (!MEMORY_TYPES.includes(data.type)) {
    throw new Error(`Invalid memory type "${data.type}" in ${filePath}`);
  }

  const memory: MemoryFile = {
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

  return memory;
}

/**
 * Write a new memory file
 * Creates filename from name + created date
 */
export function writeMemory(repoRoot: string, memory: Omit<MemoryFile, 'path'>): string {
  const typeDir = path.join(repoRoot, memory.type);

  // Ensure directory exists
  if (!fs.existsSync(typeDir)) {
    fs.mkdirSync(typeDir, { recursive: true });
  }

  // Generate filename: YYYY-MM-DD-name.md
  const date = new Date(memory.created);
  const dateStr = date.toISOString().split('T')[0];
  const slug = memory.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const filename = `${dateStr}-${slug}.md`;
  const filePath = path.join(typeDir, filename);

  // Build frontmatter
  const frontmatter: any = {
    name: memory.name,
    type: memory.type,
    description: memory.description,
    tags: memory.tags,
    created: memory.created,
  };

  if (memory.updated) frontmatter.updated = memory.updated;
  if (memory.review_after) frontmatter.review_after = memory.review_after;
  if (memory.confidence) frontmatter.confidence = memory.confidence;

  // Write file
  const fileContent = matter.stringify(memory.content, frontmatter);
  fs.writeFileSync(filePath, fileContent, 'utf-8');

  return filePath;
}

/**
 * Update MEMORY.md with recall results
 */
export function writeMemoryMd(repoRoot: string, results: Array<{ memory: MemoryFile; score: number }>, query: string, engine: string): void {
  const memoryDir = path.join(repoRoot, 'memory');
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }

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
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf-8');
}
