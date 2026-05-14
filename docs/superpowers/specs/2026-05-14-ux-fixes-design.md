# UX Fixes Design

> **Status:** Draft
> **Date:** 2026-05-14
> **Scope:** 8 fixes — hook config, CLI silent mode, write template cleanup, memo init quick mode, slash commands, CLAUDE.md rules, memobank config, skill docs

---

## 1. Stop Hook — Add `timeout`, `async`, `statusMessage`

**Problem:** The Stop hook installed by `memo install` is missing `timeout`, `async`, and `statusMessage`. If the hook hangs, Claude Code cannot exit. Users see no feedback while memories are being saved.

**Fix location:** `src/platforms/claude-code.ts`

**Change:** Extend the hook object written to `~/.claude/settings.json`:

```typescript
{
  type: 'command',
  command: 'memo process-queue --background',
  timeout: 5000,
  async: true,
  statusMessage: 'Saving memories...'
}
```

**Notes:**

- `--background` already spawns a detached child and returns immediately; `async: true` makes the hook non-blocking at the Claude Code level as well
- `timeout: 5000` caps the hook at 5 s — well above the detached-spawn time
- Existing installs must re-run `memo install` to pick up the new fields

---

## 2. `recall` / `write` — `--silent` Flag + Replace `process.exit` with `throw`

**Problem:**

- `recall` and `write` have no way to suppress stdout in automated (hook) contexts
- `recall` calls `process.exit(1)` on validation errors, which breaks the Claude Code Stop hook chain

**Fix locations:** `src/commands/recall.ts`, `src/commands/write.ts`, `src/cli.ts`

### `recall.ts`

- Add `silent?: boolean` to `RecallOptions`
- Replace every `console.error(msg); process.exit(1)` with `throw new Error(msg)`
- Gate `console.log(markdown)` on `!options.silent`
- `writeRecallResults()` still executes even in silent mode (side-effect must happen)

### `write.ts`

- Add `silent?: boolean` to `WriteOptions`
- Gate success confirmation `console.log` on `!options.silent`

### `cli.ts`

- Add `.option('--silent', 'Suppress stdout output')` to both `recall` and `write` commands
- Pass `silent` through to the command handler
- The existing top-level `catch` already logs errors via `console.error` — no change needed there

---

## 3. `memo write` — Remove SECURITY CHECKLIST

**Problem:** The editor template includes a 7-line SECURITY CHECKLIST that users must delete manually every time. The pre-editor `console.log` security warnings repeat the same information. Both create alert fatigue. The sanitizer already handles secret redaction automatically.

**Fix location:** `src/commands/write.ts`

**Changes:**

1. Delete the `# SECURITY CHECKLIST` block from `getTemplate()` (lines ~51–59)
2. Delete the 4-line `console.log` security warning block before editor launch (lines ~157–161)
3. Delete the `line.startsWith('# SECURITY CHECKLIST')` filter in `parseTemplate()` — no longer needed

**Result:** Editor opens directly with the clean memory template. Sanitizer continues to run silently on every write.

---

## 4. `memo init` — Mixed Mode (Quick Default + `--interactive` Flag)

**Problem:** `memo init` currently launches a 13-step TUI immediately. Advanced options (embedding provider, Ollama URL, reranker) appear before the user has any context for why they matter. Most users need only: project name + platform hooks installed.

**Design:**

### Default (non-interactive)

```bash
memo init                          # auto-detect everything, install all found platforms
memo init --platform claude-code   # install specific platform(s) only
```

Execution sequence:

1. `detectProjectName()` — git remote → `config.project.name` → `path.basename(cwd)` (existing logic, reused)
2. `detectPlatforms()` — scan installed tools (existing logic, reused)
3. If `--platform` provided, filter to specified platforms; otherwise use all detected
4. `initConfig()` — write `.memobank/config.yaml` with defaults (existing)
5. For each platform: call the matching `install*()` function
6. Print one-line summary: `✓ memobank initialized (project: my-app, platforms: claude-code)`

### Interactive (full TUI)

```bash
memo init --interactive   # launches existing 13-step onboarding wizard unchanged
```

No changes to `src/commands/onboarding.tsx`.

### Platform detection reuse

`detectPlatforms()` currently lives inside `src/commands/onboarding.tsx`. Extract it (and `detectProjectName()`) to `src/core/platform-detector.ts` so both `init.ts` and `onboarding.tsx` can import it without circular dependencies. No behaviour change.

### New file: `src/commands/init.ts` (~60 lines)

