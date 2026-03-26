# M1 Phase 2: Triggers + Smart Dedup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `memo process-queue` CLI command, Claude Code Stop hook, and two-stage semantic deduplication to replace the current name-exact-match check.

**Architecture:** `dedup.ts` provides a pure `deduplicate()` function (Jaccard Stage 1 + optional LLM Stage 2). `queue-processor.ts` calls it instead of the current `existingNames.has()` check. `process-queue.ts` exposes the command with a `--background` flag that spawns a detached child process. `claude-code.ts` is updated to write the Stop hook on install.

**Tech Stack:** Node.js, TypeScript (strict), Jest (`NODE_OPTIONS=--experimental-vm-modules npx jest`), Commander CLI, `child_process.spawn`.

---

## Chunk 1: dedup.ts + queue-processor.ts

### Task 1: `src/core/dedup.ts` — Jaccard + two-stage deduplicate

**Files:**

- Create: `src/core/dedup.ts`
- Create: `tests/dedup.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/dedup.test.ts
import { deduplicate } from '../src/core/dedup';
import type { PendingCandidate } from '../src/core/store';
import type { MemoryFile } from '../src/types';

function makeCandidate(name: string, description: string): PendingCandidate {
  return { name, type: 'lesson', description, tags: [], confidence: 'high', content: 'body' };
}

function makeMemory(name: string, description: string): MemoryFile {
  return {
    name,
    type: 'lesson',
    description,
    tags: [],
    confidence: 'high',
    status: 'active',
    content: 'body',
    path: '/fake/path.md',
    created: '2026-01-01',
  };
}

describe('deduplicate — Stage 1 (no LLM)', () => {
  it('skips candidate whose name exactly matches an existing memory', async () => {
    const c = makeCandidate('api-timeout', 'handle api timeout errors');
    const e = makeMemory('api-timeout', 'different description');
    const result = await deduplicate([c], [e]);
    expect(result.toWrite).toHaveLength(0);
    expect(result.toSkip).toHaveLength(1);
  });

  it('skips candidate with Jaccard >= 0.8 on name+description', async () => {
    const c = makeCandidate('api-timeout-handling', 'handle api timeout errors in requests');
    const e = makeMemory('api-timeout-handler', 'handle api timeout errors in requests');
    const result = await deduplicate([c], [e]);
    expect(result.toSkip).toHaveLength(1);
  });

  it('writes candidate with Jaccard < 0.4 (clearly different)', async () => {
    const c = makeCandidate('pnpm-setup', 'use pnpm instead of npm for package management');
    const e = makeMemory('api-timeout', 'handle api timeout errors in requests');
    const result = await deduplicate([c], [e]);
    expect(result.toWrite).toHaveLength(1);
    expect(result.toSkip).toHaveLength(0);
  });

  it('writes ambiguous candidate (0.4–0.8) when no LLM provided (KEEP_BOTH)', async () => {
    // Moderately similar but not identical
    const c = makeCandidate('api-retry-logic', 'retry failed api calls with backoff');
    const e = makeMemory('api-timeout-handling', 'handle api timeout with retry backoff');
    const result = await deduplicate([c], [e]);
    expect(result.toWrite).toHaveLength(1); // KEEP_BOTH degradation
  });

  it('writes candidate when there are no existing memories', async () => {
    const c = makeCandidate('new-lesson', 'something new');
    const result = await deduplicate([c], []);
    expect(result.toWrite).toHaveLength(1);
  });
});

describe('deduplicate — Stage 2 (with LLM)', () => {
  it('skips ambiguous candidate when LLM returns DUPLICATE', async () => {
    const c = makeCandidate('api-retry-logic', 'retry failed api calls with backoff');
    const e = makeMemory('api-timeout-handling', 'handle api timeout with retry backoff');
    const mockLLM = jest.fn().mockResolvedValue(['DUPLICATE']);
    const result = await deduplicate([c], [e], mockLLM);
    expect(result.toSkip).toHaveLength(1);
    expect(mockLLM).toHaveBeenCalledTimes(1);
  });

  it('writes ambiguous candidate when LLM returns KEEP_BOTH', async () => {
    const c = makeCandidate('api-retry-logic', 'retry failed api calls with backoff');
    const e = makeMemory('api-timeout-handling', 'handle api timeout with retry backoff');
    const mockLLM = jest.fn().mockResolvedValue(['KEEP_BOTH']);
    const result = await deduplicate([c], [e], mockLLM);
    expect(result.toWrite).toHaveLength(1);
  });

  it('treats ambiguous as KEEP_BOTH when LLM throws, Stage 1 writes unaffected', async () => {
    // Two candidates: one ambiguous (0.4–0.8), one clearly new (< 0.4)
    const ambiguous = makeCandidate('api-retry-logic', 'retry failed api calls with backoff');
    const clearlyNew = makeCandidate('pnpm-setup', 'use pnpm instead of npm');
    const e = makeMemory('api-timeout-handling', 'handle api timeout with retry backoff');
    const mockLLM = jest.fn().mockRejectedValue(new Error('LLM unavailable'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await deduplicate([ambiguous, clearlyNew], [e], mockLLM);
    // Both should be written: ambiguous as KEEP_BOTH, clearlyNew from Stage 1
    expect(result.toWrite).toHaveLength(2);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Stage 2'));
    warnSpy.mockRestore();
  });

  it('does NOT call LLM when all candidates are resolved in Stage 1', async () => {
    const c = makeCandidate('api-timeout', 'exact match');
    const e = makeMemory('api-timeout', 'exact match');
    const mockLLM = jest.fn();
    await deduplicate([c], [e], mockLLM);
    expect(mockLLM).not.toHaveBeenCalled();
  });

  it('sends all ambiguous pairs in a single LLM call', async () => {
    const existing = [
      makeMemory('api-timeout-handling', 'handle api timeout with retry backoff'),
      makeMemory('db-connection-pool', 'manage database connection pools'),
    ];
    const candidates = [
      makeCandidate('api-retry-logic', 'retry failed api calls with backoff'),
      makeCandidate('db-pool-management', 'configure database connection pools'),
    ];
    const mockLLM = jest.fn().mockResolvedValue(['KEEP_BOTH', 'DUPLICATE']);
    const result = await deduplicate(candidates, existing, mockLLM);
    expect(mockLLM).toHaveBeenCalledTimes(1);
    expect(mockLLM).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ candidate: candidates[0] }),
        expect.objectContaining({ candidate: candidates[1] }),
      ])
    );
    expect(result.toWrite).toHaveLength(1);
    expect(result.toSkip).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/dedup.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../src/core/dedup'`

