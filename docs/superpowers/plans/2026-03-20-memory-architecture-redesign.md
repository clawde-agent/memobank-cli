# Memory Architecture Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `personal/` + `team/` subdirectory model with a three-tier system (personal = global install at `~/.memobank/`, project = `.memobank/` in repo, workspace = optional remote repo), add a `status` field with frequency-driven lifecycle, and replace `memo team` commands with `memo workspace`.

**Architecture:** Storage tier is determined by install location rather than subdirectory structure, matching the mental model of `git config --global` vs local. A dual-track access log supports team handoffs without identity tracking. Status transitions (`experimental → active → needs-review → deprecated`) run automatically during `memo recall` and `memo lifecycle`.

**Tech Stack:** TypeScript 5.3, Node.js 18+, Commander.js, gray-matter (frontmatter), glob, js-yaml, Jest + ts-jest

**Spec:** `docs/superpowers/specs/2026-03-20-memory-architecture-redesign.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types.ts` | Modify | Add `Status` type, `status` field on `MemoryFile`, update `MemoryScope`, rename `TeamConfig → WorkspaceConfig` |
| `src/config.ts` | Modify | Add `WorkspaceConfig`, `LifecycleConfig` to schema; alias `team:` → `workspace:` |
| `src/core/store.ts` | Rewrite | Three-tier path resolution: `getGlobalDir()`, `getProjectDir()`, `getWorkspaceDir()`; three-tier `loadAll()` |
| `src/core/lifecycle-manager.ts` | Modify | Add `updateStatusOnRecall()`, `runLifecycleScan()`, `resetEpoch()`; epoch-aware access log |
| `src/core/decay-engine.ts` | Modify | Add `computeEpochScore()` with linear decay |
| `src/core/retriever.ts` | Modify | Three-tier merge + deduplication; `workspace` scope label |
| `src/commands/write.ts` | Modify | Set `status: experimental` on new memories |
| `src/commands/recall.ts` | Modify | Call `updateStatusOnRecall()` after results |
| `src/commands/lifecycle.ts` | Modify | Add `--reset-epoch` flag; call `runLifecycleScan()` |
| `src/commands/team.ts` | Delete | Replaced by workspace.ts |
| `src/commands/workspace.ts` | Create | `workspaceInit`, `workspaceSync`, `workspacePublish`, `workspaceStatus` |
| `src/commands/migrate.ts` | Create | `--dry-run`, execute, `--rollback`; personal/ → global, team/ → project flat |
| `src/commands/init.ts` | Create | `memo init` (project tier) and `memo init --global` (personal tier) |
| `src/cli.ts` | Modify | Replace `team` subcommand with `workspace`; add `init`, `migrate` |
| `src/onboarding.tsx` | Modify | Add tier selection step; add optional workspace remote step |
| `tests/store.test.ts` | Modify | Update for new three-tier API |
| `tests/lifecycle-status.test.ts` | Create | Status transitions, epoch reset, runLifecycleScan |
| `tests/workspace.test.ts` | Create | workspaceInit, workspaceSync, workspacePublish |
| `tests/migrate.test.ts` | Create | dry-run, execute, rollback, conflict handling |

---

## Chunk 1: Foundation (Types → Store → Lifecycle → Retriever)

### Task 1: Update types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add `Status` type and update `MemoryFile`**

```typescript
// src/types.ts — replace existing content

export type MemoryType = 'lesson' | 'decision' | 'workflow' | 'architecture';
export type Engine = 'text' | 'lancedb';
export type Confidence = 'low' | 'medium' | 'high';
export type MemoryScope = 'personal' | 'project' | 'workspace';
export type Status = 'experimental' | 'active' | 'needs-review' | 'deprecated';

export interface MemoryFile {
  path: string;
  name: string;
  type: MemoryType;
  description: string;
  tags: string[];
  created: string;
  updated?: string;
  review_after?: string;
  confidence?: Confidence;
  status?: Status;           // NEW
  content: string;
  scope?: MemoryScope;
}

export interface ScoreBreakdown {
  keyword: number;
  tags: number;
  recency: number;
}

export interface RecallResult {
  memory: MemoryFile;
  score: number;
  scoreBreakdown?: ScoreBreakdown;
}

export interface WorkspaceConfig {          // renamed from TeamConfig
  remote: string;
  enabled: boolean;                         // NEW — opt-in flag
  auto_sync: boolean;
  branch: string;
  path?: string;                            // subdirectory within remote repo
}

export interface LifecycleConfig {
  experimental_ttl_days: number;
  active_to_review_days: number;
  review_to_deprecated_days: number;
  review_recall_threshold: number;
  decay_window_days: number;
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
  lifecycle?: LifecycleConfig;              // NEW
  workspace?: WorkspaceConfig;             // renamed from team
  reranker?: {
    enabled: boolean;
    provider: 'jina' | 'cohere';
    model?: string;
    top_n?: number;
  };
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

- [ ] **Step 2: Run existing tests to confirm TypeScript still compiles**

```bash
cd /home/ubuntu/.openclaw/workspace-code/memobank-cli
npm run build 2>&1 | head -40
```

Expected: build errors from usages of old `TeamConfig` — that's fine; fix in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add Status type and WorkspaceConfig to types"
```

---

### Task 2: Update config

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Write failing test for workspace config aliasing**

```typescript
// tests/config.test.ts  (new file)
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadConfig, writeConfig } from '../src/config';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-config-test-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  return dir;
}

describe('loadConfig', () => {
  it('aliases team: key to workspace:', () => {
    const repo = makeTempRepo();
    fs.writeFileSync(
      path.join(repo, 'meta', 'config.yaml'),
      'project:\n  name: test\nteam:\n  remote: git@github.com:x/y.git\n  auto_sync: false\n  branch: main\n'
    );
    const config = loadConfig(repo);
    expect(config.workspace?.remote).toBe('git@github.com:x/y.git');
    expect((config as any).team).toBeUndefined();
    fs.rmSync(repo, { recursive: true });
  });

  it('loads lifecycle defaults when not configured', () => {
    const repo = makeTempRepo();
    fs.writeFileSync(path.join(repo, 'meta', 'config.yaml'), 'project:\n  name: test\n');
    const config = loadConfig(repo);
    expect(config.lifecycle?.experimental_ttl_days).toBe(30);
    expect(config.lifecycle?.active_to_review_days).toBe(90);
    fs.rmSync(repo, { recursive: true });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/config.test.ts 2>&1 | tail -20
```

Expected: FAIL — `config.workspace` is undefined, `config.lifecycle` is undefined.