```typescript
export async function quickInit(options: { platform?: string }): Promise<void> {
  const projectName = detectProjectName();
  const repoRoot = findGitRoot(process.cwd()) ?? process.cwd();
  initConfig(repoRoot, projectName);

  const allPlatforms = detectPlatforms();
  const targets = options.platform
    ? options.platform.split(',').map((s) => s.trim())
    : allPlatforms.filter((p) => !p.disabled).map((p) => p.value);

  const installed: string[] = [];
  for (const p of targets) {
    if (p === 'claude-code') {
      await installClaudeCode(repoRoot);
      installed.push(p);
    }
    if (p === 'cursor') {
      await installCursor(repoRoot);
      installed.push(p);
    }
    if (p === 'codex') {
      await installCodex(repoRoot);
      installed.push(p);
    }
    if (p === 'gemini') {
      await installGemini(repoRoot);
      installed.push(p);
    }
    if (p === 'qwen') {
      await installQwen(repoRoot);
      installed.push(p);
    }
  }

  const platformList = installed.length ? installed.join(', ') : 'none';
  console.log(`✓ memobank initialized (project: ${projectName}, platforms: ${platformList})`);
  if (!installed.length) {
    console.log('  Run memo init --interactive to configure platforms manually.');
  }
}
```

### `cli.ts` change

Replace the current `init` command action with:

```typescript
.option('--interactive', 'Run interactive setup wizard')
.option('--platform <platforms>', 'Comma-separated platforms (e.g. claude-code,cursor)')
.action(async (options) => {
  if (options.interactive) {
    const { runOnboarding } = await import('./commands/onboarding');
    await runOnboarding();
  } else {
    const { quickInit } = await import('./commands/init');
    await quickInit({ platform: options.platform });
  }
})
```

---

## 5. `.claude/commands/` — Project Slash Commands

**Problem:** memobank has no Claude Code slash commands. Developers working in this repo must type full `memo recall` / `memo capture` commands manually.

**New files:**

### `.claude/commands/recall.md`

```markdown
---
name: recall
description: Search memobank memories for the current query
argument-hint: [query]
allowed-tools: Bash
---

Run: `memo recall "$ARGUMENTS" --code`

Then read MEMORY.md and use the recalled context to inform your next response.
```

### `.claude/commands/capture.md`

```markdown
---
name: capture
description: Capture a lesson or decision to memobank memory
argument-hint: [type] [name] e.g. lesson auth-fix
allowed-tools: Bash
---

Run: `memo write $ARGUMENTS`
```

---

## 6. CLAUDE.md — Add Workflow Rules

**Problem:** Current CLAUDE.md is purely structural documentation. No behaviour constraints for Claude working in this repo.

**Additions** (append to existing CLAUDE.md, ~15 lines):

```markdown
## Workflow Rules

- After fixing a non-obvious bug, run `memo write lesson` to capture it
- Run `npm run typecheck && npm run lint` before claiming a task complete
- Do not modify `dist/` directly — always build via `npm run build`
- When adding a new CLI command, register it in `src/cli.ts` and add a test file in `tests/`
- Do not add `console.log` debugging statements to production code paths
```

---

## 7. Fix Project `.memobank/config.yaml`

**Problem:** The project's own `.memobank/config.yaml` does not exist. The last recall used `lancedb` engine (which requires optional deps) and returned 0 results. The project isn't using its own tool effectively.

**Fix:** Create `.memobank/config.yaml` with text engine defaults:

```yaml
project:
  name: memobank-cli

memory:
  top_k: 5
  token_budget: 4000

embedding:
  engine: text
```

**Result:** `memo recall` works out of the box with zero dependencies, consistent with the project's own "text engine is zero-dependency default" principle.

---

## 8. Update memobank Skill Docs

**Problem:** The memobank skill (`~/.claude/skills/memobank/SKILL.md`) describes `memo init` as a "4-step interactive TUI". After Fix 4, the default is non-interactive.

**Fix:** Update the relevant section in the skill to reflect:

- Default: `memo init` (non-interactive, auto-detects everything)
- Full setup: `memo init --interactive`

**Location:** Find and update in the installed skill file and the source template used by `memo install`.

---

## Testing

| Fix                                | Test                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Hook fields                        | Check installed `~/.claude/settings.json` after `memo install` — verify `timeout`, `async`, `statusMessage` present |
| `--silent`                         | `memo recall "query" --silent` → no stdout, MEMORY.md updated                                                       |
| `throw` not `exit`                 | Pass invalid query to recall in a script → script continues, exit code 0                                            |
| No checklist                       | `memo write lesson --name=x --description=y` in editor → no SECURITY section visible                                |
| `memo init` quick                  | Run in a git repo → one-line output, config written, hook installed                                                 |
| `memo init --interactive`          | Launches existing TUI unchanged                                                                                     |
| `memo init --platform claude-code` | Only installs Claude Code hook                                                                                      |
| Slash commands                     | `/recall query` in Claude Code → runs `memo recall "query" --code`, reads MEMORY.md                                 |
| SessionStart hook                  | New session → MEMORY.md updated within 10 s, no stdout                                                              |
| Empty query recall                 | `memo recall ""` → returns top-5 by score, no error                                                                 |
| `.memobank/config.yaml`            | `memo recall "test"` works without lancedb installed                                                                |

---

## What Is NOT Changed

- `src/commands/onboarding.tsx` — untouched
- `src/core/sanitizer.ts` — continues to run on all writes
- `memo process-queue` logic — untouched
- Any test files unless directly testing changed behaviour