- [ ] **Step 3: Implement `src/core/dedup.ts`**

```typescript
import type { PendingCandidate } from './store';
import type { MemoryFile } from '../types';

export type DedupLLM = (
  pairs: Array<{ candidate: PendingCandidate; existing: MemoryFile }>
) => Promise<Array<'DUPLICATE' | 'KEEP_BOTH'>>;

export async function deduplicate(
  candidates: PendingCandidate[],
  existing: MemoryFile[],
  llm?: DedupLLM
): Promise<{ toWrite: PendingCandidate[]; toSkip: PendingCandidate[] }> {
  const toWrite: PendingCandidate[] = [];
  const toSkip: PendingCandidate[] = [];
  const ambiguous: Array<{ candidate: PendingCandidate; existing: MemoryFile }> = [];

  for (const candidate of candidates) {
    // Stage 1: exact name match
    if (existing.some((e) => e.name === candidate.name)) {
      toSkip.push(candidate);
      continue;
    }

    // Stage 1: Jaccard on name + description
    const candidateText = `${candidate.name} ${candidate.description}`;
    let maxScore = 0;
    let closestExisting: MemoryFile | undefined;

    for (const e of existing) {
      const score = jaccard(candidateText, `${e.name} ${e.description}`);
      if (score > maxScore) {
        maxScore = score;
        closestExisting = e;
      }
    }

    if (maxScore >= 0.8) {
      toSkip.push(candidate);
    } else if (maxScore >= 0.4 && closestExisting) {
      ambiguous.push({ candidate, existing: closestExisting });
    } else {
      toWrite.push(candidate);
    }
  }

  // Stage 2: LLM for ambiguous pairs
  if (ambiguous.length > 0) {
    if (llm) {
      try {
        const decisions = await llm(ambiguous);
        for (let i = 0; i < ambiguous.length; i++) {
          if (decisions[i] === 'DUPLICATE') {
            toSkip.push(ambiguous[i]!.candidate);
          } else {
            toWrite.push(ambiguous[i]!.candidate);
          }
        }
      } catch (err) {
        console.warn(
          `Stage 2 dedup LLM failed: ${(err as Error).message} — treating ambiguous as KEEP_BOTH`
        );
        for (const { candidate } of ambiguous) {
          toWrite.push(candidate);
        }
      }
    } else {
      // No LLM configured — KEEP_BOTH
      for (const { candidate } of ambiguous) {
        toWrite.push(candidate);
      }
    }
  }

  return { toWrite, toSkip };
}

function jaccard(a: string, b: string): number {
  const tokA = new Set(tokenize(a));
  const tokB = new Set(tokenize(b));
  const intersection = [...tokA].filter((t) => tokB.has(t)).length;
  const union = new Set([...tokA, ...tokB]).size;
  return union === 0 ? 0 : intersection / union;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}
```

