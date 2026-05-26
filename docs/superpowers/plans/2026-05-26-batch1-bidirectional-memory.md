# Batch 1: Bidirectional Memory Tools Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `memo remember`, `memo update`, `--hook-input` recall, UserPromptSubmit hook, and session snapshots so Claude can actively read and write memories mid-session.

**Architecture:** Three new CLI commands write directly to `.pending/` or existing memory files. A new `--hook-input` flag on `recall` reads stdin JSON from Claude Code hooks. Session snapshots are generated deterministically at the end of each `capture --auto` run. No new dependencies.

**Tech Stack:** TypeScript, Commander.js (existing), Jest (existing), Node.js `process.stdin`

**Spec:** `docs/superpowers/specs/2026-05-26-bidirectional-memory-tools-design.md`

---

## File Map

| File                              | Action | Responsibility                                                  |
| --------------------------------- | ------ | --------------------------------------------------------------- |
| `src/commands/remember.ts`        | Create | `memo remember` — Memorize with 60s debounce + background drain |
| `src/commands/update-memory.ts`   | Create | `memo update` — update existing memory body                     |
| `src/commands/recall.ts`          | Modify | Add `--hook-input` flag; read stdin JSON → extract `.prompt`    |
| `src/platforms/claude-code.ts`    | Modify | Add `UserPromptSubmit` hook to `installClaudeCode`              |
| `src/commands/capture.ts`         | Modify | Add `generateSessionSummary()` at end of auto-mode session loop |
| `src/cli.ts`                      | Modify | Register `remember` and `update` commands                       |
| `tests/remember.test.ts`          | Create | Tests for debounce, write, background drain trigger             |
| `tests/update-memory.test.ts`     | Create | Tests for update success, missing-name error                    |
| `tests/recall-hook-input.test.ts` | Create | Tests for `--hook-input` stdin parsing                          |
| `tests/capture-auto.test.ts`      | Modify | Add session snapshot generation test                            |
| `tests/hook-installer.test.ts`    | Modify | Verify UserPromptSubmit hook added by `installClaudeCode`       |

---

## Chunk 1: `memo remember` command

### Task 1: Write failing tests for `memo remember`

**Files:**

- Create: `tests/remember.test.ts`

- [ ] **Step 1: Create test file**

```typescript
// tests/remember.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-remember-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'meta', 'config.yaml'),
    'project:\n  name: test\nembedding:\n  engine: text\nmemory:\n  token_budget: 4000\n  top_k: 10\n'
  );
  return dir;
}

describe('memo remember', () => {
  it('writes a pending entry to .pending/', async () => {
    const { remember } = await import('../src/commands/remember');
    const repo = makeTempRepo();
    await remember({
      name: 'test-lesson',
      description: 'A test lesson',
      content: '## Problem\nSomething happened.',
      type: 'lesson',
      tags: 'test,unit',
      repo,
    });
    const pendingDir = path.join(repo, '.pending');
    const files = fs.readdirSync(pendingDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBe(1);
    const entry = JSON.parse(fs.readFileSync(path.join(pendingDir, files[0]), 'utf-8'));
    expect(entry.candidates[0].name).toBe('test-lesson');
    expect(entry.candidates[0].type).toBe('lesson');
    fs.rmSync(repo, { recursive: true });
  });

  it('skips write if same name exists in .pending/ within 60 seconds', async () => {
    const { remember } = await import('../src/commands/remember');
    const repo = makeTempRepo();
    await remember({ name: 'dupe', description: 'First', content: 'body', repo });
    await remember({ name: 'dupe', description: 'Second', content: 'body2', repo });
    const files = fs.readdirSync(path.join(repo, '.pending')).filter((f) => f.endsWith('.json'));
    expect(files.length).toBe(1);
    fs.rmSync(repo, { recursive: true });
  });

  it('sanitizes secrets before writing', async () => {
    const { remember } = await import('../src/commands/remember');
    const repo = makeTempRepo();
    await remember({
      name: 'secret-test',
      description: 'Contains secret',
      content: 'My key is sk-abcdefghijklmnopqrstuvwxyz123456',
      repo,
    });
    const pendingDir = path.join(repo, '.pending');
    const files = fs.readdirSync(pendingDir).filter((f) => f.endsWith('.json'));
    const entry = JSON.parse(fs.readFileSync(path.join(pendingDir, files[0]), 'utf-8'));
    expect(entry.candidates[0].content).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
    fs.rmSync(repo, { recursive: true });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/remember.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../src/commands/remember'`

