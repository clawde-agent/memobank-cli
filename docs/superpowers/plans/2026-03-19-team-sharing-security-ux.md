# Team Sharing, Security & UX Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Git-native team memory sharing, secret-leak prevention, dual-source recall with score explanations, cross-platform auto-capture hooks, and a 4-step interactive onboarding TUI.

**Architecture:** Two-layer storage (`personal/` + `team/`) under the memobank repo root; `team/` is a separate git repo synced to a remote. New commands (`memo team`, `memo scan`) are added alongside enhanced versions of `recall`, `install`, and `onboarding`. Platform adapters in `src/platforms/` are extended to cover Gemini, Qwen, and Claude Code Stop hooks.

**Tech Stack:** TypeScript 5.3, Commander.js, Ink + ink-select-input + ink-text-input (TUI), gray-matter (frontmatter), js-yaml (config), child_process.execSync (git operations), Jest + ts-jest (tests).

**Prerequisites before Chunk 6:** `tsconfig.json` must have `"jsx": "react-jsx"` and `@types/react` must be installed (`npm install --save-dev @types/react`). These are added as explicit steps in Task 9.

**Spec:** `docs/superpowers/specs/2026-03-19-team-sharing-security-ux-design.md`

**Test command:** `NODE_OPTIONS=--experimental-vm-modules jest`
**Build command:** `tsc`

---

## Chunk 1: Foundation — Types, Config, Store

### Task 1: Extend types and config

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config.ts`

- [ ] **Step 1: Add new types to `src/types.ts`**

Replace the file contents with the following (adds `MemoryScope`, `TeamConfig`, `ScoreBreakdown`; extends `MemoryFile`, `RecallResult`, `MemoConfig`):

```typescript
/**
 * Shared TypeScript interfaces for memobank-cli
 */

export type MemoryType = 'lesson' | 'decision' | 'workflow' | 'architecture';
export type Engine = 'text' | 'lancedb';
export type Confidence = 'low' | 'medium' | 'high';
export type MemoryScope = 'personal' | 'team' | 'all';

export interface MemoryFile {
  path: string;           // absolute path to .md file
  name: string;           // frontmatter slug
  type: MemoryType;
  description: string;    // one-sentence summary
  tags: string[];
  created: string;        // ISO date
  updated?: string;
  review_after?: string;  // e.g. "90d"
  confidence?: Confidence;
  content: string;        // Markdown body (below ---)
  scope?: MemoryScope;    // 'personal' | 'team' | undefined (legacy root-level)
}

export interface ScoreBreakdown {
  keyword: number;  // 0-1, weighted keyword match
  tags: number;     // 0-1, tag overlap score
  recency: number;  // 0-1, Weibull decay score
}

export interface RecallResult {
  memory: MemoryFile;
  score: number;                    // final composite score (0-1)
  scoreBreakdown?: ScoreBreakdown;  // present when --explain is requested
}

export interface TeamConfig {
  remote: string;
  auto_sync: boolean;
  branch: string;
}

export interface MemoConfig {
  project: { name: string; description?: string };
  memory: { token_budget: number; top_k: number };
  embedding: {
    engine: Engine;
    provider?: string;
    model?: string;
    base_url?: string;
    dimensions?: number;
  };
  search: { use_tags: boolean; use_summary: boolean };
  review: { enabled: boolean };
  team?: TeamConfig;
}

export interface ExtractionResult {
  name: string;
  type: MemoryType;
  description: string;
  tags: string[];
  confidence: Confidence;
  content: string;
}
```

- [ ] **Step 2: Add team config to `src/config.ts` DEFAULT_CONFIG and merge logic**

In `DEFAULT_CONFIG`, `team` is intentionally absent (optional). Update `loadConfig` to merge `team` if present:

```typescript
// In loadConfig, add after the review merge:
...(loaded?.team ? { team: loaded.team as TeamConfig } : {}),
```

Also add `TeamConfig` to the import:
```typescript
import { MemoConfig, Engine, TeamConfig } from './types';
```

- [ ] **Step 3: Build and verify no type errors**

```bash
cd /home/ubuntu/.openclaw/workspace-code/memobank-cli && tsc --noEmit
```

Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/config.ts
git commit -m "feat: add MemoryScope, TeamConfig, ScoreBreakdown types; extend MemoConfig"
```

---

### Task 2: Update store.ts for personal/team directory layout

**Files:**
- Modify: `src/core/store.ts`
- Create: `tests/store.test.ts`

- [ ] **Step 1: Write failing tests for the new store behavior**

Create `tests/store.test.ts`:

```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getPersonalDir,
  getTeamDir,
  loadAll,
  writeMemory,
  migrateToPersonal,
} from '../src/core/store';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-test-'));
  // create meta/config.yaml so findRepoRoot resolves here
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: test\n');
  return dir;
}

function writeTestMemory(dir: string, type: string, filename: string): void {
  fs.mkdirSync(path.join(dir, type), { recursive: true });
  const content = `---\nname: test-memory\ntype: ${type}\ndescription: A test\ntags: []\ncreated: "2026-01-01"\n---\n\nContent here.`;
  fs.writeFileSync(path.join(dir, type, filename), content);
}

describe('getPersonalDir', () => {
  it('returns personal/ path under repoRoot', () => {
    expect(getPersonalDir('/home/user/.memobank/proj')).toBe(
      '/home/user/.memobank/proj/personal'
    );
  });
});

describe('getTeamDir', () => {
  it('returns team/ path under repoRoot', () => {
    expect(getTeamDir('/home/user/.memobank/proj')).toBe(
      '/home/user/.memobank/proj/team'
    );
  });
});

describe('loadAll', () => {
  it('falls back to root-level loading when personal/ does not exist', () => {
    const repo = makeTempRepo();
    writeTestMemory(repo, 'lesson', '2026-01-01-test.md');
    const memories = loadAll(repo);
    expect(memories.length).toBe(1);
    expect(memories[0].scope).toBeUndefined();
    fs.rmSync(repo, { recursive: true });
  });

  it('loads from personal/ when it exists, labels scope=personal', () => {
    const repo = makeTempRepo();
    const personalDir = path.join(repo, 'personal');
    writeTestMemory(personalDir, 'lesson', '2026-01-01-personal.md');
    const memories = loadAll(repo);
    expect(memories.length).toBe(1);
    expect(memories[0].scope).toBe('personal');
    fs.rmSync(repo, { recursive: true });
  });

  it('loads from team/ when it exists, labels scope=team', () => {
    const repo = makeTempRepo();
    const teamDir = path.join(repo, 'team');
    writeTestMemory(teamDir, 'lesson', '2026-01-01-team.md');
    const memories = loadAll(repo);
    expect(memories.length).toBe(1);
    expect(memories[0].scope).toBe('team');
    fs.rmSync(repo, { recursive: true });
  });

  it('loads from both personal/ and team/ when both exist', () => {
    const repo = makeTempRepo();
    writeTestMemory(path.join(repo, 'personal'), 'lesson', '2026-01-01-p.md');
    writeTestMemory(path.join(repo, 'team'), 'lesson', '2026-01-01-t.md');
    const memories = loadAll(repo);
    expect(memories.length).toBe(2);
    expect(memories.map(m => m.scope).sort()).toEqual(['personal', 'team']);
    fs.rmSync(repo, { recursive: true });
  });

  it('respects scope=personal filter', () => {
    const repo = makeTempRepo();
    writeTestMemory(path.join(repo, 'personal'), 'lesson', '2026-01-01-p.md');
    writeTestMemory(path.join(repo, 'team'), 'lesson', '2026-01-01-t.md');
    const memories = loadAll(repo, 'personal');
    expect(memories.length).toBe(1);
    expect(memories[0].scope).toBe('personal');
    fs.rmSync(repo, { recursive: true });
  });
});

describe('writeMemory', () => {
  it('writes to personal/ when personal/ exists', () => {
    const repo = makeTempRepo();
    fs.mkdirSync(path.join(repo, 'personal'), { recursive: true });
    const filePath = writeMemory(repo, {
      name: 'test-lesson',
      type: 'lesson',
      description: 'A test lesson',
      tags: [],
      created: '2026-01-01',
      content: 'Content',
    });
    expect(filePath).toContain('personal');
    fs.rmSync(repo, { recursive: true });
  });

  it('writes to root level when personal/ does not exist (legacy)', () => {
    const repo = makeTempRepo();
    const filePath = writeMemory(repo, {
      name: 'test-lesson',
      type: 'lesson',
      description: 'A test lesson',
      tags: [],
      created: '2026-01-01',
      content: 'Content',
    });
    expect(filePath).not.toContain('personal');
    fs.rmSync(repo, { recursive: true });
  });
});

describe('migrateToPersonal', () => {
  it('moves root-level memories to personal/', () => {
    const repo = makeTempRepo();
    writeTestMemory(repo, 'lesson', '2026-01-01-test.md');
    const result = migrateToPersonal(repo);
    expect(result.migrated.length).toBe(1);
    expect(result.skipped.length).toBe(0);
    expect(fs.existsSync(path.join(repo, 'personal', 'lesson', '2026-01-01-test.md'))).toBe(true);
    expect(fs.existsSync(path.join(repo, 'lesson', '2026-01-01-test.md'))).toBe(false);
    fs.rmSync(repo, { recursive: true });
  });

  it('skips files that already exist in personal/', () => {
    const repo = makeTempRepo();
    writeTestMemory(repo, 'lesson', '2026-01-01-test.md');
    writeTestMemory(path.join(repo, 'personal'), 'lesson', '2026-01-01-test.md');
    const result = migrateToPersonal(repo);
    expect(result.migrated.length).toBe(0);
    expect(result.skipped.length).toBe(1);
    fs.rmSync(repo, { recursive: true });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/ubuntu/.openclaw/workspace-code/memobank-cli && NODE_OPTIONS=--experimental-vm-modules jest tests/store.test.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `getPersonalDir`, `getTeamDir`, `migrateToPersonal` not found.

- [ ] **Step 3: Update `src/core/store.ts`**

Replace the file with:

```typescript
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

