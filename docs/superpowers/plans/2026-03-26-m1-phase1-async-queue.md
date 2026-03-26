# M1 Phase 1: Async Queue + Project Boundary Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a `.pending/` queue between `memo capture` and memory file writes, stamping every memory with a `projectId`, while keeping user-visible behaviour identical to today.

**Architecture:** `capture` writes extracted candidates to `.pending/<id>.json` (with `projectId`), then immediately calls `processQueue` synchronously — Phase 2/3 only needs to change _when_ `processQueue` is called, not how. Project boundary is enforced at two points: `processQueue` deletes cross-project pending entries; `workspace publish` rejects memories whose frontmatter `project` field doesn't match the current repo.

**Tech Stack:** Node.js, TypeScript (strict), `gray-matter`, `execSync` (stdlib), Jest + `--experimental-vm-modules`

**Spec:** `docs/superpowers/specs/2026-03-26-m1-phase1-project-boundary-design.md`

---

## Chunk 1: Data Layer (types → store → queue-processor)

### Task 1: Add `project` field to `MemoryFile`

**Files:**

- Modify: `src/types.ts`

- [ ] **Step 1: Add the field**

In `src/types.ts`, add one optional field to `MemoryFile` after `scope`:

```typescript
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
  status?: Status;
  content: string;
  scope?: MemoryScope;
  project?: string; // source project ID (e.g. "org/repo"), written to frontmatter
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add optional project field to MemoryFile"
```

---

### Task 2: Update `store.ts` — `loadFile`, `writeMemory`, `writePending`, `resolveProjectId`

**Files:**

- Modify: `src/core/store.ts`
- Modify: `tests/store.test.ts`

#### 2a — `loadFile` and `writeMemory` handle `project` field

- [ ] **Step 1: Write failing tests**

Append to `tests/store.test.ts`:

```typescript
describe('writeMemory / loadFile — project field', () => {
  it('round-trips project field through frontmatter', () => {
    const repo = makeTempRepo();
    writeMemory(repo, {
      name: 'proj-test',
      type: 'lesson',
      description: 'desc',
      tags: [],
      confidence: 'high',
      status: 'active',
      content: 'body',
      created: '2026-03-26T00:00:00.000Z',
      project: 'org/my-repo',
    });
    const memories = loadAll(repo);
    expect(memories[0].project).toBe('org/my-repo');
    fs.rmSync(repo, { recursive: true });
  });

  it('loadFile returns undefined project when field is absent', () => {
    const repo = makeTempRepo();
    writeTestMemory(repo, 'lesson', '2026-01-01-no-project.md');
    const memories = loadAll(repo);
    expect(memories[0].project).toBeUndefined();
    fs.rmSync(repo, { recursive: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/store.test.ts -t "project field" --no-coverage
```

Expected: FAIL — `project` field not written/read yet.

- [ ] **Step 3: Update `writeMemory` to write `project` to frontmatter**

In `src/core/store.ts`, inside `writeMemory`, after the `confidence` conditional block (line ~234), add:

```typescript
if (memory.project) {
  frontmatter.project = memory.project;
}
```

- [ ] **Step 4: Update `loadFile` to read `project` from frontmatter**

In `src/core/store.ts`, in the `loadFile` return object (after `status`), add:

```typescript
    project: data.project as string | undefined,
```

- [ ] **Step 5: Run tests — expect pass**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/store.test.ts -t "project field" --no-coverage
```

Expected: PASS.

#### 2b — `resolveProjectId`

- [ ] **Step 6: Write failing tests**

Append to `tests/store.test.ts`:

```typescript
import { execSync } from 'child_process';
// add resolveProjectId to the import at the top of the file