- [ ] **Step 4: Run tests to verify passing**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/dedup.test.ts --no-coverage
```

Expected: All tests PASS

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/core/dedup.ts tests/dedup.test.ts
git commit -m "feat(dedup): two-stage Jaccard + LLM deduplication"
```

---

### Task 2: Update `src/core/queue-processor.ts` — wire in `deduplicate()`

**Files:**

- Modify: `src/core/queue-processor.ts`
- Modify: `tests/queue-processor.test.ts`

- [ ] **Step 1: Write the new failing test**

Add to `tests/queue-processor.test.ts` — a new `describe` block after the existing ones:

```typescript
import { deduplicate } from '../src/core/dedup';
jest.mock('../src/core/dedup');
const mockDeduplicate = deduplicate as jest.MockedFunction<typeof deduplicate>;

describe('processQueue — dedup integration', () => {
  beforeEach(() => {
    mockDeduplicate.mockReset();
  });

  it('calls deduplicate() and writes only toWrite candidates', async () => {
    const repo = makeTempRepo();
    writePendingFile(repo, {
      id: 'LRN-dedup',
      timestamp: '2026-03-26T00:00:00.000Z',
      projectId: 'test-project',
      candidates: [
        {
          name: 'keep-this',
          type: 'lesson',
          description: 'keep',
          tags: [],
          confidence: 'high',
          content: 'body',
        },
        {
          name: 'skip-this',
          type: 'lesson',
          description: 'skip',
          tags: [],
          confidence: 'high',
          content: 'body',
        },
      ],
    });

    mockDeduplicate.mockResolvedValue({
      toWrite: [
        {
          name: 'keep-this',
          type: 'lesson',
          description: 'keep',
          tags: [],
          confidence: 'high',
          content: 'body',
        },
      ],
      toSkip: [
        {
          name: 'skip-this',
          type: 'lesson',
          description: 'skip',
          tags: [],
          confidence: 'high',
          content: 'body',
        },
      ],
    });

    await processQueue(repo);

    const lessonDir = path.join(repo, 'lesson');
    const files = fs.readdirSync(lessonDir);
    expect(files.length).toBe(1);
    const memory = loadFile(path.join(lessonDir, files[0]!));
    expect(memory.name).toBe('keep-this');
    fs.rmSync(repo, { recursive: true });
  });

  it('second pending file sees memory written by first pending file (existing[] grows)', async () => {
    const repo = makeTempRepo();
    // Two pending files: second file has same candidate name as first file
    writePendingFile(repo, {
      id: 'LRN-first',
      timestamp: '2026-03-26T00:00:00.000Z',
      projectId: 'test-project',
      candidates: [
        {
          name: 'shared-lesson',
          type: 'lesson',
          description: 'd',
          tags: [],
          confidence: 'high',
          content: 'body',
        },
      ],
    });
    writePendingFile(repo, {
      id: 'LRN-second',
      timestamp: '2026-03-26T00:00:01.000Z',
      projectId: 'test-project',
      candidates: [
        {
          name: 'shared-lesson',
          type: 'lesson',
          description: 'd',
          tags: [],
          confidence: 'high',
          content: 'body',
        },
      ],
    });

    mockDeduplicate
      .mockResolvedValueOnce({
        toWrite: [
          {
            name: 'shared-lesson',
            type: 'lesson',
            description: 'd',
            tags: [],
            confidence: 'high',
            content: 'body',
          },
        ],
        toSkip: [],
      })
      .mockResolvedValueOnce({
        toWrite: [],
        toSkip: [
          {
            name: 'shared-lesson',
            type: 'lesson',
            description: 'd',
            tags: [],
            confidence: 'high',
            content: 'body',
          },
        ],
      });

    await processQueue(repo);

    // Only one memory file should exist — second file's candidate was skipped
    const lessonDir = path.join(repo, 'lesson');
    expect(fs.readdirSync(lessonDir).length).toBe(1);
    // Second call to deduplicate must have seen shared-lesson in existing[]
    expect(mockDeduplicate).toHaveBeenCalledTimes(2);
    const secondCallExisting = mockDeduplicate.mock.calls[1]![1];
    expect(secondCallExisting.some((m: { name: string }) => m.name === 'shared-lesson')).toBe(true);
    fs.rmSync(repo, { recursive: true });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/queue-processor.test.ts --no-coverage
```