/**
 * Find memobank root directory
 */
export function findRepoRoot(cwd: string, repoFlag?: string): string {
  if (repoFlag) return path.resolve(repoFlag);

  const envRepo = process.env.MEMOBANK_REPO;
  if (envRepo) return path.resolve(envRepo);

  let current = cwd;
  while (current !== path.dirname(current)) {
    const configPath = path.join(current, 'meta', 'config.yaml');
    if (fs.existsSync(configPath)) return current;
    current = path.dirname(current);
  }

  try {
    const gitRoot = path.join(cwd, '.git');
    if (fs.existsSync(gitRoot)) {
      const repoName = path.basename(cwd);
      const memobankPath = path.join(osHomeDir(), '.memobank', repoName);
      if (fs.existsSync(memobankPath)) return memobankPath;
    }
  } catch (e) { /* ignore */ }

  return path.join(osHomeDir(), '.memobank', 'default');
}

function osHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || '';
}

/** Returns the personal/ directory path */
export function getPersonalDir(repoRoot: string): string {
  return path.join(repoRoot, 'personal');
}

/** Returns the team/ directory path */
export function getTeamDir(repoRoot: string): string {
  return path.join(repoRoot, 'team');
}

/**
 * Load memory files from a specific base directory (no scope label)
 */
function loadFromDir(baseDir: string, scope?: MemoryScope): MemoryFile[] {
  const memories: MemoryFile[] = [];
  for (const type of MEMORY_TYPES) {
    const pattern = path.join(baseDir, type, '**', '*.md');
    const files = glob.sync(pattern);
    for (const filePath of files) {
      try {
        const memory = loadFile(filePath);
        if (scope) memory.scope = scope;
        memories.push(memory);
      } catch (e) {
        console.warn(`Warning: Could not load ${filePath}: ${(e as Error).message}`);
      }
    }
  }
  return memories;
}

/**
 * Load all memory files from a repo.
 * - If personal/ exists: load from personal/ and/or team/ based on scope.
 * - Otherwise: fall back to root-level loading (legacy pre-migration installs).
 */
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

/**
 * Write a new memory file.
 * Writes to personal/ if it exists, otherwise to root level (legacy).
 */
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
  if (memory.updated) frontmatter.updated = memory.updated;
  if (memory.review_after) frontmatter.review_after = memory.review_after;
  if (memory.confidence) frontmatter.confidence = memory.confidence;

  const fileContent = matter.stringify(memory.content, frontmatter);
  fs.writeFileSync(filePath, fileContent, 'utf-8');
  return filePath;
}

/**
 * Migrate root-level memories to personal/.
 * Moves files that don't already exist in personal/.
 * Returns { migrated, skipped } file paths.
 */
export function migrateToPersonal(repoRoot: string): { migrated: string[]; skipped: string[] } {
  const migrated: string[] = [];
  const skipped: string[] = [];
  const personalDir = getPersonalDir(repoRoot);

  for (const type of MEMORY_TYPES) {
    const srcTypeDir = path.join(repoRoot, type);
    if (!fs.existsSync(srcTypeDir)) continue;

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
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}
```

- [ ] **Step 4: Run tests — must pass**

```bash
NODE_OPTIONS=--experimental-vm-modules jest tests/store.test.ts --no-coverage 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
NODE_OPTIONS=--experimental-vm-modules jest --no-coverage 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/store.ts tests/store.test.ts
git commit -m "feat: update store for personal/team directory layout with migration support"
```

---

## Chunk 2: Team Commands

### Task 3: Create `src/commands/team.ts`

**Files:**
- Create: `src/commands/team.ts`
- Create: `tests/team.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/team.test.ts`:

```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { installPreCommitHook, getTeamSyncStatus } from '../src/commands/team';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memo-team-test-'));
}