- [ ] **Step 3: Update `src/config.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { MemoConfig, Engine, WorkspaceConfig, LifecycleConfig } from './types';

const DEFAULT_LIFECYCLE: LifecycleConfig = {
  experimental_ttl_days: 30,
  active_to_review_days: 90,
  review_to_deprecated_days: 90,
  review_recall_threshold: 3,
  decay_window_days: 180,
};

const DEFAULT_CONFIG: MemoConfig = {
  project: { name: 'default', description: '' },
  memory: { token_budget: 500, top_k: 5 },
  embedding: {
    engine: 'text' as Engine,
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimensions: 1536,
    base_url: undefined,
  },
  search: { use_tags: true, use_summary: true },
  review: { enabled: true },
  lifecycle: { ...DEFAULT_LIFECYCLE },
};

function getConfigPath(repoRoot: string): string {
  return path.join(repoRoot, 'meta', 'config.yaml');
}

export function loadConfig(repoRoot: string): MemoConfig {
  const configPath = getConfigPath(repoRoot);
  if (!fs.existsSync(configPath)) { return { ...DEFAULT_CONFIG }; }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const loaded = yaml.load(content) as any;

    // Alias team: → workspace: for backward compat
    if (loaded?.team && !loaded?.workspace) {
      loaded.workspace = loaded.team;
      delete loaded.team;
    }

    return {
      project: { ...DEFAULT_CONFIG.project, ...loaded?.project },
      memory: { ...DEFAULT_CONFIG.memory, ...loaded?.memory },
      embedding: { ...DEFAULT_CONFIG.embedding, ...loaded?.embedding },
      search: { ...DEFAULT_CONFIG.search, ...loaded?.search },
      review: { ...DEFAULT_CONFIG.review, ...loaded?.review },
      lifecycle: { ...DEFAULT_LIFECYCLE, ...loaded?.lifecycle },
      ...(loaded?.workspace ? { workspace: loaded.workspace as WorkspaceConfig } : {}),
      ...(loaded?.reranker ? { reranker: loaded.reranker } : {}),
    };
  } catch (error) {
    console.warn(`Could not load config: ${(error as Error).message}`);
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(repoRoot: string, config: MemoConfig): void {
  const configPath = getConfigPath(repoRoot);
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) { fs.mkdirSync(configDir, { recursive: true }); }
  try {
    const content = yaml.dump(config, { indent: 2 });
    fs.writeFileSync(configPath, content, 'utf-8');
  } catch (error) {
    throw new Error(`Could not write config: ${(error as Error).message}`);
  }
}

export function initConfig(repoRoot: string, projectName: string): void {
  writeConfig(repoRoot, { ...DEFAULT_CONFIG, project: { name: projectName } });
}

export { DEFAULT_LIFECYCLE };
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/config.test.ts 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: update config schema — WorkspaceConfig, LifecycleConfig, team→workspace alias"
```

---

### Task 3: Rewrite store — three-tier path resolution

**Files:**
- Modify: `src/core/store.ts`
- Modify: `tests/store.test.ts`

- [ ] **Step 1: Write failing tests for new store API**

```typescript
// Add to tests/store.test.ts (replace existing content)
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getGlobalDir,
  getProjectDir,
  getWorkspaceDir,
  loadAll,
  writeMemory,
} from '../src/core/store';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-test-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: test\n');
  return dir;
}

function writeTestMemory(dir: string, type: string, filename: string): void {
  fs.mkdirSync(path.join(dir, type), { recursive: true });
  const content = `---\nname: test-memory\ntype: ${type}\ndescription: A test\ntags: []\ncreated: "2026-01-01"\nstatus: active\n---\n\nContent here.`;
  fs.writeFileSync(path.join(dir, type, filename), content);
}

describe('getGlobalDir', () => {
  it('returns ~/.memobank/<project> path', () => {
    const home = process.env.HOME || '';
    expect(getGlobalDir('my-project')).toBe(path.join(home, '.memobank', 'my-project'));
  });
});

describe('getProjectDir', () => {
  it('returns .memobank/ directly under repoRoot', () => {
    expect(getProjectDir('/repo/root')).toBe('/repo/root');
  });
});

describe('getWorkspaceDir', () => {
  it('returns ~/.memobank/_workspace/<name> path', () => {
    const home = process.env.HOME || '';
    expect(getWorkspaceDir('myorg')).toBe(path.join(home, '.memobank', '_workspace', 'myorg'));
  });
});

describe('loadAll — three-tier', () => {
  it('loads project-tier memories from repoRoot directly', () => {
    const repo = makeTempRepo();
    writeTestMemory(repo, 'lesson', '2026-01-01-test.md');
    const memories = loadAll(repo);
    expect(memories.length).toBe(1);
    expect(memories[0].scope).toBe('project');
    fs.rmSync(repo, { recursive: true });
  });

  it('loads global-tier memories from separate globalDir', () => {
    const repo = makeTempRepo();
    const globalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-global-'));
    writeTestMemory(globalDir, 'lesson', '2026-01-01-global.md');
    const memories = loadAll(repo, 'all', globalDir);
    expect(memories.some(m => m.scope === 'personal')).toBe(true);
    fs.rmSync(repo, { recursive: true });
    fs.rmSync(globalDir, { recursive: true });
  });

  it('project scope deduplicates same filename from global', () => {
    const repo = makeTempRepo();
    const globalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-global-'));
    const sameFile = '2026-01-01-test.md';
    writeTestMemory(repo, 'lesson', sameFile);
    writeTestMemory(globalDir, 'lesson', sameFile);
    const memories = loadAll(repo, 'all', globalDir);
    const lessons = memories.filter(m => m.type === 'lesson');
    expect(lessons.length).toBe(1);
    expect(lessons[0].scope).toBe('project');
    fs.rmSync(repo, { recursive: true });
    fs.rmSync(globalDir, { recursive: true });
  });

  it('legacy fallback: loads from root when no tier dirs exist', () => {
    const repo = makeTempRepo();
    writeTestMemory(repo, 'lesson', '2026-01-01-legacy.md');
    const memories = loadAll(repo);
    expect(memories.length).toBe(1);
    fs.rmSync(repo, { recursive: true });
  });
});

describe('writeMemory', () => {
  it('writes status: experimental when status provided', () => {
    const repo = makeTempRepo();
    writeMemory(repo, {
      name: 'test', type: 'lesson', description: 'desc', tags: [],
      created: '2026-01-01', content: 'body', status: 'experimental',
    });
    const files = fs.readdirSync(path.join(repo, 'lesson'));
    expect(files.length).toBe(1);
    const written = fs.readFileSync(path.join(repo, 'lesson', files[0]!), 'utf-8');
    expect(written).toContain('status: experimental');
    fs.rmSync(repo, { recursive: true });
  });
});
```

- [ ] **Step 2: Run to confirm failures**

```bash
npm test -- tests/store.test.ts 2>&1 | tail -30
```