Expected: FAIL — dedup integration test fails because `processQueue` doesn't call `deduplicate()` yet

- [ ] **Step 3: Update `src/core/queue-processor.ts`**

Replace the file with:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { loadFile, writeMemory, resolveProjectId } from './store';
import { deduplicate } from './dedup';
import type { PendingEntry } from './store';
import type { MemoryFile } from '../types';

export async function processQueue(memoBankDir: string): Promise<void> {
  const pendingDir = path.join(memoBankDir, '.pending');
  if (!fs.existsSync(pendingDir)) return;

  const files = fs.readdirSync(pendingDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) return;

  const currentProjectId = resolveProjectId(memoBankDir);

  // Load all existing memories for dedup
  const existing: MemoryFile[] = [];
  for (const type of ['lesson', 'decision', 'workflow', 'architecture']) {
    const typeDir = path.join(memoBankDir, type);
    if (!fs.existsSync(typeDir)) continue;
    for (const file of fs.readdirSync(typeDir).filter((f) => f.endsWith('.md'))) {
      try {
        existing.push(loadFile(path.join(typeDir, file)));
      } catch {
        /* skip unreadable */
      }
    }
  }

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

    const { toWrite } = await deduplicate(entry.candidates, existing);
    for (const candidate of toWrite) {
      const created = new Date().toISOString();
      // `created` is not in PendingCandidate — injected at write time
      writeMemory(memoBankDir, {
        ...candidate,
        created,
        project: entry.projectId,
      });
      // Add to existing so subsequent pending files see newly written memories
      existing.push({ ...candidate, path: '', created, status: 'experimental' });
    }

    fs.unlinkSync(filePath);
  }
}
```

- [ ] **Step 4: Run all tests**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/queue-processor.test.ts --no-coverage
```