describe('installPreCommitHook', () => {
  it('creates pre-commit hook file in team/.git/hooks/', () => {
    const tmp = makeTempDir();
    const hooksDir = path.join(tmp, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    installPreCommitHook(tmp);
    const hookPath = path.join(hooksDir, 'pre-commit');
    expect(fs.existsSync(hookPath)).toBe(true);
    const content = fs.readFileSync(hookPath, 'utf-8');
    expect(content).toContain('memo scan --staged --fail-on-secrets');
    fs.rmSync(tmp, { recursive: true });
  });

  it('makes pre-commit hook executable', () => {
    const tmp = makeTempDir();
    const hooksDir = path.join(tmp, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    installPreCommitHook(tmp);
    const hookPath = path.join(hooksDir, 'pre-commit');
    const stat = fs.statSync(hookPath);
    // Check executable bit (owner execute)
    expect(stat.mode & 0o100).toBeTruthy();
    fs.rmSync(tmp, { recursive: true });
  });
});

describe('getTeamSyncStatus', () => {
  it('returns { hasTeam: false } when team/ does not exist', () => {
    const tmp = makeTempDir();
    const status = getTeamSyncStatus(tmp);
    expect(status.hasTeam).toBe(false);
    fs.rmSync(tmp, { recursive: true });
  });

  it('returns { hasTeam: true } when team/ exists with .git', () => {
    const tmp = makeTempDir();
    fs.mkdirSync(path.join(tmp, 'team', '.git'), { recursive: true });
    const status = getTeamSyncStatus(tmp);
    expect(status.hasTeam).toBe(true);
    fs.rmSync(tmp, { recursive: true });
  });
});
```

- [ ] **Step 2: Run tests — must fail**

```bash
NODE_OPTIONS=--experimental-vm-modules jest tests/team.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `installPreCommitHook` not found.

- [ ] **Step 3: Create `src/commands/team.ts`**

Note: `scanFile` is imported dynamically inside `teamPublish` to avoid a circular dependency with `scan.ts` (which is created in a later task).

```typescript
/**
 * Team memory commands
 * memo team init <remote>  — clone/init team repo
 * memo team sync           — pull + commit + push
 * memo team publish <file> — scan then stage in team/
 * memo team status         — show git status of team/
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { findRepoRoot, getTeamDir, migrateToPersonal, getPersonalDir } from '../core/store';
import { loadConfig, writeConfig } from '../config';
// scanFile is imported dynamically in teamPublish to allow team.ts to be created before scan.ts

const MEMORY_TYPES = ['lesson', 'decision', 'workflow', 'architecture', 'meta'];

const PRE_COMMIT_HOOK = `#!/bin/sh
# memobank secret scanner — installed by memo team init
memo scan --staged --fail-on-secrets
`;

/**
 * Install pre-commit hook in team/.git/hooks/pre-commit
 */
export function installPreCommitHook(teamDir: string): void {
  const hooksDir = path.join(teamDir, '.git', 'hooks');
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }
  const hookPath = path.join(hooksDir, 'pre-commit');
  fs.writeFileSync(hookPath, PRE_COMMIT_HOOK, 'utf-8');
  fs.chmodSync(hookPath, 0o755);
}

/**
 * Get team sync status (whether team/ exists and is a git repo)
 */
export function getTeamSyncStatus(repoRoot: string): { hasTeam: boolean; ahead?: number; behind?: number } {
  const teamDir = getTeamDir(repoRoot);
  if (!fs.existsSync(path.join(teamDir, '.git'))) {
    return { hasTeam: false };
  }
  return { hasTeam: true };
}

/**
 * memo team init <remote-url>
 * Clones remote into team/ (or inits if empty), installs pre-commit hook, updates config.
 */
export async function teamInit(remoteUrl: string, repoRoot: string): Promise<void> {
  const teamDir = getTeamDir(repoRoot);

  if (fs.existsSync(teamDir)) {
    console.log(`team/ directory already exists. Run: memo team sync`);
    return;
  }

  // Check if personal/ needs migration first
  const personalDir = getPersonalDir(repoRoot);
  if (!fs.existsSync(personalDir)) {
    console.log('Migrating existing memories to personal/ before setting up team...');
    const { migrated, skipped } = migrateToPersonal(repoRoot);
    if (migrated.length > 0) console.log(`  Migrated ${migrated.length} memories.`);
    if (skipped.length > 0) {
      console.warn(`  Skipped ${skipped.length} files (conflict with existing personal/ files):`);
      skipped.forEach(f => console.warn(`    ${f}`));
    }
    fs.mkdirSync(personalDir, { recursive: true });
  }

  // Try cloning (works if remote has commits)
  let cloned = false;
  try {
    execSync(`git clone "${remoteUrl}" "${teamDir}"`, { stdio: 'pipe' });
    cloned = true;
    console.log('✓ Cloned team repository.');
  } catch {
    // Remote is likely empty — init locally and push
  }

  if (!cloned) {
    // Init empty repo
    fs.mkdirSync(teamDir, { recursive: true });
    execSync(`git init "${teamDir}"`, { stdio: 'pipe' });
    execSync(`git -C "${teamDir}" remote add origin "${remoteUrl}"`, { stdio: 'pipe' });

    for (const type of MEMORY_TYPES) {
      const typeDir = path.join(teamDir, type);
      fs.mkdirSync(typeDir, { recursive: true });
      fs.writeFileSync(path.join(typeDir, '.gitkeep'), '');
    }

    execSync(`git -C "${teamDir}" add -A`, { stdio: 'pipe' });
    execSync(
      `git -C "${teamDir}" commit -m "chore: initialize team memory repo"`,
      { stdio: 'pipe' }
    );
    execSync(`git -C "${teamDir}" push -u origin main`, { stdio: 'pipe' });
    console.log('✓ Initialized and pushed empty team repository.');
  }

  installPreCommitHook(teamDir);
  console.log('✓ Pre-commit hook installed.');

  // Write team config
  const config = loadConfig(repoRoot);
  config.team = { remote: remoteUrl, auto_sync: false, branch: 'main' };
  writeConfig(repoRoot, config);
  console.log(`✓ Team remote configured: ${remoteUrl}`);
}

/**
 * memo team sync
 * pull → git add -A → commit (if staged) → push
 */
export async function teamSync(repoRoot: string): Promise<void> {
  const config = loadConfig(repoRoot);
  if (!config.team) {
    console.error('No team remote configured. Run: memo team init <remote-url>');
    process.exit(1);
  }

  const teamDir = getTeamDir(repoRoot);
  const branch = config.team.branch;

  console.log('Pulling from team remote...');
  execSync(`git -C "${teamDir}" pull origin ${branch}`, { stdio: 'inherit' });

  execSync(`git -C "${teamDir}" add -A`, { stdio: 'pipe' });

  // Check if anything is staged
  let hasChanges = false;
  try {
    execSync(`git -C "${teamDir}" diff --staged --quiet`, { stdio: 'pipe' });
  } catch {
    hasChanges = true;
  }

  if (hasChanges) {
    console.log('Committing staged changes...');
    execSync(
      `git -C "${teamDir}" commit -m "chore: sync memories [memo team sync]"`,
      { stdio: 'inherit' }
    );
    console.log('Pushing...');
    execSync(`git -C "${teamDir}" push origin ${branch}`, { stdio: 'inherit' });
    console.log('✓ Sync complete.');
  } else {
    console.log('Nothing to commit. Repository is up to date.');
  }
}

/**
 * memo team publish <file>
 * Scans personal memory for secrets, then copies to team/ and stages.
 */
export async function teamPublish(filePath: string, repoRoot: string): Promise<void> {
  const absoluteFile = path.resolve(filePath);

  if (!fs.existsSync(absoluteFile)) {
    console.error(`File not found: ${absoluteFile}`);
    process.exit(1);
  }

  // Scan for secrets first (dynamic import: scan.ts may be created after team.ts)
  const { scanFile } = await import('./scan');
  const findings = scanFile(absoluteFile);
  if (findings.length > 0) {
    console.error('⚠️  Potential secrets found — aborting publish:');
    findings.forEach(f => console.error(`  ${f}`));
    console.error('→ Fix manually or run: memo scan --fix <file>');
    process.exit(1);
  }

  const teamDir = getTeamDir(repoRoot);
  // Determine relative path within personal/ to replicate under team/
  const personalDir = getPersonalDir(repoRoot);
  const rel = path.relative(personalDir, absoluteFile);
  const dst = path.join(teamDir, rel);

  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(absoluteFile, dst);

  execSync(`git -C "${teamDir}" add "${dst}"`, { stdio: 'pipe' });
  console.log(`✓ Published: ${rel}`);
  console.log('  Staged in team/. Run: memo team sync to push.');
}

/**
 * memo team status
 */
export async function teamStatus(repoRoot: string): Promise<void> {
  const teamDir = getTeamDir(repoRoot);
  if (!fs.existsSync(path.join(teamDir, '.git'))) {
    console.log('No team repository. Run: memo team init <remote-url>');
    return;
  }
  try {
    const status = execSync(`git -C "${teamDir}" status --short`, { encoding: 'utf-8' });
    const log = execSync(
      `git -C "${teamDir}" log --oneline -5 2>/dev/null || echo "(no commits)"`,
      { encoding: 'utf-8', shell: true }
    );
    console.log('Team repository status:');
    console.log(status || '  (clean)');
    console.log('\nRecent commits:');
    console.log(log);
  } catch (e) {
    console.error(`Could not get team status: ${(e as Error).message}`);
  }
}
```

- [ ] **Step 4: Run tests — must pass**

```bash
NODE_OPTIONS=--experimental-vm-modules jest tests/team.test.ts --no-coverage 2>&1 | tail -10
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/team.ts tests/team.test.ts
git commit -m "feat: add team commands (init, sync, publish, status) with pre-commit hook"
```

---

### Task 4: Wire `memo team` into `src/cli.ts`

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Add team subcommand to cli.ts**

In `src/cli.ts`, add the following imports at the top with the other command imports:

```typescript
import { teamInit, teamSync, teamPublish, teamStatus } from './commands/team';
```

Then add the `team` subcommand group (add before `program.parse()`):

```typescript
const team = program
  .command('team')
  .description('Team memory sharing commands');

team
  .command('init <remote-url>')
  .description('Set up shared team memory repository')
  .action(async (remoteUrl: string) => {
    const repoRoot = findRepoRoot(process.cwd());
    await teamInit(remoteUrl, repoRoot);
  });

team
  .command('sync')
  .description('Pull and push team memories')
  .action(async () => {
    const repoRoot = findRepoRoot(process.cwd());
    await teamSync(repoRoot);
  });

team
  .command('publish <file>')
  .description('Promote a personal memory to team')
  .action(async (file: string) => {
    const repoRoot = findRepoRoot(process.cwd());
    await teamPublish(file, repoRoot);
  });

team
  .command('status')
  .description('Show team repository status')
  .action(async () => {
    const repoRoot = findRepoRoot(process.cwd());
    await teamStatus(repoRoot);
  });
```

Also add `findRepoRoot` to the imports from `./core/store` if not already imported.

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
tsc --noEmit 2>&1
```

Expected: exits 0.

- [ ] **Step 3: Smoke test the CLI**

```bash
node dist/cli.js team --help 2>&1 || npx ts-node src/cli.ts team --help 2>&1
```

Expected: shows team subcommand help with init/sync/publish/status.

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts
git commit -m "feat: wire memo team subcommands into CLI"
```

---

## Chunk 3: Dual-Source Recall + --explain

### Task 5: Update retriever and recall command

**Files:**
- Modify: `src/core/retriever.ts`
- Modify: `src/commands/recall.ts`

- [ ] **Step 1: Update `src/core/retriever.ts`** for dual-source recall and source labeling

Replace the file:

```typescript
/**
 * Retriever module
 * Orchestrates engine search and formats output for MEMORY.md injection
 */

import { RecallResult, MemoConfig, MemoryScope } from '../types';
import { EngineAdapter } from '../engines/engine-adapter';
import { loadAll, writeMemoryMd, findRepoRoot } from './store';
import { TextEngine } from '../engines/text-engine';
import { recordAccess } from './lifecycle-manager';

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Recall memories for a query
 */
export async function recall(
  query: string,
  repoRoot: string,
  config: MemoConfig,
  engine?: EngineAdapter,
  scope: MemoryScope = 'all',
  explain: boolean = false
): Promise<{ results: RecallResult[]; markdown: string }> {
  const memories = loadAll(repoRoot, scope);
  const searchEngine = engine || new TextEngine();
  let results = await searchEngine.search(query, memories, config.memory.top_k);

  // Attach scope from memory file to result
  results = results.map(r => ({
    ...r,
    memory: { ...r.memory, scope: r.memory.scope },
  }));

  for (const result of results) {
    recordAccess(repoRoot, result.memory.path, query);
  }

  let markdown = formatResultsAsMarkdown(results, query, config.embedding.engine, memories.length, scope, explain);
  let tokenCount = estimateTokenCount(markdown);

  if (tokenCount > config.memory.token_budget) {
    while (results.length > 0 && tokenCount > config.memory.token_budget) {
      results.pop();
      markdown = formatResultsAsMarkdown(results, query, config.embedding.engine, memories.length, scope, explain);
      tokenCount = estimateTokenCount(markdown);
    }
  }

  return { results, markdown };
}

function scopeLabel(scope?: MemoryScope | string): string {
  if (scope === 'team') return '👥 team';
  if (scope === 'personal') return '👤 personal';
  return '';
}

/**
 * Format recall results as markdown for MEMORY.md
 */
function formatResultsAsMarkdown(
  results: RecallResult[],
  query: string,
  engine: string,
  totalMemories: number,
  scope: MemoryScope = 'all',
  explain: boolean = false
): string {
  let markdown = `<!-- Last updated: ${new Date().toISOString()} | query: "${query}" | engine: ${engine} | top ${results.length} of ${totalMemories} -->\n\n`;
  markdown += `## Recalled Memory\n\n`;

  if (results.length === 0) {
    markdown += `*No memories found for "${query}"*\n`;
  } else {
    for (const result of results) {
      const { memory, score } = result;
      const confidenceStr = memory.confidence ? ` · ${memory.confidence} confidence` : '';
      const tagStr = memory.tags.length > 0 ? ` · tags: ${memory.tags.join(', ')}` : '';
      const relativePath = memory.path.replace(/^.*\/memobank\//, '');

      // Show scope label only when results come from both sources
      const showScope = scope === 'all' && memory.scope !== undefined;
      const sourcePart = showScope ? ` | ${scopeLabel(memory.scope)}` : '';

      markdown += `### [score: ${score.toFixed(2)}${sourcePart}] ${memory.name}${confidenceStr}\n`;

      if (explain && result.scoreBreakdown) {
        const b = result.scoreBreakdown;
        const parts = [`keyword(${b.keyword.toFixed(2)})`, `tags(${b.tags.toFixed(2)})`, `recency(${b.recency.toFixed(2)})`];
        markdown += `  matched: ${parts.join(' + ')}\n`;
      }

      markdown += `> ${memory.description}\n`;
      markdown += `> \`${relativePath}\`${tagStr}\n\n`;
    }
    markdown += `---\n*To flag a result: memo correct <file> --reason "not relevant"*\n\n`;
  }

  const tokenCount = estimateTokenCount(markdown);
  markdown += `---\n`;
  markdown += `*${results.length} of ${totalMemories} memories · engine: ${engine} · ~${tokenCount} tokens*`;

  return markdown;
}

/**
 * Write recall results to MEMORY.md
 */
export function writeRecallResults(
  repoRoot: string,
  results: RecallResult[],
  query: string,
  engine: string
): void {
  writeMemoryMd(repoRoot, results, query, engine);
}
```

- [ ] **Step 2: Update `src/commands/recall.ts`** to add `--scope` and `--explain` options

Replace the file:

```typescript
/**
 * Recall command
 * Search memories and write to MEMORY.md
 */

import { findRepoRoot, loadAll } from '../core/store';
import { loadConfig } from '../config';
import { recall, writeRecallResults } from '../core/retriever';
import { TextEngine } from '../engines/text-engine';
import { MemoryScope } from '../types';

export interface RecallOptions {
  top?: number;
  engine?: string;
  format?: string;
  dryRun?: boolean;
  repo?: string;
  scope?: string;
  explain?: boolean;
}

export async function recallCommand(query: string, options: RecallOptions): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd(), options.repo);
  const config = loadConfig(repoRoot);

  if (options.top) config.memory.top_k = parseInt(String(options.top), 10);

  const scope = (options.scope as MemoryScope) || 'all';
  const explain = options.explain || false;

  let engine;
  if (options.engine === 'lancedb') {
    try {
      const { LanceDbEngine } = await import('../engines/lancedb-engine');
      engine = new LanceDbEngine(repoRoot, config);
    } catch {
      console.warn('LanceDB not available, falling back to text engine.');
      engine = new TextEngine();
    }
  }

  const { results, markdown } = await recall(query, repoRoot, config, engine, scope, explain);

  if (options.format === 'json') {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(markdown);

  if (!options.dryRun) {
    writeRecallResults(repoRoot, results, query, config.embedding.engine);
  }
}
```

- [ ] **Step 3: Update `src/cli.ts`** to rename the recall import and wire `--scope` and `--explain`

Find the existing `import { recall } from './commands/recall'` line in `src/cli.ts` and replace it:

```typescript
import { recallCommand, RecallOptions } from './commands/recall';
```

Then find the recall command's `.option` block and add:

```typescript
.option('--scope <scope>', 'Limit search scope: personal|team|all (default: all)')
.option('--explain', 'Show score breakdown for each result')
```

Update the `.action` call to use `recallCommand`:

```typescript
.action(async (query: string, options: RecallOptions) => {
  await recallCommand(query, options);
})
```

- [ ] **Step 4: Build and verify**

```bash
tsc --noEmit && echo "OK"
```

Expected: OK.

- [ ] **Step 5: Run full test suite**

```bash
NODE_OPTIONS=--experimental-vm-modules jest --no-coverage 2>&1 | tail -10
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/retriever.ts src/commands/recall.ts src/cli.ts
git commit -m "feat: dual-source recall with scope filter and --explain score breakdown"
```

---

## Chunk 4: Security — Sanitizer + memo scan

### Task 6: Enhance sanitizer with new patterns

**Files:**
- Modify: `src/core/sanitizer.ts`
- Create: `tests/sanitizer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/sanitizer.test.ts`:

```typescript
import { sanitize, scanForSecrets } from '../src/core/sanitizer';

describe('sanitize — new patterns', () => {
  it('redacts semantic password pattern', () => {
    const result = sanitize('The password is mySecret123');
    expect(result).not.toContain('mySecret123');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts semantic secret= pattern', () => {
    const result = sanitize('secret=abc123xyz');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts Chinese password pattern', () => {
    const result = sanitize('密码是abc123xyz');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts Chinese key pattern', () => {
    const result = sanitize('密钥为sk-abc123xyz');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts private IP 192.168.x.x', () => {
    const result = sanitize('server at 192.168.1.100');
    expect(result).not.toContain('192.168.1.100');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts private IP 10.x.x.x', () => {
    const result = sanitize('host 10.0.0.5 is internal');
    expect(result).not.toContain('10.0.0.5');
    expect(result).toContain('[REDACTED]');
  });

  it('does NOT redact version numbers like 1.10.2', () => {
    const result = sanitize('Using version v1.10.2 of the library');
    expect(result).toContain('1.10.2');
  });

  it('does NOT redact dates like 2026-03-10', () => {
    const result = sanitize('Created on 2026-03-10');
    expect(result).toContain('2026-03-10');
  });
});

describe('scanForSecrets', () => {
  it('returns empty array for clean content', () => {
    const findings = scanForSecrets('This is a lesson about Redis pooling.');
    expect(findings).toHaveLength(0);
  });

  it('detects API key in content', () => {
    const findings = scanForSecrets('key = sk-abcdefghijklmnop12345678');
    expect(findings.length).toBeGreaterThan(0);
  });

  it('detects password pattern', () => {
    const findings = scanForSecrets('The password is secretvalue');
    expect(findings.length).toBeGreaterThan(0);
  });

  it('returns line numbers with findings', () => {
    const content = 'clean line\npassword is mysecret\nclean line';
    const findings = scanForSecrets(content);
    expect(findings[0]).toContain('line 2');
  });
});
```

- [ ] **Step 2: Run tests — must fail**

```bash
NODE_OPTIONS=--experimental-vm-modules jest tests/sanitizer.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `scanForSecrets` not found, new pattern tests fail.

- [ ] **Step 3: Update `src/core/sanitizer.ts`**

**Important behavioral change:** The new `sanitize()` replaces the entire `.env`-style match with `[REDACTED]` (e.g., `KEY=abc` → `[REDACTED]`). The old behavior preserved the key name (`KEY=[REDACTED]`). After implementing this, check `tests/memory-template.test.ts` for any assertions about `.env`-style redaction and update them to match the new behavior (full replacement).

Replace with:

```typescript
/**
 * Sanitizer module
 * Strips secrets and sensitive information from content before writing to memory
 */

/** Patterns used both for sanitization and scanning */
const SECRET_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /sk-[A-Za-z0-9]{20,}/g, label: 'OpenAI API key' },
  { pattern: /ghp_[A-Za-z0-9]{36}/g, label: 'GitHub token' },
  { pattern: /Bearer [A-Za-z0-9._-]{20,}/g, label: 'Bearer token' },
  { pattern: /AKIA[0-9A-Z]{16}/g, label: 'AWS access key' },
  { pattern: /eyJ[A-Za-z0-9._-]{50,}\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+/g, label: 'JWT token' },
  { pattern: /[A-Z_]+=["']?[A-Za-z0-9/+]{20,}["']?/g, label: '.env secret' },
  // IPv4 private ranges (full octets to avoid matching version numbers/dates)
  { pattern: /\b192\.168\.\d{1,3}\.\d{1,3}\b/g, label: 'private IP (192.168.x.x)' },
  { pattern: /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, label: 'private IP (10.x.x.x)' },
  { pattern: /\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/g, label: 'private IP (172.16-31.x.x)' },
  // IPv6
  { pattern: /\b([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, label: 'IPv6 address' },
  // Semantic password/secret patterns
  { pattern: /password\s*(is|=|:)\s*\S+/gi, label: 'password value' },
  { pattern: /secret\s*(is|=|:)\s*\S+/gi, label: 'secret value' },
  { pattern: /token\s*(is|=|:)\s*\S+/gi, label: 'token value' },
  // Chinese-language patterns
  { pattern: /密码[是为：:]\s*\S+/g, label: '中文密码' },
  { pattern: /密钥[是为：:]\s*\S+/g, label: '中文密钥' },
];

/**
 * Sanitize content by replacing sensitive patterns with [REDACTED]
 */
export function sanitize(content: string): string {
  let sanitized = content;

  for (const { pattern } of SECRET_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  // Generic 20+ char alphanumeric (excludes hashes)
  sanitized = sanitized.replace(/\b[A-Za-z0-9_\-]{20,}\b/g, (match) => {
    if (/^[a-f0-9]{32}$/.test(match)) return match; // MD5
    if (/^[a-f0-9]{40}$/.test(match)) return match; // SHA1
    if (/^[a-f0-9]{64}$/.test(match)) return match; // SHA256
    return '[REDACTED]';
  });

  return sanitized;
}

export interface SecretFinding {
  line: number;
  content: string;
  label: string;
}

/**
 * Scan content for potential secrets without modifying it.
 * Returns human-readable findings with line numbers.
 */
export function scanForSecrets(content: string): string[] {
  const lines = content.split('\n');
  const findings: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { pattern, label } of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        findings.push(`line ${i + 1} (${label}): ${line.substring(0, 120)}`);
        break; // one finding per line
      }
    }
  }

  return findings;
}
```

- [ ] **Step 4: Run sanitizer tests — must pass**

```bash
NODE_OPTIONS=--experimental-vm-modules jest tests/sanitizer.test.ts --no-coverage 2>&1 | tail -10
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/sanitizer.ts tests/sanitizer.test.ts
git commit -m "feat: enhance sanitizer with semantic/Chinese/private-IP patterns; add scanForSecrets"
```

---

### Task 7: Create `memo scan` command

**Files:**
- Create: `src/commands/scan.ts`
- Modify: `src/cli.ts`
- Create: `tests/scan.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/scan.test.ts`:

```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scanFile, scanDirectory } from '../src/commands/scan';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memo-scan-test-'));
}

describe('scanFile', () => {
  it('returns empty array for clean file', () => {
    const tmp = makeTempDir();
    const file = path.join(tmp, 'clean.md');
    fs.writeFileSync(file, '# Clean memory\n\nThis is safe content.');
    const findings = scanFile(file);
    expect(findings).toHaveLength(0);
    fs.rmSync(tmp, { recursive: true });
  });

  it('detects secret in file', () => {
    const tmp = makeTempDir();
    const file = path.join(tmp, 'secret.md');
    fs.writeFileSync(file, '# Setup\n\nThe password is mysupersecret123');
    const findings = scanFile(file);
    expect(findings.length).toBeGreaterThan(0);
    fs.rmSync(tmp, { recursive: true });
  });
});

describe('scanDirectory', () => {
  it('returns empty when no .md files have secrets', () => {
    const tmp = makeTempDir();
    fs.writeFileSync(path.join(tmp, 'a.md'), '# Safe\n\nNo secrets here.');
    const results = scanDirectory(tmp);
    expect(results).toHaveLength(0);
    fs.rmSync(tmp, { recursive: true });
  });

  it('finds secrets across multiple files', () => {
    const tmp = makeTempDir();
    fs.writeFileSync(path.join(tmp, 'a.md'), '# Safe\n\nNo secrets.');
    fs.writeFileSync(path.join(tmp, 'b.md'), '# Risky\n\npassword is abc');
    const results = scanDirectory(tmp);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].file).toContain('b.md');
    fs.rmSync(tmp, { recursive: true });
  });
});
```

- [ ] **Step 2: Run tests — must fail**

```bash
NODE_OPTIONS=--experimental-vm-modules jest tests/scan.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `scanFile` not found.

- [ ] **Step 3: Create `src/commands/scan.ts`**

```typescript
/**
 * Scan command
 * memo scan [path]           — scan memory files for secrets
 * memo scan --staged         — scan git-staged .md files (used by pre-commit hook)
 * memo scan --fail-on-secrets — exit 1 if secrets found
 * memo scan --fix            — redact secrets in-place and re-stage
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { glob } from 'glob';
import { scanForSecrets, sanitize } from '../core/sanitizer';
import { findRepoRoot, getTeamDir } from '../core/store';

export interface ScanResult {
  file: string;
  findings: string[];
}

/**
 * Scan a single file for secrets
 */
export function scanFile(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  return scanForSecrets(content);
}

/**
 * Scan all .md files in a directory recursively
 */
export function scanDirectory(dir: string): ScanResult[] {
  const results: ScanResult[] = [];
  const files = glob.sync(path.join(dir, '**', '*.md'));

  for (const file of files) {
    const findings = scanFile(file);
    if (findings.length > 0) {
      results.push({ file, findings });
    }
  }

  return results;
}

/**
 * Get git-staged .md files in the repository at cwd
 */
function getStagedMdFiles(cwd: string): string[] {
  try {
    const output = execSync(
      'git diff --staged --name-only --diff-filter=ACM',
      { cwd, encoding: 'utf-8', stdio: 'pipe' }
    );
    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(cwd, f));
  } catch {
    return [];
  }
}