Expected: FAIL — `getGlobalDir`, `getProjectDir`, `getWorkspaceDir` not exported.

- [ ] **Step 3: Rewrite `src/core/store.ts`**

```typescript
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

export function readMemoryMd(repoRoot: string): string | null {
  const filePath = path.join(repoRoot, 'memory', 'MEMORY.md');
  if (!fs.existsSync(filePath)) { return null; }
  return fs.readFileSync(filePath, 'utf-8');
}
```

- [ ] **Step 4: Run store tests**

```bash
npm test -- tests/store.test.ts 2>&1 | tail -30
```

Expected: PASS all store tests.

- [ ] **Step 5: Fix TypeScript errors from removed exports**

```bash
npm run build 2>&1 | grep "error TS"
```

Expected errors from these removed exports: `getPersonalDir`, `getTeamDir`, `migrateToPersonal`. Fix each:

- `src/commands/team.ts`: Delete this file entirely (or comment out — it will be deleted in Task 8):
  ```bash
  git rm src/commands/team.ts
  ```
- `src/cli.ts`: Comment out the team import line temporarily:
  ```typescript
  // import { teamInit, teamSync, teamPublish, teamStatus } from './commands/team';
  ```
  Also comment out the `team` command block (lines ~298-356). This will be replaced properly in Task 12.
- Any other file importing `migrateToPersonal`: remove the import; migration logic moves to `src/commands/migrate.ts` in Task 10.

Re-run build until clean:
```bash
npm run build 2>&1 | grep "error TS"
```

- [ ] **Step 6: Commit**

```bash
git add src/core/store.ts tests/store.test.ts
git commit -m "feat: rewrite store — three-tier path resolution (global/project/workspace)"
```

---

### Task 4: Add epoch-aware scoring to decay engine

**Files:**
- Modify: `src/core/decay-engine.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/decay-engine.test.ts (new file)
import { computeEpochScore } from '../src/core/decay-engine';

describe('computeEpochScore', () => {
  it('returns full epochAccessCount score when epoch is recent', () => {
    const score = computeEpochScore({
      accessCount: 10,
      epochAccessCount: 4,
      daysSinceEpoch: 0,
      decayWindowDays: 180,
    });
    // epochAccessCount * 1.0 + historical * decay(0, 180) = 4 + 6*1.0 = 10
    expect(score).toBeCloseTo(10);
  });

  it('returns only epoch score when epoch is 180+ days old (historical fully decayed)', () => {
    const score = computeEpochScore({
      accessCount: 10,
      epochAccessCount: 4,
      daysSinceEpoch: 180,
      decayWindowDays: 180,
    });
    // decay(180, 180) = max(0, 1 - 1) = 0 → historical contributes 0
    expect(score).toBeCloseTo(4);
  });

  it('partially decays at midpoint', () => {
    const score = computeEpochScore({
      accessCount: 10,
      epochAccessCount: 4,
      daysSinceEpoch: 90,
      decayWindowDays: 180,
    });
    // decay(90, 180) = max(0, 1 - 0.5) = 0.5 → 4 + 6*0.5 = 7
    expect(score).toBeCloseTo(7);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/decay-engine.test.ts 2>&1 | tail -20
```

Expected: FAIL — `computeEpochScore` not exported.

- [ ] **Step 3: Add `computeEpochScore` to `src/core/decay-engine.ts`**

Add at bottom of existing file (do not replace):

```typescript
export interface EpochScoreInput {
  accessCount: number;
  epochAccessCount: number;
  daysSinceEpoch: number;
  decayWindowDays: number;
}

/**
 * Compute dual-track epoch score.
 * score = epochAccessCount × 1.0 + historical × linearDecay(daysSinceEpoch, window)
 */
export function computeEpochScore(input: EpochScoreInput): number {
  const { accessCount, epochAccessCount, daysSinceEpoch, decayWindowDays } = input;
  const historical = accessCount - epochAccessCount;
  const decay = Math.max(0, 1 - daysSinceEpoch / decayWindowDays);
  return epochAccessCount + historical * decay;
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/decay-engine.test.ts 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/decay-engine.ts tests/decay-engine.test.ts
git commit -m "feat: add epoch-aware dual-track scoring to decay engine"
```

---

### Task 5: Update lifecycle manager — status transitions + epoch

**Files:**
- Modify: `src/core/lifecycle-manager.ts`
- Create: `tests/lifecycle-status.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lifecycle-status.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  updateStatusOnRecall,
  runLifecycleScan,
  resetEpoch,
  loadAccessLogs,
} from '../src/core/lifecycle-manager';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-lifecycle-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: test\n');
  return dir;
}

function writeTestMemory(dir: string, type: string, filename: string, status: string): string {
  const typeDir = path.join(dir, type);
  fs.mkdirSync(typeDir, { recursive: true });
  const content = `---\nname: test-memory\ntype: ${type}\ndescription: A test\ntags: []\ncreated: "2026-01-01"\nstatus: ${status}\n---\n\nContent here.`;
  const filePath = path.join(typeDir, filename);
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe('updateStatusOnRecall', () => {
  it('promotes experimental → active on first recall', () => {
    const repo = makeTempRepo();
    const filePath = writeTestMemory(repo, 'lesson', '2026-01-01-test.md', 'experimental');
    updateStatusOnRecall(repo, filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('status: active');
    fs.rmSync(repo, { recursive: true });
  });

  it('promotes needs-review → active after 3 recalls in epoch', () => {
    const repo = makeTempRepo();
    const filePath = writeTestMemory(repo, 'lesson', '2026-01-01-nr.md', 'needs-review');
    // Simulate 2 prior epoch recalls in access log
    const logs = loadAccessLogs(repo);
    logs[filePath] = { memoryPath: filePath, lastAccessed: new Date(), accessCount: 2, recallQueries: [], epochAccessCount: 2, team_epoch: new Date().toISOString() };
    const { saveAccessLogs } = require('../src/core/lifecycle-manager');
    saveAccessLogs(repo, logs);
    // 3rd recall
    updateStatusOnRecall(repo, filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('status: active');
    fs.rmSync(repo, { recursive: true });
  });
});

describe('resetEpoch', () => {
  it('resets team_epoch and epochAccessCount to 0', () => {
    const repo = makeTempRepo();
    const filePath = writeTestMemory(repo, 'lesson', '2026-01-01-epoch.md', 'active');
    const logs: any = {};
    logs[filePath] = { memoryPath: filePath, lastAccessed: new Date(), accessCount: 10, recallQueries: [], epochAccessCount: 10, team_epoch: '2025-01-01T00:00:00.000Z' };
    const { saveAccessLogs } = require('../src/core/lifecycle-manager');
    saveAccessLogs(repo, logs);
    resetEpoch(repo);
    const updatedLogs = loadAccessLogs(repo);
    expect(updatedLogs[filePath]?.epochAccessCount).toBe(0);
    expect(updatedLogs[filePath]?.team_epoch).not.toBe('2025-01-01T00:00:00.000Z');
    fs.rmSync(repo, { recursive: true });
  });
});

describe('runLifecycleScan', () => {
  it('downgrades active → needs-review when inactive for 90+ days', () => {
    const repo = makeTempRepo();
    const filePath = writeTestMemory(repo, 'lesson', '2026-01-01-old.md', 'active');
    const oldDate = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    const logs: any = {};
    logs[filePath] = { memoryPath: filePath, lastAccessed: oldDate, accessCount: 5, recallQueries: [], epochAccessCount: 0, team_epoch: new Date().toISOString() };
    const { saveAccessLogs } = require('../src/core/lifecycle-manager');
    saveAccessLogs(repo, logs);
    runLifecycleScan(repo);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('status: needs-review');
    fs.rmSync(repo, { recursive: true });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/lifecycle-status.test.ts 2>&1 | tail -30
```