Expected: All tests PASS (existing tests still pass; dedup integration test passes)

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/core/queue-processor.ts tests/queue-processor.test.ts
git commit -m "refactor(queue-processor): replace name-match with deduplicate()"
```

---

## Chunk 2: process-queue command + Stop hook

### Task 3: `memo process-queue` CLI command

**Files:**

- Create: `src/commands/process-queue.ts`
- Modify: `src/cli.ts` (add import + register command)
- Create: `tests/process-queue.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/process-queue.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as childProcess from 'child_process';
import { runProcessQueue } from '../src/commands/process-queue';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-pqcmd-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: test-project\n');
  return dir;
}

describe('runProcessQueue', () => {
  it('exits with code 0 when no pending files', async () => {
    const repo = makeTempRepo();
    await expect(runProcessQueue(repo, { background: false })).resolves.toBe(0);
    fs.rmSync(repo, { recursive: true });
  });

  it('exits with code 0 after processing pending files', async () => {
    const repo = makeTempRepo();
    const pendingDir = path.join(repo, '.pending');
    fs.mkdirSync(pendingDir);
    fs.writeFileSync(
      path.join(pendingDir, 'LRN-001.json'),
      JSON.stringify({
        id: 'LRN-001',
        timestamp: '2026-03-26T00:00:00.000Z',
        projectId: 'test-project',
        candidates: [
          {
            name: 'cmd-lesson',
            type: 'lesson',
            description: 'd',
            tags: [],
            confidence: 'high',
            content: 'body',
          },
        ],
      })
    );
    const code = await runProcessQueue(repo, { background: false });
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(repo, '.pending', 'LRN-001.json'))).toBe(false);
    fs.rmSync(repo, { recursive: true });
  });

  it('background flag: spawns detached child and returns 0 immediately', async () => {
    const repo = makeTempRepo();
    const spawnSpy = jest.spyOn(childProcess, 'spawn').mockReturnValue({
      unref: jest.fn(),
    } as unknown as childProcess.ChildProcess);

    const code = await runProcessQueue(repo, { background: true });

    expect(code).toBe(0);
    expect(spawnSpy).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining(['process-queue']),
      expect.objectContaining({ detached: true, stdio: 'ignore' })
    );
    spawnSpy.mockRestore();
    fs.rmSync(repo, { recursive: true });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/process-queue.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../src/commands/process-queue'`

- [ ] **Step 3: Implement `src/commands/process-queue.ts`**

```typescript
import * as path from 'path';
import { spawn } from 'child_process';
import { findRepoRoot } from '../core/store';
import { processQueue } from '../core/queue-processor';

export interface ProcessQueueOptions {
  background: boolean;
}

export async function runProcessQueue(
  memoBankDir: string,
  options: ProcessQueueOptions
): Promise<number> {
  if (options.background) {
    const cliPath = path.join(__dirname, '..', 'cli.js');
    const child = spawn(process.execPath, [cliPath, 'process-queue'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return 0;
  }

  try {
    await processQueue(memoBankDir);
    return 0;
  } catch (err) {
    console.error(`process-queue failed: ${(err as Error).message}`);
    return 1;
  }
}

export async function processQueueCommand(options: { background?: boolean } = {}): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());
  const code = await runProcessQueue(repoRoot, { background: options.background ?? false });
  process.exitCode = code;
}
```

- [ ] **Step 4: Register in `src/cli.ts`**

Add import after the existing imports (around line 29):

```typescript
import { processQueueCommand } from './commands/process-queue';
```

Add command registration before the final `program.parse()`:

```typescript
program
  .command('process-queue')
  .description('Process pending memory queue (write candidates to memory files)')
  .option('--background', 'Spawn as background process and return immediately')
  .action(async (options) => {
    await processQueueCommand({ background: options.background as boolean | undefined });
  });
```

- [ ] **Step 5: Run tests**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/process-queue.test.ts --no-coverage
```

Expected: All PASS

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/commands/process-queue.ts tests/process-queue.test.ts src/cli.ts
git commit -m "feat(process-queue): add memo process-queue command with --background flag"
```

---

### Task 4: Add Stop hook to `installClaudeCode()`

**Files:**

- Modify: `src/platforms/claude-code.ts`
- Modify: `tests/install.test.ts` (or create if it doesn't exist)

- [ ] **Step 1: Check for existing install tests**

```bash
ls tests/install* tests/claude-code* 2>/dev/null || echo "none"
```

- [ ] **Step 2: Write the failing test**

If `tests/install.test.ts` doesn't exist, create it. Otherwise add the describe block below to the existing file:

```typescript
// tests/install.test.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { installClaudeCode } from '../src/platforms/claude-code';

function makeTempHome(): { home: string; settingsPath: string; cleanup: () => void } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-install-'));
  const settingsPath = path.join(home, '.claude', 'settings.json');
  const origHome = process.env.HOME;
  const origUserProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  return {
    home,
    settingsPath,
    cleanup: () => {
      process.env.HOME = origHome;
      process.env.USERPROFILE = origUserProfile;
      fs.rmSync(home, { recursive: true });
    },
  };
}

describe('installClaudeCode — Stop hook', () => {
  it('writes Stop hook for memo process-queue --background', async () => {
    const { settingsPath, cleanup } = makeTempHome();
    await installClaudeCode('/fake/repo');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const stopHooks = settings.hooks?.Stop as Array<{ command: string }> | undefined;
    expect(stopHooks).toBeDefined();
    expect(stopHooks!.some((h) => h.command.includes('process-queue --background'))).toBe(true);
    cleanup();
  });

  it('merges Stop hook without removing existing hooks', async () => {
    const { settingsPath, cleanup } = makeTempHome();
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          Stop: [{ command: 'some-other-hook' }],
        },
      })
    );
    await installClaudeCode('/fake/repo');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const stopHooks = settings.hooks?.Stop as Array<{ command: string }>;
    expect(stopHooks.some((h) => h.command === 'some-other-hook')).toBe(true);
    expect(stopHooks.some((h) => h.command.includes('process-queue --background'))).toBe(true);
    cleanup();
  });

  it('does not add duplicate Stop hook if already present', async () => {
    const { settingsPath, cleanup } = makeTempHome();
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: { Stop: [{ command: 'memo process-queue --background' }] },
      })
    );
    await installClaudeCode('/fake/repo');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const stopHooks = settings.hooks?.Stop as Array<{ command: string }>;
    const count = stopHooks.filter((h) => h.command.includes('process-queue --background')).length;
    expect(count).toBe(1);
    cleanup();
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/install.test.ts --no-coverage
```

Expected: FAIL — Stop hook not written

- [ ] **Step 4: Update `src/platforms/claude-code.ts`**

After the legacy hook removal block (around line 88, before the `// Write settings` comment), add:

```typescript
// Add process-queue Stop hook (merge, no duplicates)
const STOP_HOOK = 'memo process-queue --background';
if (!settings.hooks) settings.hooks = {};
const hookMap = settings.hooks as Record<string, unknown>;
const currentStop = (hookMap.Stop as Array<{ command: string }> | undefined) ?? [];
if (!currentStop.some((h) => h.command === STOP_HOOK)) {
  hookMap.Stop = [...currentStop, { command: STOP_HOOK }];
}
```

- [ ] **Step 5: Run tests**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/install.test.ts --no-coverage
```

Expected: All PASS

- [ ] **Step 6: Run full test suite**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest --no-coverage
```

Expected: No new failures beyond the 8 pre-existing failures on `main`

- [ ] **Step 7: Typecheck + lint**

```bash
npm run typecheck && npm run lint 2>&1 | grep "error" | grep -v "warning"
```

Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add src/platforms/claude-code.ts tests/install.test.ts
git commit -m "feat(install): add memo process-queue Stop hook to Claude Code settings"
```