export interface ScanCommandOptions {
  staged?: boolean;
  failOnSecrets?: boolean;
  fix?: boolean;
  repo?: string;
}

export async function scanCommand(scanPath: string | undefined, options: ScanCommandOptions): Promise<void> {
  let results: ScanResult[] = [];

  if (options.staged) {
    // Staged mode: scan staged files in cwd (used by pre-commit hook)
    const cwd = process.cwd();
    const stagedFiles = getStagedMdFiles(cwd);

    for (const file of stagedFiles) {
      const findings = scanFile(file);
      if (findings.length > 0) results.push({ file, findings });
    }
  } else {
    // Directory scan
    const repoRoot = findRepoRoot(process.cwd(), options.repo);
    const targetDir = scanPath ? path.resolve(scanPath) : getTeamDir(repoRoot);

    if (!fs.existsSync(targetDir)) {
      console.log(`No directory to scan: ${targetDir}`);
      return;
    }

    results = scanDirectory(targetDir);
  }

  if (results.length === 0) {
    console.log('✓ No secrets found.');
    return;
  }

  console.error('⚠️  Potential secrets found:');
  for (const { file, findings } of results) {
    console.error(`  ${file}`);
    for (const f of findings) {
      console.error(`    > ${f}`);
    }
  }

  if (options.fix) {
    console.log('\nApplying auto-redaction...');
    for (const { file } of results) {
      const original = fs.readFileSync(file, 'utf-8');
      const cleaned = sanitize(original);
      fs.writeFileSync(file, cleaned, 'utf-8');
      // Re-stage the file if in a git repo
      try {
        const dir = path.dirname(file);
        execSync(`git add "${file}"`, { cwd: dir, stdio: 'pipe' });
      } catch { /* not in a git repo, skip */ }
      console.log(`  ✓ Redacted and re-staged: ${file}`);
    }
    return;
  }

  console.error('\n→ Run: memo scan --fix to auto-redact and re-stage');

  if (options.failOnSecrets) {
    process.exit(1);
  }
}
```

- [ ] **Step 4: Run tests — must pass**

```bash
NODE_OPTIONS=--experimental-vm-modules jest tests/scan.test.ts --no-coverage 2>&1 | tail -10
```

Expected: All tests PASS.

- [ ] **Step 5: Wire scan into `src/cli.ts`**

Add import:
```typescript
import { scanCommand } from './commands/scan';
```

Add command (before `program.parse()`):
```typescript
program
  .command('scan [path]')
  .description('Scan memory files for secrets')
  .option('--staged', 'Scan git-staged files only (used by pre-commit hook)')
  .option('--fail-on-secrets', 'Exit with code 1 if secrets found')
  .option('--fix', 'Auto-redact secrets in-place and re-stage')
  .action(async (scanPath: string | undefined, options: any) => {
    await scanCommand(scanPath, {
      staged: options.staged,
      failOnSecrets: options.failOnSecrets,
      fix: options.fix,
    });
  });