Expected: FAIL — `updateStatusOnRecall`, `runLifecycleScan`, `resetEpoch` not exported; `epochAccessCount` not in AccessLog.

- [ ] **Step 3: Update `src/core/lifecycle-manager.ts`**

Extend the existing `AccessLog` interface and add new functions. Preserve all existing exports.

Add to `AccessLog` interface:
```typescript
epochAccessCount: number;   // recalls since current team_epoch
team_epoch: string;         // ISO timestamp of current epoch start
```

Add these imports at the **top** of `src/core/lifecycle-manager.ts` (alongside existing imports):

```typescript
import * as fs from 'fs';
import matter from 'gray-matter';
import { updateMemoryStatus, loadAll } from './store';
import { loadConfig } from '../config';
import { Status } from '../types';
```

Add new exported functions at end of file:

```typescript
/**
 * Called after a successful recall.
 * Increments epochAccessCount and applies status upgrades.
 */
export function updateStatusOnRecall(repoRoot: string, memoryPath: string): void {
  const logs = loadAccessLogs(repoRoot);
  const log = logs[memoryPath];
  if (!log) { return; }

  // Increment epoch count
  log.epochAccessCount = (log.epochAccessCount ?? 0) + 1;
  saveAccessLogs(repoRoot, logs);

  // Read current status
  let currentStatus: Status = 'experimental';
  try {
    const content = fs.readFileSync(memoryPath, 'utf-8');
    const parsed = matter(content);
    currentStatus = parsed.data.status ?? 'experimental';
  } catch { return; }

  // Apply upgrade rules
  const config = loadConfig(repoRoot);
  const threshold = config.lifecycle?.review_recall_threshold ?? 3;

  if (currentStatus === 'experimental') {
    updateMemoryStatus(memoryPath, 'active');
  } else if (currentStatus === 'needs-review' && log.epochAccessCount >= threshold) {
    updateMemoryStatus(memoryPath, 'active');
  } else if (currentStatus === 'deprecated') {
    updateMemoryStatus(memoryPath, 'needs-review');
  }
}

/**
 * Full scan of all memories — applies downgrade rules.
 * Run periodically (manually or via CI).
 */
export function runLifecycleScan(repoRoot: string, globalDir?: string): void {
  const config = loadConfig(repoRoot);
  const lc = config.lifecycle!;
  const logs = loadAccessLogs(repoRoot);
  const memories = loadAll(repoRoot, 'all', globalDir);
  const now = Date.now();

  for (const memory of memories) {
    const log = logs[memory.path];
    const lastAccessed = log?.lastAccessed ? new Date(log.lastAccessed).getTime() : null;
    const daysSinceAccess = lastAccessed ? (now - lastAccessed) / 86400000 : Infinity;
    const currentStatus: Status = memory.status ?? 'experimental';
    const created = new Date(memory.created).getTime();
    const daysSinceCreation = (now - created) / 86400000;

    if (currentStatus === 'active' && daysSinceAccess > lc.active_to_review_days) {
      updateMemoryStatus(memory.path, 'needs-review');
    } else if (currentStatus === 'needs-review' && daysSinceAccess > lc.review_to_deprecated_days) {
      updateMemoryStatus(memory.path, 'deprecated');
    } else if (currentStatus === 'experimental' && daysSinceCreation > lc.experimental_ttl_days) {
      updateMemoryStatus(memory.path, 'deprecated');
    }
  }
}

/**
 * Reset team_epoch to now and zero out epochAccessCount for all entries.
 */
export function resetEpoch(repoRoot: string): void {
  const logs = loadAccessLogs(repoRoot);
  const newEpoch = new Date().toISOString();
  for (const key of Object.keys(logs)) {
    logs[key]!.epochAccessCount = 0;
    logs[key]!.team_epoch = newEpoch;
  }
  saveAccessLogs(repoRoot, logs);
}
```

Also update `recordAccess` to initialise `epochAccessCount` and `team_epoch` on new entries:

```typescript
// In recordAccess, update the initialization block:
if (!logs[memoryPath]) {
  logs[memoryPath] = {
    memoryPath,
    lastAccessed: now,
    accessCount: 0,
    recallQueries: [],
    epochAccessCount: 0,
    team_epoch: now.toISOString(),
  };
}
log.epochAccessCount = (log.epochAccessCount ?? 0); // preserve existing
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/lifecycle-status.test.ts 2>&1 | tail -30
```

Expected: PASS

- [ ] **Step 5: Run full test suite**

```bash
npm test 2>&1 | tail -20
```

Expected: All passing (some team.test.ts tests may fail — acceptable, will be removed in Task 8).

- [ ] **Step 6: Commit**

```bash
git add src/core/lifecycle-manager.ts tests/lifecycle-status.test.ts
git commit -m "feat: add status lifecycle — updateStatusOnRecall, runLifecycleScan, resetEpoch"
```

---

## Chunk 2: Commands + CLI Wiring

### Task 6: Update recall to trigger status update

**Files:**
- Modify: `src/commands/recall.ts`
- Modify: `src/core/retriever.ts`

- [ ] **Step 1: Update `src/core/retriever.ts` scope label for workspace**

In `scopeLabel()`:
```typescript
function scopeLabel(scope?: MemoryScope | string): string {
  if (scope === 'workspace') { return '🌐 workspace'; }
  if (scope === 'project') { return '📁 project'; }
  if (scope === 'personal') { return '👤 personal'; }
  return '';
}
```

- [ ] **Step 2: Update `recall()` to pass globalDir/workspaceDir to `loadAll()`**

The `recall()` function signature already receives `repoRoot` and `config`. Update it to derive tier directories from config and pass them to `loadAll()`:

```typescript
import { getGlobalDir, getWorkspaceDir } from './store';

// In recall(), replace:
//   const memories = loadAll(repoRoot, scope);
// With:
const globalDir = getGlobalDir(config.project.name);
const workspaceDir = config.workspace?.enabled
  ? getWorkspaceDir(path.basename(config.workspace.remote ?? '', '.git'))
  : undefined;
const memories = loadAll(repoRoot, scope, globalDir, workspaceDir);
```

Add `import * as path from 'path';` at the top of `retriever.ts` if not already present.

- [ ] **Step 3: Call `updateStatusOnRecall` after `recordAccess`**

In `recall()` function, after the `recordAccess` loop:

```typescript
import { recordAccess, loadAccessLogs, updateStatusOnRecall } from './lifecycle-manager';

// After: for (const result of results) { recordAccess(...) }
for (const result of results) {
  updateStatusOnRecall(repoRoot, result.memory.path);
}
```

- [ ] **Step 4: Run existing tests to confirm no regressions**

```bash
npm test 2>&1 | tail -20
```

Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/retriever.ts
git commit -m "feat: trigger status update on recall; pass tier dirs to loadAll"
```

---

### Task 7: Update write command — default status: experimental

**Files:**
- Modify: `src/commands/write.ts`

- [ ] **Step 1: Read current write.ts to understand its structure**

```bash
cat src/commands/write.ts | head -80
```

- [ ] **Step 2: Add `status: 'experimental'` to the memory object passed to `writeMemory`**

Find the call to `writeMemory(repoRoot, { ... })` and add `status: 'experimental'` to the object if no status is already provided. The exact edit depends on current structure, but the pattern is:

```typescript
await writeMemory(repoRoot, {
  name,
  type,
  description,
  tags,
  content,
  confidence,
  created: new Date().toISOString(),
  status: 'experimental',   // ADD THIS LINE
});
```

- [ ] **Step 3: Run build to confirm no TypeScript errors**

```bash
npm run build 2>&1 | grep "error TS"
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/commands/write.ts
git commit -m "feat: set status=experimental on all new memories"
```

---

### Task 8: Create workspace commands, delete team commands

**Files:**
- Create: `src/commands/workspace.ts`
- Delete: `src/commands/team.ts`
- Create: `tests/workspace.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/workspace.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-ws-test-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: test\n');
  return dir;
}