describe('resolveProjectId', () => {
  it('falls back to config.project.name when no git remote', () => {
    // makeTempRepo writes project.name: "test" in config.yaml
    const repo = makeTempRepo();
    const projectId = resolveProjectId(repo);
    expect(projectId).toBe('test');
    fs.rmSync(repo, { recursive: true });
  });

  it('falls back to dirname when no git remote and no config name', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-pid-'));
    fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  description: no name\n');
    const projectId = resolveProjectId(dir);
    expect(projectId).toBe(path.basename(path.dirname(dir)));
    fs.rmSync(dir, { recursive: true });
  });

  it('parses HTTPS git remote URL', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-git-'));
    fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: fallback\n');
    // init a real git repo and add a remote
    execSync('git init', { cwd: path.dirname(dir), stdio: 'pipe' });
    execSync('git remote add origin https://github.com/myorg/myrepo.git', {
      cwd: path.dirname(dir),
      stdio: 'pipe',
    });
    const projectId = resolveProjectId(dir);
    expect(projectId).toBe('myorg/myrepo');
    fs.rmSync(dir, { recursive: true });
  });
});
```

Update the import at the top of `tests/store.test.ts` to include `resolveProjectId`:

```typescript
import {
  getGlobalDir,
  getProjectDir,
  getWorkspaceDir,
  loadAll,
  writeMemory,
  resolveProjectId,
} from '../src/core/store';
```

- [ ] **Step 7: Run tests to verify they fail**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/store.test.ts -t "resolveProjectId" --no-coverage
```

Expected: FAIL — `resolveProjectId` not exported yet.

- [ ] **Step 8: Implement `resolveProjectId` in `store.ts`**

Add at the top of `src/core/store.ts` after the existing imports:

```typescript
import { execSync } from 'child_process';
```

Add the function after `findGitRoot` (around line 107):

```typescript
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
    if (match?.[1]) return match[1];
  } catch {
    /* no remote or not a git repo — fall through */
  }

  // 2. config.project.name
  try {
    const cfg = loadConfig(memoBankDir);
    if (cfg.project?.name) return cfg.project.name;
  } catch {
    /* config unreadable — fall through */
  }

  // 3. parent directory name
  return path.basename(gitCwd);
}
```

- [ ] **Step 9: Run tests — expect pass**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/store.test.ts -t "resolveProjectId" --no-coverage
```

Expected: PASS.

#### 2c — `writePending`

- [ ] **Step 10: Write failing tests**

Append to `tests/store.test.ts`:

```typescript
import { writePending } from '../src/core/store';
// add writePending to the import block at the top