```

- [ ] **Step 6: Build and run full test suite**

```bash
tsc --noEmit && NODE_OPTIONS=--experimental-vm-modules jest --no-coverage 2>&1 | tail -10
```

Expected: 0 errors, all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/commands/scan.ts tests/scan.test.ts src/cli.ts
git commit -m "feat: add memo scan command with --staged, --fix, --fail-on-secrets flags"
```

---

## Chunk 5: Platform Auto-Capture

### Task 8: Extend platform adapters

**Files:**
- Modify: `src/platforms/claude-code.ts`
- Create: `src/platforms/gemini.ts`
- Create: `src/platforms/qwen.ts`
- Modify: `src/commands/install.ts`

- [ ] **Step 1: Update `src/platforms/claude-code.ts`** to add the Stop hook

At the end of `installClaudeCode`, after setting `autoMemoryDirectory`, also add the Stop hook:

```typescript
// Add Stop hook for auto-capture
if (!settings.hooks) settings.hooks = {};
if (!settings.hooks.Stop) settings.hooks.Stop = [];

// Remove any existing memobank Stop hook to avoid duplicates
settings.hooks.Stop = settings.hooks.Stop.filter(
  (h: any) => !(h.hooks?.[0]?.command?.includes('memo capture'))
);

settings.hooks.Stop.push({
  matcher: '',
  hooks: [{ type: 'command', command: 'memo capture --auto --silent' }],
});
```