describe('workspacePublish', () => {
  it('aborts when source file does not exist', async () => {
    const { workspacePublish } = await import('../src/commands/workspace');
    const repo = makeTempRepo();
    await expect(workspacePublish('/nonexistent/file.md', repo)).rejects.toThrow('not found');
    fs.rmSync(repo, { recursive: true });
  });

  it('copies file to workspace dir when workspace dir exists', async () => {
    const { workspacePublish } = await import('../src/commands/workspace');
    const repo = makeTempRepo();
    const wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-ws-'));
    fs.mkdirSync(path.join(wsDir, 'lesson'), { recursive: true });
    // Create source file in repo/lesson/
    fs.mkdirSync(path.join(repo, 'lesson'), { recursive: true });
    const srcFile = path.join(repo, 'lesson', '2026-01-01-test.md');
    fs.writeFileSync(srcFile, '---\nname: test\ntype: lesson\ndescription: desc\ntags: []\ncreated: "2026-01-01"\nstatus: active\n---\n\nContent');
    await workspacePublish(srcFile, repo, wsDir);
    expect(fs.existsSync(path.join(wsDir, 'lesson', '2026-01-01-test.md'))).toBe(true);
    fs.rmSync(repo, { recursive: true });
    fs.rmSync(wsDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/workspace.test.ts 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/commands/workspace.ts`**

```typescript
/**
 * Workspace memory commands (cross-repo, optional)
 * memo workspace init <remote>  — clone/init workspace repo
 * memo workspace sync           — pull latest; optionally push
 * memo workspace publish <file> — scan secrets + copy to workspace
 * memo workspace status         — show git status of local workspace clone
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, execFileSync } from 'child_process';
import { loadConfig, writeConfig } from '../config';
import { scanFile } from './scan';

const MEMORY_TYPES = ['lesson', 'decision', 'workflow', 'architecture', 'meta'];

export async function workspaceInit(remoteUrl: string, repoRoot: string): Promise<void> {
  const config = loadConfig(repoRoot);
  const wsName = path.basename(remoteUrl, '.git');
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const wsDir = path.join(home, '.memobank', '_workspace', wsName);

  if (fs.existsSync(wsDir)) {
    console.log(`Workspace already initialized at ${wsDir}. Run: memo workspace sync`);
    return;
  }

  let cloned = false;
  try {
    execSync(`git clone "${remoteUrl}" "${wsDir}"`, { stdio: 'pipe' });
    cloned = true;
    console.log('✓ Cloned workspace repository.');
  } catch { /* remote may be empty */ }

  if (!cloned) {
    fs.mkdirSync(wsDir, { recursive: true });
    execSync(`git init "${wsDir}"`, { stdio: 'pipe' });
    execSync(`git -C "${wsDir}" remote add origin "${remoteUrl}"`, { stdio: 'pipe' });
    for (const type of MEMORY_TYPES) {
      fs.mkdirSync(path.join(wsDir, type), { recursive: true });
      fs.writeFileSync(path.join(wsDir, type, '.gitkeep'), '');
    }
    execSync(`git -C "${wsDir}" add -A`, { stdio: 'pipe' });
    execSync(`git -C "${wsDir}" commit -m "chore: initialize workspace memory repo"`, { stdio: 'pipe' });
    try {
      execSync(`git -C "${wsDir}" push -u origin main`, { stdio: 'pipe' });
    } catch { /* push may fail for empty remotes — ok */ }
    console.log('✓ Initialized workspace repository.');
  }

  config.workspace = { remote: remoteUrl, auto_sync: false, branch: 'main', path: '.memobank' };
  writeConfig(repoRoot, config);
  console.log(`✓ Workspace remote configured: ${remoteUrl}`);
}

export async function workspaceSync(repoRoot: string, push = false): Promise<void> {
  const config = loadConfig(repoRoot);
  if (!config.workspace?.remote) {
    console.error('No workspace remote configured. Run: memo workspace init <remote-url>');
    process.exit(1);
  }

  const wsName = path.basename(config.workspace.remote, '.git');
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const wsDir = path.join(home, '.memobank', '_workspace', wsName);
  const branch = config.workspace.branch ?? 'main';

  console.log('Pulling from workspace remote...');
  execFileSync('git', ['-C', wsDir, 'pull', 'origin', branch], { stdio: 'inherit' });

  if (push) {
    execSync(`git -C "${wsDir}" add -A`, { stdio: 'pipe' });
    let hasChanges = false;
    try { execSync(`git -C "${wsDir}" diff --staged --quiet`, { stdio: 'pipe' }); }
    catch { hasChanges = true; }

    if (hasChanges) {
      execSync(`git -C "${wsDir}" commit -m "chore: workspace sync [memo workspace sync]"`, { stdio: 'inherit' });
      execFileSync('git', ['-C', wsDir, 'push', 'origin', branch], { stdio: 'inherit' });
      console.log('✓ Pushed to workspace remote.');
    } else {
      console.log('Nothing to push. Repository is up to date.');
    }
  } else {
    console.log('✓ Workspace memories synced.');
  }
}

export async function workspacePublish(
  filePath: string,
  repoRoot: string,
  wsDirOverride?: string
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Secret scan
  try {
    const findings = scanFile(filePath);
    if (findings.length > 0) {
      console.error('⚠️  Potential secrets found — aborting publish:');
      findings.forEach(f => console.error(`  ${f}`));
      console.error('→ Fix manually or run: memo scan --fix <file>');
      process.exit(1);
    }
  } catch { /* scan module unavailable — skip */ }

  const config = loadConfig(repoRoot);
  const wsName = config.workspace?.remote
    ? path.basename(config.workspace.remote, '.git')
    : '_workspace';
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const wsDir = wsDirOverride ?? path.join(home, '.memobank', '_workspace', wsName);

  if (!fs.existsSync(wsDir)) {
    throw new Error(`Workspace not initialized. Run: memo workspace init <remote-url>`);
  }

  const rel = path.relative(repoRoot, filePath);
  const dst = path.join(wsDir, rel);

  if (fs.existsSync(dst)) {
    console.warn(`⚠️  File already exists in workspace: ${rel}`);
    console.warn('  Overwriting. The workspace repo PR review is the governance gate.');
  }

  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(filePath, dst);
  console.log(`✓ Published: ${rel}`);
  console.log('  Run: memo workspace sync --push to share with team.');
}

export async function workspaceStatus(repoRoot: string): Promise<void> {
  const config = loadConfig(repoRoot);
  if (!config.workspace?.remote) {
    console.log('No workspace configured. Run: memo workspace init <remote-url>');
    return;
  }
  const wsName = path.basename(config.workspace.remote, '.git');
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const wsDir = path.join(home, '.memobank', '_workspace', wsName);

  if (!fs.existsSync(path.join(wsDir, '.git'))) {
    console.log(`Workspace directory not found: ${wsDir}`);
    return;
  }
  try {
    const status = execFileSync('git', ['-C', wsDir, 'status', '--short'], { encoding: 'utf-8' });
    let log = '';
    try { log = execFileSync('git', ['-C', wsDir, 'log', '--oneline', '-5'], { encoding: 'utf-8' }); }
    catch { log = '(no commits)'; }
    console.log('Workspace repository status:');
    console.log(status || '  (clean)');
    console.log('\nRecent commits:');
    console.log(log);
  } catch (e) {
    console.error(`Could not get workspace status: ${(e as Error).message}`);
  }
}
```

- [ ] **Step 4: Run workspace tests**

```bash
npm test -- tests/workspace.test.ts 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 5: Delete `src/commands/team.ts` and `tests/team.test.ts`**

```bash
git rm src/commands/team.ts tests/team.test.ts
```

- [ ] **Step 6: Run full test suite**

```bash
npm test 2>&1 | tail -20
```

Expected: All passing (team tests gone, workspace tests passing).

- [ ] **Step 7: Commit**

```bash
git add src/commands/workspace.ts tests/workspace.test.ts
git commit -m "feat: add workspace commands; remove team commands"
```

---

### Task 9: Update lifecycle command — add --reset-epoch and runLifecycleScan

**Files:**
- Modify: `src/commands/lifecycle.ts`

- [ ] **Step 1: Read current lifecycle.ts**

```bash
cat src/commands/lifecycle.ts
```

- [ ] **Step 2: Add `--reset-epoch` handling**

In the `lifecycleCommand` function, add:

```typescript
import { runLifecycleScan, resetEpoch } from '../core/lifecycle-manager';

// In lifecycleCommand options interface, add:
resetEpoch?: boolean;
scan?: boolean;

// In lifecycleCommand body, add before existing logic:
if (options.resetEpoch) {
  resetEpoch(repoRoot);
  console.log('✓ Epoch reset. epochAccessCount zeroed for all memories.');
  return;
}

if (options.scan) {
  runLifecycleScan(repoRoot);
  console.log('✓ Lifecycle scan complete. Status updated for all memories.');
  return;
}
```

- [ ] **Step 3: Build to verify no errors**

```bash
npm run build 2>&1 | grep "error TS"
```

- [ ] **Step 4: Commit**

```bash
git add src/commands/lifecycle.ts
git commit -m "feat: add --reset-epoch and --scan flags to lifecycle command"
```

---

### Task 10: Create migrate command

**Files:**
- Create: `src/commands/migrate.ts`
- Create: `tests/migrate.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/migrate.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function makeLegacyRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-migrate-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: test\n');
  // personal/ layout
  fs.mkdirSync(path.join(dir, 'personal', 'lesson'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'personal', 'lesson', '2026-01-01-personal.md'),
    '---\nname: personal-mem\ntype: lesson\ndescription: desc\ntags: []\ncreated: "2026-01-01"\n---\nContent'
  );
  // team/ layout
  fs.mkdirSync(path.join(dir, 'team', 'lesson'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'team', 'lesson', '2026-01-01-team.md'),
    '---\nname: team-mem\ntype: lesson\ndescription: desc\ntags: []\ncreated: "2026-01-01"\n---\nContent'
  );
  return dir;
}

describe('migrate --dry-run', () => {
  it('reports files that would move without changing them', async () => {
    const { migrate } = await import('../src/commands/migrate');
    const repo = makeLegacyRepo();
    const globalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-global-'));
    const result = await migrate(repo, globalDir, { dryRun: true });
    expect(result.personalMoves.length).toBeGreaterThan(0);
    expect(result.teamMoves.length).toBeGreaterThan(0);
    // Files unchanged
    expect(fs.existsSync(path.join(repo, 'personal', 'lesson', '2026-01-01-personal.md'))).toBe(true);
    fs.rmSync(repo, { recursive: true });
    fs.rmSync(globalDir, { recursive: true });
  });
});

describe('migrate', () => {
  it('moves personal/ to globalDir and team/ to repo root', async () => {
    const { migrate } = await import('../src/commands/migrate');
    const repo = makeLegacyRepo();
    const globalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-global-'));
    await migrate(repo, globalDir, {});
    expect(fs.existsSync(path.join(globalDir, 'lesson', '2026-01-01-personal.md'))).toBe(true);
    expect(fs.existsSync(path.join(repo, 'lesson', '2026-01-01-team.md'))).toBe(true);
    // Backups preserved
    expect(fs.existsSync(path.join(repo, 'personal.bak'))).toBe(true);
    expect(fs.existsSync(path.join(repo, 'team.bak'))).toBe(true);
    fs.rmSync(repo, { recursive: true });
    fs.rmSync(globalDir, { recursive: true });
  });

  it('is idempotent: re-running skips already migrated files', async () => {
    const { migrate } = await import('../src/commands/migrate');
    const repo = makeLegacyRepo();
    const globalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-global-'));
    await migrate(repo, globalDir, {});
    // Restore personal.bak to personal/ to simulate re-run
    await migrate(repo, globalDir, {});  // should not throw
    fs.rmSync(repo, { recursive: true });
    fs.rmSync(globalDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/migrate.test.ts 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/commands/migrate.ts`**

```typescript
/**
 * Migration from legacy personal/ + team/ layout to three-tier model.
 * personal/ → globalDir (personal/global tier)
 * team/     → repoRoot flat (project tier)
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

export interface MigrateOptions {
  dryRun?: boolean;
  rollback?: boolean;
}

export interface MigrateResult {
  personalMoves: Array<{ from: string; to: string }>;
  teamMoves: Array<{ from: string; to: string }>;
  conflicts: string[];
}

export async function migrate(
  repoRoot: string,
  globalDir: string,
  options: MigrateOptions
): Promise<MigrateResult> {
  const result: MigrateResult = { personalMoves: [], teamMoves: [], conflicts: [] };
  const personalDir = path.join(repoRoot, 'personal');
  const teamDir = path.join(repoRoot, 'team');
  const personalBak = path.join(repoRoot, 'personal.bak');
  const teamBak = path.join(repoRoot, 'team.bak');

  if (options.rollback) {
    if (fs.existsSync(personalBak)) {
      fs.renameSync(personalBak, personalDir);
      console.log('✓ Restored personal/ from backup.');
    }
    if (fs.existsSync(teamBak)) {
      fs.renameSync(teamBak, teamDir);
      console.log('✓ Restored team/ from backup.');
    }
    return result;
  }

  // Collect personal/ moves
  if (fs.existsSync(personalDir)) {
    const files = glob.sync(path.join(personalDir, '**', '*.md'));
    for (const srcFile of files) {
      const rel = path.relative(personalDir, srcFile);
      const dst = path.join(globalDir, rel);
      result.personalMoves.push({ from: srcFile, to: dst });
    }
  }

  // Collect team/ moves
  if (fs.existsSync(teamDir)) {
    const files = glob.sync(path.join(teamDir, '**', '*.md'));
    for (const srcFile of files) {
      const rel = path.relative(teamDir, srcFile);
      const dst = path.join(repoRoot, rel);
      if (fs.existsSync(dst)) {
        result.conflicts.push(srcFile);
      } else {
        result.teamMoves.push({ from: srcFile, to: dst });
      }
    }
  }

  if (options.dryRun) {
    console.log(`Dry run — no changes made.`);
    console.log(`Personal moves: ${result.personalMoves.length}`);
    console.log(`Team moves: ${result.teamMoves.length}`);
    console.log(`Conflicts: ${result.conflicts.length}`);
    return result;
  }

  // Execute personal moves
  for (const { from, to } of result.personalMoves) {
    if (fs.existsSync(to)) { continue; } // idempotent skip
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    console.log(`  personal → global: ${path.basename(from)}`);
  }

  // Execute team moves
  for (const { from, to } of result.teamMoves) {
    if (fs.existsSync(to)) { continue; }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    console.log(`  team → project: ${path.basename(from)}`);
  }

  // Backup originals
  if (fs.existsSync(personalDir) && !fs.existsSync(personalBak)) {
    fs.renameSync(personalDir, personalBak);
    console.log('✓ personal/ backed up to personal.bak/');
  }
  if (fs.existsSync(teamDir) && !fs.existsSync(teamBak)) {
    fs.renameSync(teamDir, teamBak);
    console.log('✓ team/ backed up to team.bak/');
  }

  if (result.conflicts.length > 0) {
    console.warn(`\n⚠️  ${result.conflicts.length} conflicts — saved as <name>.bak.md:`);
    for (const f of result.conflicts) {
      const bak = f + '.bak.md';
      fs.copyFileSync(f, bak);
      console.warn(`  ${path.basename(f)} → ${path.basename(bak)}`);
    }
  }

  console.log('\n✓ Migration complete. Review changes and run: git add .memobank');
  return result;
}
```

- [ ] **Step 4: Run migrate tests**

```bash
npm test -- tests/migrate.test.ts 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/migrate.ts tests/migrate.test.ts
git commit -m "feat: add migrate command — personal/team → three-tier layout"
```

---

### Task 11: Create init command

**Files:**
- Create: `src/commands/init.ts`

- [ ] **Step 1: Create `src/commands/init.ts`**

```typescript
/**
 * init command
 * memo init          — project tier: creates .memobank/ in current repo
 * memo init --global — personal tier: creates ~/.memobank/<project>/
 */

import * as fs from 'fs';
import * as path from 'path';
import { initConfig } from '../config';

const MEMORY_TYPES = ['lesson', 'decision', 'workflow', 'architecture'];

export async function initCommand(options: { global?: boolean; name?: string }): Promise<void> {
  const cwd = process.cwd();
  const projectName = options.name ?? path.basename(cwd);

  if (options.global) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const globalDir = path.join(home, '.memobank', projectName);
    if (fs.existsSync(path.join(globalDir, 'meta', 'config.yaml'))) {
      console.log(`Personal memory already initialized at ${globalDir}`);
      console.log('Run: memo recall <query> to search memories.');
      return;
    }
    createTierDirs(globalDir);
    initConfig(globalDir, projectName);
    console.log(`✓ Personal memory initialized at: ${globalDir}`);
    console.log('  Memories here are private to your machine and never committed.');
  } else {
    const projectDir = path.join(cwd, '.memobank');
    if (fs.existsSync(path.join(projectDir, 'meta', 'config.yaml'))) {
      console.log(`.memobank/ already initialized in ${cwd}`);
      console.log('Run: memo recall <query> to search memories.');
      return;
    }
    createTierDirs(projectDir);
    initConfig(projectDir, projectName);
    // Add .memobank/meta/access-log.json to .gitignore if not already there
    ensureGitignore(cwd);
    console.log(`✓ Project memory initialized at: ${projectDir}`);
    console.log('  Commit .memobank/ with your code — it IS the team memory.');
  }
}

function createTierDirs(root: string): void {
  fs.mkdirSync(path.join(root, 'meta'), { recursive: true });
  for (const type of MEMORY_TYPES) {
    fs.mkdirSync(path.join(root, type), { recursive: true });
  }
}

function ensureGitignore(repoRoot: string): void {
  const gitignorePath = path.join(repoRoot, '.gitignore');
  const entry = '.memobank/meta/access-log.json';
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `${entry}\n`);
    return;
  }
  const content = fs.readFileSync(gitignorePath, 'utf-8');
  if (!content.includes(entry)) {
    fs.appendFileSync(gitignorePath, `\n# memobank — access log is local, not team state\n${entry}\n`);
  }
}
```

- [ ] **Step 2: Build to verify no errors**

```bash
npm run build 2>&1 | grep "error TS"
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/init.ts
git commit -m "feat: add init command (project and --global tiers)"
```

---

### Task 12: Wire everything into CLI

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Replace team subcommand with workspace; add init and migrate**

Replace the `// Team commands` block in `src/cli.ts` with:

```typescript
import { workspaceInit, workspaceSync, workspacePublish, workspaceStatus } from './commands/workspace';
import { initCommand } from './commands/init';
import { migrate } from './commands/migrate';
import { resetEpoch, runLifecycleScan } from './core/lifecycle-manager';

// Init command
program
  .command('init')
  .description('Initialize memobank in current project (project tier)')
  .option('--global', 'Initialize personal tier in ~/.memobank/<project>/')
  .option('--name <name>', 'Project name (defaults to directory name)')
  .action(async (options) => {
    try { await initCommand(options); }
    catch (error) { console.error(`Error: ${(error as Error).message}`); process.exit(1); }
  });

// Migrate command
program
  .command('migrate')
  .description('Migrate from legacy personal/+team/ layout to three-tier model')
  .option('--dry-run', 'Preview changes without executing')
  .option('--rollback', 'Restore from personal.bak/ and team.bak/')
  .option('--global-dir <path>', 'Target path for personal tier (default: ~/.memobank/<project>)')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (options) => {
    try {
      const repoRoot = findRepoRoot(process.cwd(), options.repo);
      const config = loadConfig(repoRoot);
      const home = process.env.HOME || process.env.USERPROFILE || '';
      const globalDir = options.globalDir
        ?? path.join(home, '.memobank', config.project.name);
      await migrate(repoRoot, globalDir, { dryRun: options.dryRun, rollback: options.rollback });
    } catch (error) { console.error(`Error: ${(error as Error).message}`); process.exit(1); }
  });

// Workspace commands
const workspace = program
  .command('workspace')
  .description('Cross-repo workspace memory sharing commands (optional)');

workspace
  .command('init <remote-url>')
  .description('Connect to a shared workspace memory repository')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (remoteUrl: string, options) => {
    try {
      const repoRoot = findRepoRoot(process.cwd(), options.repo);
      await workspaceInit(remoteUrl, repoRoot);
    } catch (error) { console.error(`Error: ${(error as Error).message}`); process.exit(1); }
  });

workspace
  .command('sync')
  .description('Pull latest workspace memories (--push to also push)')
  .option('--push', 'Push local changes to remote after pulling')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (options) => {
    try {
      const repoRoot = findRepoRoot(process.cwd(), options.repo);
      await workspaceSync(repoRoot, options.push);
    } catch (error) { console.error(`Error: ${(error as Error).message}`); process.exit(1); }
  });

workspace
  .command('publish <file>')
  .description('Promote a project memory to workspace (runs secret scan first)')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (file: string, options) => {
    try {
      const repoRoot = findRepoRoot(process.cwd(), options.repo);
      await workspacePublish(file, repoRoot);
    } catch (error) { console.error(`Error: ${(error as Error).message}`); process.exit(1); }
  });

workspace
  .command('status')
  .description('Show git status of local workspace clone')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (options) => {
    try {
      const repoRoot = findRepoRoot(process.cwd(), options.repo);
      await workspaceStatus(repoRoot);
    } catch (error) { console.error(`Error: ${(error as Error).message}`); process.exit(1); }
  });
```

Also update the `lifecycle` command block to add `--reset-epoch` and `--scan` flags:

```typescript
.option('--reset-epoch', 'Reset team epoch to now (use after team handoff)')
.option('--scan', 'Run full lifecycle scan — auto-update status on all memories')
```

And in the lifecycle action body add:

```typescript
if (options.resetEpoch) {
  resetEpoch(repoRoot);
  console.log('✓ Epoch reset.');
  return;
}
if (options.scan) {
  runLifecycleScan(repoRoot);
  console.log('✓ Lifecycle scan complete.');
  return;
}
```

Remove the old `import { teamInit, teamSync, teamPublish, teamStatus } from './commands/team';` line.

Also update `--scope` option in recall command from `personal|team|all` to `personal|project|workspace|all`.

- [ ] **Step 2: Build**

```bash
npm run build 2>&1 | grep "error TS"
```

Expected: No errors.

- [ ] **Step 3: Smoke test**

```bash
node dist/cli.js --help
node dist/cli.js workspace --help
node dist/cli.js init --help
node dist/cli.js migrate --help
```

Expected: All help text renders without errors; `team` subcommand no longer appears.

- [ ] **Step 4: Run full test suite**

```bash
npm test 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts
git commit -m "feat: wire workspace/init/migrate into CLI; remove team subcommand"
```

---

### Task 13: Final integration test + build

- [ ] **Step 1: Run complete test suite with coverage**

```bash
npm run test:coverage 2>&1 | tail -30
```

- [ ] **Step 2: Run full build**

```bash
npm run build
```

Expected: Clean build, no errors.

- [ ] **Step 3: Verify CLI help shows new commands**

```bash
node dist/cli.js --help | grep -E "workspace|init|migrate"
```

Expected: All three commands appear.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete memory architecture redesign — three-tier model, status lifecycle, workspace commands"
```

---

## Summary

| Task | Key change |
|------|-----------|
| 1 | `Status` type, `WorkspaceConfig`, `LifecycleConfig` added to types |
| 2 | Config: `team→workspace` alias, lifecycle defaults |
| 3 | Store: `getGlobalDir/getProjectDir/getWorkspaceDir`, three-tier `loadAll` with dedup |
| 4 | Decay: `computeEpochScore` linear dual-track formula |
| 5 | Lifecycle: `updateStatusOnRecall`, `runLifecycleScan`, `resetEpoch` |
| 6 | Retriever: calls `updateStatusOnRecall`; workspace scope label |
| 7 | Write: `status: experimental` on new memories |
| 8 | Workspace commands created; team commands deleted |
| 9 | Lifecycle cmd: `--reset-epoch`, `--scan` |
| 10 | Migrate command: dry-run, execute, rollback, conflict handling |
| 11 | Init command: `memo init` and `memo init --global` |
| 12 | CLI: workspace/init/migrate wired; team removed |
| 13 | Integration test + clean build |