describe('writePending', () => {
  it('creates .pending/<id>.json with correct content', () => {
    const repo = makeTempRepo();
    const entry = {
      id: 'LRN-test-001',
      timestamp: '2026-03-26T00:00:00.000Z',
      projectId: 'org/repo',
      candidates: [
        {
          name: 'test-lesson',
          type: 'lesson' as const,
          description: 'desc',
          tags: ['a'],
          confidence: 'high' as const,
          content: 'body',
        },
      ],
    };
    writePending(repo, entry);
    const filePath = path.join(repo, '.pending', 'LRN-test-001.json');
    expect(fs.existsSync(filePath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(parsed.projectId).toBe('org/repo');
    expect(parsed.candidates[0].name).toBe('test-lesson');
    fs.rmSync(repo, { recursive: true });
  });

  it('creates .pending/ directory if it does not exist', () => {
    const repo = makeTempRepo();
    expect(fs.existsSync(path.join(repo, '.pending'))).toBe(false);
    writePending(repo, {
      id: 'LRN-mkdir-test',
      timestamp: '2026-03-26T00:00:00.000Z',
      projectId: 'org/repo',
      candidates: [],
    });
    expect(fs.existsSync(path.join(repo, '.pending'))).toBe(true);
    fs.rmSync(repo, { recursive: true });
  });
});
```

Update the top import to include `writePending`:

```typescript
import {
  getGlobalDir,
  getProjectDir,
  getWorkspaceDir,
  loadAll,
  writeMemory,
  resolveProjectId,
  writePending,
} from '../src/core/store';
```

- [ ] **Step 11: Run tests to verify they fail**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/store.test.ts -t "writePending" --no-coverage
```

Expected: FAIL.

- [ ] **Step 12: Implement `writePending` in `store.ts`**

Add the `PendingEntry` type and `writePending` function. Add after `resolveProjectId`:

```typescript
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
  const pendingDir = path.join(memoBankDir, '.pending');
  if (!fs.existsSync(pendingDir)) {
    fs.mkdirSync(pendingDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(pendingDir, `${entry.id}.json`),
    JSON.stringify(entry, null, 2),
    'utf-8'
  );
}
```

- [ ] **Step 13: Run tests — expect pass**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/store.test.ts --no-coverage
```

Expected: all store tests PASS.

- [ ] **Step 14: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 15: Commit**

```bash
git add src/core/store.ts src/types.ts tests/store.test.ts
git commit -m "feat(store): add resolveProjectId, writePending; round-trip project field"
```

---

### Task 3: Create `queue-processor.ts`

**Files:**

- Create: `src/core/queue-processor.ts`
- Create: `tests/queue-processor.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/queue-processor.test.ts`:

```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { processQueue } from '../src/core/queue-processor';
import { loadAll } from '../src/core/store';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-pq-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  // project.name is used by resolveProjectId as fallback
  fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: test-project\n');
  return dir;
}

function writePendingFile(repo: string, entry: object): void {
  const pendingDir = path.join(repo, '.pending');
  fs.mkdirSync(pendingDir, { recursive: true });
  const id = (entry as { id: string }).id;
  fs.writeFileSync(path.join(pendingDir, `${id}.json`), JSON.stringify(entry, null, 2));
}

describe('processQueue', () => {
  it('does nothing when .pending/ does not exist', async () => {
    const repo = makeTempRepo();
    await expect(processQueue(repo)).resolves.not.toThrow();
    fs.rmSync(repo, { recursive: true });
  });

  it('writes candidate to memory file and deletes pending file', async () => {
    const repo = makeTempRepo();
    writePendingFile(repo, {
      id: 'LRN-001',
      timestamp: '2026-03-26T00:00:00.000Z',
      projectId: 'test-project',
      candidates: [
        {
          name: 'my-lesson',
          type: 'lesson',
          description: 'a lesson',
          tags: ['x'],
          confidence: 'high',
          content: 'body',
        },
      ],
    });

    await processQueue(repo);

    const memories = loadAll(repo);
    expect(memories.some((m) => m.name === 'my-lesson')).toBe(true);
    expect(memories[0].project).toBe('test-project');
    expect(fs.existsSync(path.join(repo, '.pending', 'LRN-001.json'))).toBe(false);
    fs.rmSync(repo, { recursive: true });
  });

  it('skips duplicate (same name already exists)', async () => {
    const repo = makeTempRepo();
    // Write an existing memory
    fs.mkdirSync(path.join(repo, 'lesson'), { recursive: true });
    fs.writeFileSync(
      path.join(repo, 'lesson', '2026-01-01-existing.md'),
      '---\nname: existing-lesson\ntype: lesson\ndescription: d\ntags: []\ncreated: "2026-01-01"\nstatus: active\n---\nbody'
    );
    writePendingFile(repo, {
      id: 'LRN-dup',
      timestamp: '2026-03-26T00:00:00.000Z',
      projectId: 'test-project',
      candidates: [
        {
          name: 'existing-lesson',
          type: 'lesson',
          description: 'd',
          tags: [],
          confidence: 'high',
          content: 'body',
        },
      ],
    });

    await processQueue(repo);

    const memories = loadAll(repo);
    expect(memories.filter((m) => m.name === 'existing-lesson').length).toBe(1);
    fs.rmSync(repo, { recursive: true });
  });

  it('deletes pending file whose projectId does not match current project', async () => {
    const repo = makeTempRepo(); // project.name = "test-project"
    writePendingFile(repo, {
      id: 'LRN-foreign',
      timestamp: '2026-03-26T00:00:00.000Z',
      projectId: 'other-org/other-repo',
      candidates: [
        {
          name: 'foreign-lesson',
          type: 'lesson',
          description: 'd',
          tags: [],
          confidence: 'high',
          content: 'body',
        },
      ],
    });

    await processQueue(repo);

    expect(fs.existsSync(path.join(repo, '.pending', 'LRN-foreign.json'))).toBe(false);
    const memories = loadAll(repo);
    expect(memories.some((m) => m.name === 'foreign-lesson')).toBe(false);
    fs.rmSync(repo, { recursive: true });
  });

  it('deletes and warns on corrupt pending file', async () => {
    const repo = makeTempRepo();
    const pendingDir = path.join(repo, '.pending');
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.writeFileSync(path.join(pendingDir, 'corrupt.json'), '{not valid json');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await processQueue(repo);
    expect(fs.existsSync(path.join(pendingDir, 'corrupt.json'))).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('corrupt'));
    warnSpy.mockRestore();
    fs.rmSync(repo, { recursive: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/queue-processor.test.ts --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `queue-processor.ts`**

Create `src/core/queue-processor.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { loadAll, writeMemory, resolveProjectId } from './store';
import type { PendingEntry } from './store';

export async function processQueue(memoBankDir: string): Promise<void> {
  const pendingDir = path.join(memoBankDir, '.pending');
  if (!fs.existsSync(pendingDir)) return;

  const files = fs.readdirSync(pendingDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) return;

  const currentProjectId = resolveProjectId(memoBankDir);
  const existing = loadAll(memoBankDir);

  for (const file of files) {
    const filePath = path.join(pendingDir, file);

    let entry: PendingEntry;
    try {
      entry = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as PendingEntry;
    } catch {
      console.warn(`Skipping corrupt pending file: ${file}`);
      fs.unlinkSync(filePath);
      continue;
    }

    if (entry.projectId !== currentProjectId) {
      console.warn(`Deleted cross-project entry: ${entry.projectId} !== ${currentProjectId}`);
      fs.unlinkSync(filePath);
      continue;
    }

    for (const candidate of entry.candidates) {
      if (existing.some((m) => m.name === candidate.name)) continue;
      writeMemory(memoBankDir, {
        ...candidate,
        created: new Date().toISOString(),
        project: entry.projectId,
      });
    }

    fs.unlinkSync(filePath);
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/queue-processor.test.ts --no-coverage
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all existing tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/queue-processor.ts tests/queue-processor.test.ts
git commit -m "feat(queue-processor): processQueue writes pending candidates, enforces project boundary"
```

---

## Chunk 2: Integration (capture → workspace → gitignore)

### Task 4: Refactor `capture.ts` to use pending queue

**Files:**

- Modify: `src/commands/capture.ts`

No new test file needed — `processQueue` is already tested. The capture change is a structural wiring.

- [ ] **Step 1: Update imports in `capture.ts`**

Replace the existing import block:

```typescript
// Before:
import { writeMemory, loadAll, findRepoRoot } from '../core/store';

// After:
import { writePending, findRepoRoot, resolveProjectId } from '../core/store';
import { processQueue } from '../core/queue-processor';
import type { PendingEntry } from '../core/store';
```

Also remove `import * as crypto from 'crypto';` — no longer needed.

Remove the `MemoryFile` import from types if it becomes unused after the refactor.

- [ ] **Step 2: Remove `hashString` and `isDuplicate` functions**

Delete lines 27–37 in `capture.ts`:

```typescript
// DELETE these two functions entirely:
function hashString(str: string): string { ... }
function isDuplicate(name: string, existingMemories: MemoryFile[]): boolean { ... }
```

- [ ] **Step 3: Replace steps 5–6 in the `capture` function**

Find the block starting at `// 5. Load existing memories for deduplication` (around line 165) and replace through the end of the write loop with:

```typescript
// 5. Write to pending queue, then process immediately (Phase 2/3: defer this call)
const entry: PendingEntry = {
  id: `LRN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  timestamp: new Date().toISOString(),
  projectId: resolveProjectId(repoRoot),
  candidates: highValueMemories.map((item) => ({
    name: item.name,
    type: item.type,
    description: item.description,
    tags: item.tags,
    confidence: item.confidence,
    content: item.content,
  })),
};

writePending(repoRoot, entry);
await processQueue(repoRoot);

// 6. Print summary
console.log(`\n📝 Captured up to ${highValueMemories.length} high-value memories`);
console.log(`   (duplicates skipped silently)\n`);
```

Also remove the `written` counter variable and its references — the summary no longer needs it (dedup happens inside `processQueue`).

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Smoke test (manual)**

```bash
npm run dev -- capture --session="We decided to use pnpm. Never use npm install in this project." --silent
```

Expected: no crash; a new `.md` file created under `.memobank/decision/` or `.memobank/lesson/` with `project:` in frontmatter. No `.pending/` files left behind.

- [ ] **Step 7: Commit**

```bash
git add src/commands/capture.ts
git commit -m "refactor(capture): route extractions through pending queue via processQueue"
```

---

### Task 5: Add project boundary check to `workspace publish`

**Files:**

- Modify: `src/commands/workspace.ts`
- Modify: `tests/workspace.test.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/workspace.test.ts`:

```typescript
describe('workspacePublish — project boundary', () => {
  it('rejects file whose project frontmatter does not match current project', async () => {
    const { workspacePublish } = await import('../src/commands/workspace');
    const repo = makeTempRepo(); // config.yaml: project.name = "test"
    const wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-ws-boundary-'));
    fs.mkdirSync(path.join(repo, 'lesson'), { recursive: true });
    const srcFile = path.join(repo, 'lesson', '2026-01-01-foreign.md');
    fs.writeFileSync(
      srcFile,
      '---\nname: foreign\ntype: lesson\ndescription: d\ntags: []\ncreated: "2026-01-01"\nstatus: active\nproject: other-org/other-repo\n---\nbody'
    );
    await expect(workspacePublish(srcFile, repo, wsDir)).rejects.toThrow(
      'Project boundary violation'
    );
    fs.rmSync(repo, { recursive: true });
    fs.rmSync(wsDir, { recursive: true });
  });

  it('allows publish when project frontmatter matches current project', async () => {
    const { workspacePublish } = await import('../src/commands/workspace');
    const repo = makeTempRepo(); // config.yaml: project.name = "test"
    const wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-ws-match-'));
    fs.mkdirSync(path.join(repo, 'lesson'), { recursive: true });
    const srcFile = path.join(repo, 'lesson', '2026-01-01-match.md');
    fs.writeFileSync(
      srcFile,
      '---\nname: match\ntype: lesson\ndescription: d\ntags: []\ncreated: "2026-01-01"\nstatus: active\nproject: test\n---\nbody'
    );
    await expect(workspacePublish(srcFile, repo, wsDir)).resolves.not.toThrow();
    fs.rmSync(repo, { recursive: true });
    fs.rmSync(wsDir, { recursive: true });
  });

  it('allows publish when project frontmatter is absent (legacy files)', async () => {
    const { workspacePublish } = await import('../src/commands/workspace');
    const repo = makeTempRepo();
    const wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-ws-legacy-'));
    fs.mkdirSync(path.join(repo, 'lesson'), { recursive: true });
    const srcFile = path.join(repo, 'lesson', '2026-01-01-legacy.md');
    fs.writeFileSync(
      srcFile,
      '---\nname: legacy\ntype: lesson\ndescription: d\ntags: []\ncreated: "2026-01-01"\nstatus: active\n---\nbody'
    );
    await expect(workspacePublish(srcFile, repo, wsDir)).resolves.not.toThrow();
    fs.rmSync(repo, { recursive: true });
    fs.rmSync(wsDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/workspace.test.ts -t "project boundary" --no-coverage
```

Expected: FAIL — no boundary check exists yet.

- [ ] **Step 3: Add the check to `workspacePublish`**

In `src/commands/workspace.ts`, add the import at the top:

```typescript
import matter from 'gray-matter';
import { resolveProjectId } from '../core/store';
```

Then in `workspacePublish`, after the secret scan block (after line ~130, before `const config = loadConfig`), insert:

```typescript
// Project boundary check: reject memories that belong to a different project
const fileContent = fs.readFileSync(absoluteFilePath, 'utf-8');
const { data: frontmatter } = matter(fileContent);
if (frontmatter.project) {
  const currentProjectId = resolveProjectId(absoluteRepoRoot);
  if (frontmatter.project !== currentProjectId) {
    throw new Error(
      `Project boundary violation: memory belongs to "${frontmatter.project as string}", ` +
        `current project is "${currentProjectId}". Aborting publish.`
    );
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/workspace.test.ts --no-coverage
```

Expected: all workspace tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/commands/workspace.ts tests/workspace.test.ts
git commit -m "feat(workspace): reject publish of memories belonging to a different project"
```

---

### Task 6: Add `.pending/` to `.gitignore`

**Files:**

- Modify: `.gitignore`

- [ ] **Step 1: Add entry**

In `.gitignore`, under the `# Test Data (memobank specific)` section, append:

```
# ======================
# Memobank pending queue
# ======================
.memobank/.pending/
```

- [ ] **Step 2: Verify**

```bash
git check-ignore -v .memobank/.pending/test.json
```

Expected: `.gitignore:.memobank/.pending/test.json`

- [ ] **Step 3: Final full test + lint**

```bash
npm test && npm run lint && npm run typecheck
```

Expected: all pass, no errors.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore .memobank/.pending/ queue dir from git"
```

---

## Done

All tasks complete. Verify with:

```bash
npm test
npm run typecheck
npm run lint
```

The pending queue infrastructure is in place. Phase 2/3 only needs to change _when_ `processQueue` is called — the data flow is complete.