- [ ] **Step 2: Create `src/platforms/gemini.ts`**

```typescript
/**
 * Gemini CLI platform adapter
 * Injects auto-capture instruction into ~/.gemini/GEMINI.md
 */

import * as fs from 'fs';
import * as path from 'path';

const GEMINI_PROTOCOL = `
## Memobank Memory Protocol

At the end of each session, run: \`memo capture --auto --silent\`
This captures learnings into your persistent memory bank automatically.
`;

function getGeminiMdPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.gemini', 'GEMINI.md');
}

export function detectGemini(): boolean {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return (
    fs.existsSync(path.join(home, '.gemini')) ||
    isInPath('gemini')
  );
}

function isInPath(cmd: string): boolean {
  const { execSync } = require('child_process');
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

export async function installGemini(): Promise<boolean> {
  const mdPath = getGeminiMdPath();
  const dir = path.dirname(mdPath);

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let content = '';
  if (fs.existsSync(mdPath)) {
    content = fs.readFileSync(mdPath, 'utf-8');
    if (content.includes('memo capture --auto --silent')) {
      console.log('✓ Gemini: memobank protocol already installed');
      return true;
    }
  }

  fs.writeFileSync(mdPath, content + GEMINI_PROTOCOL, 'utf-8');
  console.log(`✓ Gemini: auto-capture protocol added to ${mdPath}`);
  return true;
}
```

- [ ] **Step 3: Create `src/platforms/qwen.ts`**

```typescript
/**
 * Qwen Code platform adapter
 * Injects auto-capture instruction into ~/.qwen/QWEN.md
 */

import * as fs from 'fs';
import * as path from 'path';

const QWEN_PROTOCOL = `
## Memobank Memory Protocol

At the end of each session, run: \`memo capture --auto --silent\`
This captures learnings into your persistent memory bank automatically.
`;

function getQwenMdPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.qwen', 'QWEN.md');
}

export function detectQwen(): boolean {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return (
    fs.existsSync(path.join(home, '.qwen')) ||
    isInPath('qwen')
  );
}