---

### Task 2: Implement `memo remember`

**Files:**

- Create: `src/commands/remember.ts`

- [ ] **Step 3: Create the command**

```typescript
// src/commands/remember.ts
import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot, resolveProjectId } from '../core/dir-resolver';
import { sanitize } from '../core/sanitizer';
import { writePending } from '../core/store';
import type { MemoryType } from '../types';

export interface RememberOptions {
  name: string;
  description: string;
  content: string;
  type?: string;
  tags?: string;
  codeRefs?: string;
  repo?: string;
}

const DEBOUNCE_WINDOW_MS = 60_000;

function hasPendingWithName(pendingDir: string, name: string): boolean {
  if (!fs.existsSync(pendingDir)) return false;
  const now = Date.now();
  for (const file of fs.readdirSync(pendingDir).filter((f) => f.endsWith('.json'))) {
    try {
      const raw = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
      const entry = JSON.parse(raw) as {
        timestamp: string;
        candidates: Array<{ name: string }>;
      };
      const age = now - new Date(entry.timestamp).getTime();
      if (age < DEBOUNCE_WINDOW_MS && entry.candidates.some((c) => c.name === name)) {
        return true;
      }
    } catch {
      // corrupt file — skip
    }
  }
  return false;
}

export async function remember(options: RememberOptions): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd(), options.repo);
  const pendingDir = path.join(repoRoot, '.pending');

  // Time-window debounce: skip if same name captured within 60s
  if (hasPendingWithName(pendingDir, options.name)) {
    return;
  }

  const tags = options.tags
    ? options.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const codeRefs = options.codeRefs
    ? options.codeRefs
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)
    : undefined;

  const sanitizedContent = sanitize(options.content);

  writePending(repoRoot, {
    id: `REM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    projectId: resolveProjectId(repoRoot),
    candidates: [
      {
        name: options.name,
        type: (options.type ?? 'lesson') as MemoryType,
        description: options.description,
        tags,
        confidence: 'high',
        content: sanitizedContent,
        ...(codeRefs ? { codeRefs } : {}),
      },
    ],
  });

  // Background drain — non-blocking
  try {
    const { spawn } = await import('child_process');
    const child = spawn(
      process.execPath,
      [path.join(__dirname, '..', '..', 'dist', 'cli.js'), 'process-queue', '--background'],
      { detached: true, stdio: 'ignore' }
    );
    child.unref();
  } catch {
    // not fatal — Stop hook will drain
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/remember.test.ts --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck**

```
npm run typecheck
```

Expected: no errors

- [ ] **Step 6: Commit**

```
git add src/commands/remember.ts tests/remember.test.ts
git commit -m "feat(remember): add memo remember command with 60s debounce and background drain"
```

---

### Task 3: `memo update` command

**Files:**

- Create: `src/commands/update-memory.ts`
- Create: `tests/update-memory.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/update-memory.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeMemory } from '../src/core/store';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-update-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: test\n');
  return dir;
}

describe('memo update', () => {
  it('updates the markdown body of an existing memory', async () => {
    const { updateMemoryCommand } = await import('../src/commands/update-memory');
    const repo = makeTempRepo();
    writeMemory(repo, {
      name: 'my-lesson',
      type: 'lesson',
      description: 'A lesson',
      tags: [],
      confidence: 'high',
      content: '## Original\nOld content.',
      created: new Date().toISOString(),
    });
    await updateMemoryCommand({ name: 'my-lesson', content: '## Updated\nNew content.', repo });
    const { loadAll } = await import('../src/core/memory-loader');
    const memories = loadAll(repo, 'project');
    const updated = memories.find((m) => m.name === 'my-lesson');
    expect(updated?.content).toContain('New content.');
    fs.rmSync(repo, { recursive: true });
  });

  it('throws a clear error if memory name not found', async () => {
    const { updateMemoryCommand } = await import('../src/commands/update-memory');
    const repo = makeTempRepo();
    await expect(
      updateMemoryCommand({ name: 'does-not-exist', content: 'body', repo })
    ).rejects.toThrow('Memory not found: does-not-exist');
    fs.rmSync(repo, { recursive: true });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/update-memory.test.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
// src/commands/update-memory.ts
import { findRepoRoot } from '../core/dir-resolver';
import { updateMemoryContent } from '../core/store';
import { loadAll } from '../core/memory-loader';

export interface UpdateMemoryOptions {
  name: string;
  content: string;
  repo?: string;
}

export async function updateMemoryCommand(options: UpdateMemoryOptions): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd(), options.repo);
  const memories = loadAll(repoRoot, 'project');
  const target = memories.find((m) => m.name === options.name);
  if (!target) {
    throw new Error(`Memory not found: ${options.name}`);
  }
  updateMemoryContent(repoRoot, options.name, options.content);
}
```

- [ ] **Step 4: Run tests to pass**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/update-memory.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Typecheck**

```
npm run typecheck
```

Expected: no errors

- [ ] **Step 6: Commit**

```
git add src/commands/update-memory.ts tests/update-memory.test.ts
git commit -m "feat(update): add memo update command for in-session memory correction"
```

---

## Chunk 2: `--hook-input` and UserPromptSubmit hook

### Task 4: Add `--hook-input` to `memo recall`

`memo recall --hook-input` reads a JSON object from stdin, extracts the `prompt` field, and uses it as the recall query. This is how Claude Code's `UserPromptSubmit` hook passes the user's message.

**Files:**

- Modify: `src/commands/recall.ts` (add `hookInput?: boolean` to `RecallOptions`, stdin reader)
- Create: `tests/recall-hook-input.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/recall-hook-input.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-hook-recall-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'meta', 'config.yaml'),
    'project:\n  name: test\nembedding:\n  engine: text\nmemory:\n  token_budget: 4000\n  top_k: 5\n'
  );
  return dir;
}

describe('recallCommand --hook-input', () => {
  it('reads prompt from stdin JSON and runs recall silently', async () => {
    const { recallCommand } = await import('../src/commands/recall');
    const repo = makeTempRepo();

    // Simulate Claude Code hook stdin
    const hookPayload = JSON.stringify({
      hook_event_name: 'UserPromptSubmit',
      prompt: 'how does the pending queue work',
      session_id: 'test-123',
    });

    const originalStdin = process.stdin;
    // @ts-expect-error replace stdin for test
    process.stdin = Readable.from([hookPayload]);

    await recallCommand('', { hookInput: true, silent: true, repo });

    // @ts-expect-error restore
    process.stdin = originalStdin;
    fs.rmSync(repo, { recursive: true });
  });

  it('exits cleanly if stdin JSON has no prompt field', async () => {
    const { recallCommand } = await import('../src/commands/recall');
    const repo = makeTempRepo();
    const originalStdin = process.stdin;
    // @ts-expect-error
    process.stdin = Readable.from([JSON.stringify({ session_id: 'x' })]);
    await expect(
      recallCommand('', { hookInput: true, silent: true, dryRun: true, repo })
    ).resolves.not.toThrow();
    // @ts-expect-error
    process.stdin = originalStdin;
    fs.rmSync(repo, { recursive: true });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/recall-hook-input.test.ts --no-coverage
```

Expected: FAIL — `RecallOptions` has no `hookInput` property

- [ ] **Step 3: Add `hookInput` to `RecallOptions` and implement stdin reading**

In `src/commands/recall.ts`, add to `RecallOptions`:

```typescript
// add to RecallOptions interface
hookInput?: boolean;
```

Add a helper before `recallCommand`:

```typescript
async function readHookPrompt(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    const timeout = setTimeout(() => resolve(''), 3000);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      clearTimeout(timeout);
      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        resolve(typeof parsed.prompt === 'string' ? parsed.prompt : '');
      } catch {
        resolve('');
      }
    });
  });
}
```

Insert as the very first lines of `recallCommand`, before the `if (!query || !query.trim())` empty-query guard:

```typescript
// Hook input mode: read query from stdin JSON
if (options.hookInput) {
  const hookPrompt = await readHookPrompt();
  if (!hookPrompt.trim()) return; // no prompt — exit cleanly
  // Recurse with the extracted prompt, hook-input cleared
  return recallCommand(hookPrompt, { ...options, hookInput: false });
}
```

- [ ] **Step 4: Run tests to pass**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/recall-hook-input.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```
git add src/commands/recall.ts tests/recall-hook-input.test.ts
git commit -m "feat(recall): add --hook-input flag for UserPromptSubmit hook stdin JSON"
```

---

### Task 5: Add UserPromptSubmit hook to `installClaudeCode`

**Files:**

- Modify: `src/platforms/claude-code.ts`
- Modify: `tests/hook-installer.test.ts` (extend existing Claude Code tests)

- [ ] **Step 1: Write failing test**

In `tests/hook-installer.test.ts`, look for the existing Claude Code settings test or add:

```typescript
// Add inside the existing claude-code install describe block, or create a new one
import { installClaudeCode } from '../src/platforms/claude-code';

describe('installClaudeCode — UserPromptSubmit hook', () => {
  it('adds UserPromptSubmit hook with --hook-input command', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-cctest-'));
    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

    // Patch HOME so installClaudeCode writes to our temp dir
    const origHome = process.env.HOME || process.env.USERPROFILE;
    process.env.HOME = tmpDir;
    process.env.USERPROFILE = tmpDir;

    installClaudeCode(tmpDir, false);

    process.env.HOME = origHome;
    process.env.USERPROFILE = origHome;

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const upHooks = settings.hooks?.UserPromptSubmit ?? [];
    const hasHookInput = upHooks.some((h: { hooks?: Array<{ command?: string }> }) =>
      h.hooks?.some((cmd) => cmd.command?.includes('--hook-input'))
    );
    expect(hasHookInput).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/hook-installer.test.ts --no-coverage -t "UserPromptSubmit"
```

Expected: FAIL

- [ ] **Step 3: Add UserPromptSubmit hook in `installClaudeCode`**

In `src/platforms/claude-code.ts`, after the Stop hook block, add:

```typescript
// UserPromptSubmit hook: auto-recall on every user message
const isWindows_up = os.platform() === 'win32';
const UP_HOOK_CMD = isWindows_up
  ? 'powershell -c "memo recall --hook-input --silent --top 3"'
  : 'memo recall --hook-input --silent --top 3';

// Remove existing memobank UserPromptSubmit hooks before re-adding
if (hookMap.UserPromptSubmit) {
  hookMap.UserPromptSubmit = hookMap.UserPromptSubmit.filter(
    (h: HookMatcher) =>
      !h.hooks?.some(
        (cmd: HookCommand) =>
          cmd.type === 'command' && cmd.command?.includes('memo recall --hook-input')
      )
  );
  if (hookMap.UserPromptSubmit.length === 0) delete hookMap.UserPromptSubmit;
}

hookMap.UserPromptSubmit = [
  ...(hookMap.UserPromptSubmit ?? []),
  {
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: UP_HOOK_CMD,
        timeout: 10,
      },
    ],
  },
];
```

- [ ] **Step 4: Run tests to pass**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/hook-installer.test.ts --no-coverage
```

Expected: PASS (all existing + new)

- [ ] **Step 5: Commit**

```
git add src/platforms/claude-code.ts tests/hook-installer.test.ts
git commit -m "feat(hooks): add UserPromptSubmit auto-recall hook to Claude Code install"
```

---

## Chunk 3: Session snapshots and CLI registration

### Task 6: Session snapshot generation in `capture --auto`

A **Session Snapshot** is a `workflow`-type Memory generated deterministically at the end of each `capture --auto` session. It records branch, last commit, changed files, extracted memory names, and unfinished work. No LLM required.

**Files:**

- Modify: `src/commands/capture.ts`
- Modify: `tests/capture-auto.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/capture-auto.test.ts`:

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('capture --auto session snapshot', () => {
  it('writes a session snapshot to .pending/ after processing a session', async () => {
    // This test verifies generateSessionSummary() is called and produces a pending entry.
    // We test the helper function directly.
    const { generateSessionSummary } = await import('../src/commands/capture');
    const repo = (await import('os')).tmpdir();
    const tmpRepo = path.join(repo, `snap-test-${Date.now()}`);
    await fs.mkdir(path.join(tmpRepo, 'meta'), { recursive: true });
    await fs.writeFile(path.join(tmpRepo, 'meta', 'config.yaml'), 'project:\n  name: test\n');

    const entry = generateSessionSummary({
      branch: 'feat/my-feature',
      lastCommit: 'abc1234 add something',
      gitStatus: 'M src/foo.ts',
      extractedNames: ['my-lesson', 'my-decision'],
      repoRoot: tmpRepo,
    });

    expect(entry.candidates[0].type).toBe('workflow');
    expect(entry.candidates[0].name).toMatch(/^session-\d{4}-\d{2}-\d{2}-feat-my-feature$/);
    expect(entry.candidates[0].tags).toContain('session');
    expect(entry.candidates[0].content).toContain('feat/my-feature');
    expect(entry.candidates[0].content).toContain('my-lesson');
    await fs.rm(tmpRepo, { recursive: true });
  });

  it('returns null when no branch and no extracted memories and no git status', async () => {
    const { generateSessionSummary } = await import('../src/commands/capture');
    const result = generateSessionSummary({
      branch: '',
      lastCommit: '',
      gitStatus: '',
      extractedNames: [],
      repoRoot: os.tmpdir(),
    });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/capture-auto.test.ts --no-coverage -t "session snapshot"
```

Expected: FAIL — `generateSessionSummary` is not exported

- [ ] **Step 3: Add `generateSessionSummary` to `capture.ts`**

Add this function and export it (exported for testability):

```typescript
// Add to src/commands/capture.ts

export interface SessionSummaryInput {
  branch: string;
  lastCommit: string;
  gitStatus: string;
  extractedNames: string[];
  repoRoot: string;
}

export function generateSessionSummary(input: SessionSummaryInput): PendingEntry | null {
  const { branch, lastCommit, gitStatus, extractedNames } = input;

  // Skip if nothing meaningful happened
  if (!branch && extractedNames.length === 0 && !gitStatus) return null;

  const date = new Date().toISOString().slice(0, 10);
  const branchSlug = branch
    .replace(/[^a-z0-9]/gi, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
  const name = `session-${date}${branchSlug ? '-' + branchSlug : ''}`;

  const sections: string[] = [
    `## Session`,
    `**Date**: ${date}`,
    branch ? `**Branch**: ${branch}` : '',
    lastCommit ? `**Last Commit**: ${lastCommit}` : '',
  ].filter(Boolean);

  if (gitStatus) {
    sections.push('', '## Files Changed', gitStatus);
  }

  if (extractedNames.length > 0) {
    sections.push('', '## Memories Extracted');
    extractedNames.forEach((n) => sections.push(`- ${n}`));
  }

  const hasUnfinished = gitStatus && gitStatus.trim().length > 0;
  sections.push('', '## Unfinished Work');
  sections.push(hasUnfinished ? gitStatus : '(none — clean session)');

  const content = sections.join('\n');
  // resolveProjectId is already imported at the top of capture.ts — no require() needed
  return {
    id: `SNAP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    projectId: resolveProjectId(input.repoRoot),
    candidates: [
      {
        name,
        type: 'workflow' as const,
        description: `Session snapshot: ${branch || '(no branch)'} ${date}`,
        tags: ['session', branchSlug || 'unknown', date].filter(Boolean),
        confidence: 'high' as const,
        content,
      },
    ],
  };
}
```

Insert the following block inside the session loop in `capture()` auto mode, **before** `markSessionProcessed` — so the snapshot is drained in the same `processQueue` call:

```typescript
// Generate session snapshot
const extractedNames = [...toWrite.map((c) => c.name), ...toUpdate.map((u) => u.targetName)];
const snapshot = generateSessionSummary({
  branch: gitBranch,
  lastCommit: gitLastCommit,
  gitStatus,
  extractedNames,
  repoRoot,
});
if (snapshot) {
  writePending(repoRoot, snapshot);
}
```

- [ ] **Step 4: Run tests to pass**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/capture-auto.test.ts --no-coverage
```

Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```
git add src/commands/capture.ts tests/capture-auto.test.ts
git commit -m "feat(capture): generate session snapshot memory at end of each auto-capture session"
```

---

### Task 7: Register `remember` and `update` in CLI

**Files:**

- Modify: `src/cli.ts`

- [ ] **Step 1: Add imports and register commands**

Add imports near the top of `src/cli.ts`:

```typescript
import { remember } from './commands/remember';
import type { RememberOptions } from './commands/remember';
import { updateMemoryCommand } from './commands/update-memory';
```

Add `remember` command registration (after `capture`, before `write`):

```typescript
// memo remember command
program
  .command('remember')
  .description('Memorize structured knowledge mid-session (no LLM extraction)')
  .requiredOption('--name <slug>', 'Memory name in kebab-case')
  .requiredOption('--description <text>', 'One-line summary')
  .requiredOption('--content <markdown>', 'Markdown body')
  .option('--type <type>', 'Memory type (lesson|decision|workflow|architecture)', 'lesson')
  .option('--tags <csv>', 'Comma-separated tags')
  .option('--code-refs <csv>', 'Comma-separated code refs (e.g. src/core/store.ts::writePending)')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (options: RememberOptions & { codeRefs?: string }) => {
    try {
      await remember({ ...options, codeRefs: options.codeRefs });
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });
```

Add `update` command registration (after `remember`):

```typescript
// memo update command
program
  .command('update')
  .description('Update the body of an existing memory by name')
  .requiredOption('--name <slug>', 'Memory name to update')
  .requiredOption('--content <markdown>', 'New markdown body')
  .option('--repo <path>', 'Memobank repository path')
  .action(async (options: { name: string; content: string; repo?: string }) => {
    try {
      await updateMemoryCommand(options);
      console.log(`✓ Updated: ${options.name}`);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });
```

Also register `--hook-input` on the existing `recall` command. Find the `.command('recall <query>')` block and add:

```typescript
.option('--hook-input', 'Read query from stdin JSON (Claude Code UserPromptSubmit hook)')
```

And pass `hookInput: options.hookInput` in the options object.

- [ ] **Step 2: Typecheck and build**

```
npm run typecheck && npm run build
```

Expected: no errors; `dist/cli.js` updated

- [ ] **Step 3: Smoke test**

```
node dist/cli.js remember --help
node dist/cli.js update --help
```

Expected: help text shows all flags

- [ ] **Step 4: Run full test suite**

```
npm test
```

Expected: all tests pass; coverage thresholds met

- [ ] **Step 5: Final commit**

```
git add src/cli.ts
git commit -m "feat(cli): register memo remember, memo update, and recall --hook-input commands"
```

---

## Verification Checklist

Before marking this plan complete:

- [ ] `npm run typecheck` — no errors
- [ ] `npm run lint` — no errors
- [ ] `npm test` — all tests pass
- [ ] `node dist/cli.js remember --help` — shows correct flags
- [ ] `node dist/cli.js update --help` — shows correct flags
- [ ] `node dist/cli.js recall --help` — shows `--hook-input` flag
- [ ] `memo install --claude-code` (on a test project) — `settings.json` contains both Stop and UserPromptSubmit hooks