function isInPath(cmd: string): boolean {
  const { execSync } = require('child_process');
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

export async function installQwen(): Promise<boolean> {
  const mdPath = getQwenMdPath();
  const dir = path.dirname(mdPath);

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let content = '';
  if (fs.existsSync(mdPath)) {
    content = fs.readFileSync(mdPath, 'utf-8');
    if (content.includes('memo capture --auto --silent')) {
      console.log('✓ Qwen: memobank protocol already installed');
      return true;
    }
  }

  fs.writeFileSync(mdPath, content + QWEN_PROTOCOL, 'utf-8');
  console.log(`✓ Qwen: auto-capture protocol added to ${mdPath}`);
  return true;
}
```

- [ ] **Step 4: Update `src/commands/install.ts`** to add `--platform` flag and `personal/` directory support

In `installCommand`, change the directory structure creation to create `personal/lesson`, `personal/decision`, `personal/workflow`, `personal/architecture` instead of flat `lesson`, `decision`, etc. Keep backward compatibility by also accepting a `--legacy` flag that uses the old flat structure.

Add a `--platform <name>` option that installs only the specified platform adapter:

```typescript
// Add to installCommand options interface:
platform?: string;

// Add handling in installCommand:
if (options.platform) {
  await installPlatform(options.platform, repoRoot);
  return;
}

// Updated directory creation: personal/ layout
async function createDirectoryStructure(repoRoot: string): Promise<void> {
  const MEMORY_TYPES = ['lesson', 'decision', 'workflow', 'architecture'];
  const personalDir = path.join(repoRoot, 'personal');

  for (const type of MEMORY_TYPES) {
    fs.mkdirSync(path.join(personalDir, type), { recursive: true });
  }
  fs.mkdirSync(path.join(repoRoot, 'memory'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'meta'), { recursive: true });
}

async function installPlatform(platform: string, repoRoot: string): Promise<void> {
  const { installClaudeCode } = await import('../platforms/claude-code');
  const { installCodex } = await import('../platforms/codex');
  const { installGemini, detectGemini } = await import('../platforms/gemini');
  const { installQwen, detectQwen } = await import('../platforms/qwen');
  const { installCursor } = await import('../platforms/cursor');

  switch (platform) {
    case 'claude-code': await installClaudeCode(repoRoot); break;
    case 'codex': await installCodex(process.cwd()); break;
    case 'gemini': await installGemini(); break;
    case 'qwen': await installQwen(); break;
    case 'cursor': await installCursor(process.cwd()); break;
    case 'all':
      await installClaudeCode(repoRoot);
      await installCodex(process.cwd());
      if (detectGemini()) await installGemini();
      if (detectQwen()) await installQwen();
      await installCursor(process.cwd());
      break;
    default:
      console.error(`Unknown platform: ${platform}. Valid: claude-code, codex, gemini, qwen, cursor, all`);
  }
}
```

- [ ] **Step 5: Wire `--platform` into cli.ts**

Find the `install` command in `src/cli.ts` and add:
```typescript
.option('--platform <name>', 'Install adapter for specific platform: claude-code|codex|gemini|qwen|cursor|all')
```

- [ ] **Step 6: Build and test**

```bash
tsc --noEmit && NODE_OPTIONS=--experimental-vm-modules jest --no-coverage 2>&1 | tail -10
```

Expected: 0 errors, all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/platforms/claude-code.ts src/platforms/gemini.ts src/platforms/qwen.ts src/commands/install.ts src/cli.ts
git commit -m "feat: add Gemini/Qwen platform adapters, Claude Code Stop hook, install --platform flag"
```

---

## Chunk 6: Onboarding TUI

### Task 9: Create MultiSelect Ink component

**Files:**
- Modify: `tsconfig.json`
- Create: `src/components/MultiSelect.tsx`

- [ ] **Step 1: Install `@types/react` dev dependency**

```bash
cd /home/ubuntu/.openclaw/workspace-code/memobank-cli && npm install --save-dev @types/react
```

Expected: package installs successfully.

- [ ] **Step 2: Add `"jsx": "react-jsx"` to `tsconfig.json`**

In `tsconfig.json`, add inside `compilerOptions`:

```json
"jsx": "react-jsx"
```

The `"include": ["src/**/*"]` pattern already covers `.tsx` files — no change needed there.

- [ ] **Step 3: Create `src/components/` directory and `MultiSelect.tsx`**

```tsx
/**
 * MultiSelect — Ink component for Space-to-toggle, Enter-to-confirm multi-selection
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export interface MultiSelectItem {
  label: string;
  value: string;
  hint?: string;
  disabled?: boolean;
}

export interface MultiSelectProps {
  label: string;
  items: MultiSelectItem[];
  defaultSelected?: string[];
  onSubmit: (selected: string[]) => void;
}

export function MultiSelect({ label, items, defaultSelected = [], onSubmit }: MultiSelectProps) {
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultSelected));

  useInput((input, key) => {
    if (key.upArrow) setCursor(c => Math.max(0, c - 1));
    if (key.downArrow) setCursor(c => Math.min(items.length - 1, c + 1));
    if (input === ' ') {
      const item = items[cursor];
      if (item && !item.disabled) {
        setSelected(prev => {
          const next = new Set(prev);
          if (next.has(item.value)) next.delete(item.value);
          else next.add(item.value);
          return next;
        });
      }
    }
    if (key.return) {
      onSubmit([...selected]);
    }
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>{label}</Text>
      <Text dimColor>  (↑↓ navigate · Space toggle · Enter confirm)</Text>
      {items.map((item, i) => (
        <Box key={item.value}>
          <Text color={i === cursor ? 'cyan' : undefined}>
            {`  ${selected.has(item.value) ? '◉' : '◯'} ${item.label}`}
            {item.hint ? <Text dimColor>{`  ${item.hint}`}</Text> : null}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles the new component**

```bash
tsc --noEmit && echo "OK"
```

Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json package.json package-lock.json src/components/MultiSelect.tsx
git commit -m "feat: add MultiSelect Ink component for onboarding TUI; add jsx support to tsconfig"
```

---

### Task 10: Rewrite onboarding as 4-step TUI

**Prerequisites:** Tasks 3 (team.ts), 8 (gemini.ts, qwen.ts), and 9 (MultiSelect.tsx + tsconfig jsx) must be completed first.

**Files:**
- Rename + rewrite: `src/commands/onboarding.ts` → `src/commands/onboarding.tsx`
- Modify: `src/cli.ts` (update import extension)

- [ ] **Step 1: Rename existing onboarding.ts to onboarding.tsx**

```bash
mv src/commands/onboarding.ts src/commands/onboarding.tsx
```

- [ ] **Step 2: Rewrite `src/commands/onboarding.tsx`**

```typescript
/**
 * Onboarding command (memo init)
 * 4-step interactive TUI setup wizard using Ink
 */

import React, { useState } from 'react';
import { render, Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { MultiSelect, MultiSelectItem } from '../components/MultiSelect';
import { findRepoRoot, getPersonalDir, migrateToPersonal } from '../core/store';
import { loadConfig, writeConfig, initConfig } from '../config';
import { installClaudeCode } from '../platforms/claude-code';
import { installCodex } from '../platforms/codex';
import { installGemini, detectGemini } from '../platforms/gemini';
import { installQwen, detectQwen } from '../platforms/qwen';
import { installCursor } from '../platforms/cursor';
import { teamInit } from './team';

/** Detect git repo name from cwd */
function detectProjectName(): string {
  try {
    const result = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8', stdio: 'pipe',
    }).trim();
    return path.basename(result);
  } catch {
    return path.basename(process.cwd());
  }
}

/** Detect which platforms are installed */
function detectPlatforms(): MultiSelectItem[] {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const isInPath = (cmd: string): boolean => {
    try { execSync(`which ${cmd}`, { stdio: 'pipe' }); return true; } catch { return false; }
  };

  return [
    {
      label: 'Claude Code',
      value: 'claude-code',
      hint: fs.existsSync(path.join(home, '.claude', 'settings.json')) ? '✓ detected' : 'not found',
      disabled: false,
    },
    {
      label: 'Codex',
      value: 'codex',
      hint: isInPath('codex') ? '✓ detected' : 'not found',
    },
    {
      label: 'Gemini CLI',
      value: 'gemini',
      hint: detectGemini() ? '✓ detected' : 'not found',
    },
    {
      label: 'Qwen Code',
      value: 'qwen',
      hint: detectQwen() ? '✓ detected' : 'not found',
    },
    {
      label: 'Cursor',
      value: 'cursor',
      hint: fs.existsSync(path.join(process.cwd(), '.cursor')) ? '✓ detected' : 'not found',
    },
  ];
}

/** Get default-selected platform values (detected ones) */
function getDetectedPlatforms(items: MultiSelectItem[]): string[] {
  return items.filter(i => i.hint?.includes('✓')).map(i => i.value);
}

type Step = 'project-name' | 'platforms' | 'team-repo' | 'search-engine' | 'done';

interface OnboardingState {
  step: Step;
  projectName: string;
  platforms: string[];
  teamRepo: string;
  searchEngine: string;
}

function OnboardingApp({ repoRoot }: { repoRoot: string }) {
  const defaultName = detectProjectName();
  const platformItems = detectPlatforms();
  const detectedPlatforms = getDetectedPlatforms(platformItems);

  const [state, setState] = useState<OnboardingState>({
    step: 'project-name',
    projectName: defaultName,
    platforms: detectedPlatforms,
    teamRepo: '',
    searchEngine: 'text',
  });
  const [nameInput, setNameInput] = useState(defaultName);
  const [teamInput, setTeamInput] = useState('');
  const [done, setDone] = useState(false);
  const [summary, setSummary] = useState<string[]>([]);

  const searchEngineItems = [
    { label: 'Text (recommended, zero setup)', value: 'text' },
    { label: 'Vector / LanceDB (better recall, requires Ollama or OpenAI)', value: 'lancedb' },
  ];

  if (done) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="green" bold>✓ memobank initialized!</Text>
        {summary.map((line, i) => <Text key={i} dimColor>  {line}</Text>)}
        <Text dimColor>Run: memo recall "anything" to test</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">🧠  Memobank Setup</Text>
      <Text> </Text>

      {state.step === 'project-name' && (
        <Box flexDirection="column">
          <Text>Project name:</Text>
          <TextInput
            value={nameInput}
            onChange={setNameInput}
            onSubmit={(value) => {
              setState(s => ({ ...s, step: 'platforms', projectName: value || defaultName }));
            }}
          />
        </Box>
      )}

      {state.step === 'platforms' && (
        <MultiSelect
          label="Select platforms to integrate:"
          items={platformItems}
          defaultSelected={detectedPlatforms}
          onSubmit={(selected) => {
            setState(s => ({ ...s, step: 'team-repo', platforms: selected }));
          }}
        />
      )}

      {state.step === 'team-repo' && (
        <Box flexDirection="column">
          <Text>Team memory repo <Text dimColor>(optional — Enter to skip):</Text></Text>
          <TextInput
            value={teamInput}
            onChange={setTeamInput}
            onSubmit={(value) => {
              setState(s => ({ ...s, step: 'search-engine', teamRepo: value }));
            }}
          />
        </Box>
      )}

      {state.step === 'search-engine' && (
        <Box flexDirection="column">
          <Text bold>Search engine:</Text>
          <SelectInput
            items={searchEngineItems}
            onSelect={(item) => {
              const finalState = { ...state, searchEngine: item.value };
              setState({ ...finalState, step: 'done' });
              // Run setup asynchronously
              runSetup(finalState, repoRoot).then(lines => {
                setSummary(lines);
                setDone(true);
              });
            }}
          />
        </Box>
      )}
    </Box>
  );
}

async function runSetup(state: OnboardingState, repoRoot: string): Promise<string[]> {
  const summaryLines: string[] = [];

  // 1. Init config
  initConfig(repoRoot, state.projectName);

  // 2. Create personal/ directory structure
  const personalDir = getPersonalDir(repoRoot);
  const TYPES = ['lesson', 'decision', 'workflow', 'architecture'];
  for (const type of TYPES) {
    fs.mkdirSync(path.join(personalDir, type), { recursive: true });
  }
  fs.mkdirSync(path.join(repoRoot, 'memory'), { recursive: true });

  // 3. Migrate existing root-level memories
  const { migrated, skipped } = migrateToPersonal(repoRoot);
  if (migrated.length > 0) summaryLines.push(`Migrated ${migrated.length} existing memories to personal/`);
  if (skipped.length > 0) summaryLines.push(`Skipped ${skipped.length} files (conflict) — resolve manually`);

  summaryLines.push(`Personal memories: ${personalDir}`);

  // 4. Install platform adapters
  for (const platform of state.platforms) {
    switch (platform) {
      case 'claude-code': await installClaudeCode(repoRoot); break;
      case 'codex': await installCodex(process.cwd()); break;
      case 'gemini': await installGemini(); break;
      case 'qwen': await installQwen(); break;
      case 'cursor': await installCursor(process.cwd()); break;
    }
  }
  if (state.platforms.length > 0) {
    summaryLines.push(`Platforms: ${state.platforms.join(', ')}`);
  }

  // 5. Set up team repo if provided
  if (state.teamRepo.trim()) {
    try {
      await teamInit(state.teamRepo.trim(), repoRoot);
      summaryLines.push(`Team repo: linked`);
    } catch (e) {
      summaryLines.push(`Team repo: setup failed — ${(e as Error).message}`);
    }
  }

  // 6. Update engine config if lancedb
  if (state.searchEngine === 'lancedb') {
    const config = loadConfig(repoRoot);
    config.embedding.engine = 'lancedb';
    writeConfig(repoRoot, config);
  }

  return summaryLines;
}

export async function onboardingCommand(): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());
  const { waitUntilExit } = render(<OnboardingApp repoRoot={repoRoot} />);
  await waitUntilExit();
}
```

- [ ] **Step 3: Update `src/cli.ts`** to ensure `memo init` / `memo setup` / `memo onboarding` all point to the new `onboardingCommand`

In `src/cli.ts`, find the existing `import ... from './commands/onboarding'` and update to:

```typescript
import { onboardingCommand } from './commands/onboarding.tsx';
```

Or if TypeScript resolves imports without extension, simply ensure the import statement reads:

```typescript
import { onboardingCommand } from './commands/onboarding';

program
  .command('onboarding')
  .aliases(['init', 'setup'])
  .description('Interactive setup wizard (recommended for first-time setup)')
  .action(async () => {
    await onboardingCommand();
  });
```

- [ ] **Step 3: Build**

```bash
tsc --noEmit 2>&1 | head -30
```

Expected: exits 0 with no errors.

- [ ] **Step 4: Run full test suite**

```bash
NODE_OPTIONS=--experimental-vm-modules jest --no-coverage 2>&1 | tail -10
```

Expected: All tests PASS.

- [ ] **Step 5: Bump CLI version in `src/cli.ts` and `package.json` to 0.3.0**

In `src/cli.ts`: `.version('0.3.0')`
In `package.json`: `"version": "0.3.0"`

- [ ] **Step 6: Final build**

```bash
tsc && echo "Build OK"
```

Expected: Build OK.

- [ ] **Step 8: Commit**

```bash
git add src/commands/onboarding.tsx src/components/MultiSelect.tsx src/cli.ts package.json
git commit -m "feat: rewrite onboarding as 4-step interactive TUI (memo init); bump to v0.3.0"
```

---

## Final Verification

- [ ] **Run full test suite and confirm pass**

```bash
NODE_OPTIONS=--experimental-vm-modules jest --no-coverage 2>&1
```

Expected: All test suites pass, 0 failures.

- [ ] **Build final dist**

```bash
tsc
```

Expected: exits 0.

- [ ] **Smoke-test key commands**

```bash
# These should print help without errors
node dist/cli.js team --help
node dist/cli.js scan --help
node dist/cli.js recall --help | grep -E "scope|explain"
node dist/cli.js install --help | grep platform
```

Expected: All commands show correct options.
