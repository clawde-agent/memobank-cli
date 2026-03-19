# Memobank CLI: Team Sharing, Security, and UX Improvements

**Date**: 2026-03-19
**Status**: Draft
**Priority**: C (Team Sharing) > D (Security) > B (Ongoing Usage) > A (Onboarding)

---

## Overview

This spec covers four improvements to memobank-cli:

1. **Git-native team memory sharing** — personal/team two-layer storage synced via Git remote
2. **Secret leak prevention** — Git pre-commit hook + enhanced sanitizer rules
3. **Recall quality + cross-platform auto-capture** — score explanations + platform adapter hooks
4. **Simplified interactive onboarding** — single `memo init` command with TUI multi-select

The project is designed as a cross-platform tool (Claude Code, Codex, Gemini, Qwen, Cursor), with Claude Code as the primary reference implementation.

---

## Section 1: Git-Native Team Memory Architecture

### Directory Structure

```
~/.memobank/<project>/
├── personal/          # Local only, never synced to team remote
│   ├── lesson/
│   ├── decision/
│   ├── workflow/
│   ├── architecture/
│   └── meta/
├── team/              # Git-tracked, synced to shared remote
│   ├── lesson/
│   ├── decision/
│   ├── workflow/
│   ├── architecture/
│   └── meta/
└── meta/
    └── config.yaml    # Gains a `team:` section
```

Existing memories (currently at root level) are migrated to `personal/` automatically during `memo init` (with a confirmation prompt before moving files). No separate `memo migrate` command is needed.

`memo team init` also checks whether `personal/` exists. If it does not (i.e., the user has an older memobank install that predates this spec), `memo team init` triggers the same migration with a confirmation prompt before proceeding to set up the team remote.

**Partial migration case**: If `personal/` already exists alongside remaining root-level memory files (e.g., from a previous interrupted migration), `memo init` and `memo team init` both move only the root-level files that do not already exist in `personal/`. If a file with the same name already exists in `personal/`, the root-level file is left in place and a warning is printed listing the skipped files for the user to resolve manually. No silent overwrites.

### Config Changes

```yaml
team:
  remote: "git@github.com:your-org/team-memories.git"
  auto_sync: false    # If true, git pull on team/ before each recall (pull only, never auto-push)
  branch: main
```

`auto_sync: true` only pulls before `memo recall`. It never auto-pushes — pushes always require explicit `memo team sync` to avoid unintended secret exposure.

### New Commands

| Command | Description |
|---------|-------------|
| `memo team init <remote-url>` | Clone remote into `team/` (or init + push if remote is empty), write config, install pre-commit hook |
| `memo team sync` | On `team/`: (1) `git pull` — merge conflicts → user resolves manually; (2) `git add -A` to stage all tracked modifications and new files in `team/`; (3) if anything is staged, `git commit` with auto-message `"chore: sync memories [memo team sync]"`; (4) `git push`. Untracked files outside the `team/` directory are never touched. If there is nothing to commit, step 3 is skipped. |
| `memo team publish <file>` | Run `memo scan` on the file; if secrets found, print warnings and abort — user must fix manually or run `memo scan --fix` first. If clean, copy to `team/` and `git add` (does not commit automatically). |
| `memo team status` | Show `team/` git status (ahead/behind/conflicts) |

### Recall Behavior

`memo recall <query>` searches both `personal/` and `team/` by default. Results are labeled with their source:
- `👤 personal` — from personal memory
- `👥 team` — from team memory

Scope can be limited with `--scope personal` or `--scope team`. When a scope filter is active, the source label (`👤 personal` / `👥 team`) is omitted from results as redundant.

### Conflict Handling

When `memo team sync` encounters a merge conflict, it does not attempt auto-resolution. It prints the conflicting file paths and instructs the user to resolve with standard git tools, then re-run `memo team sync`. This keeps behavior consistent with `git pull` and avoids introducing extra complexity.

---

## Section 2: Secret Leak Prevention

### Problem

The existing `sanitizer.ts` runs during `memo write` and `memo capture`, but:
- Users can bypass it by editing `.md` files directly
- `memo team sync` does not verify content before pushing
- Regex patterns miss semantic secrets (e.g., `password is abc123`)

### Two Layers of Defense

**Layer 1: Git pre-commit hook (primary)**

`memo team init` automatically installs a pre-commit hook in the `team/` Git repository:

```bash
#!/bin/sh
memo scan --staged --fail-on-secrets
```

This blocks any commit that contains detected secrets, regardless of how the file was created.

**Layer 2: Enhanced sanitizer patterns**

Additions to `src/core/sanitizer.ts`:

- Semantic patterns: `password\s*(is|=|:)\s*\S+`, `secret\s*(is|=|:)\s*\S+`, `token\s*(is|=|:)\s*\S+`
- Chinese-language patterns: `密码[是为：:]\s*\S+`, `密钥[是为：:]\s*\S+`
- Private IP ranges (full octet patterns to avoid false positives on version numbers/dates): `\b192\.168\.\d{1,3}\.\d{1,3}\b`, `\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b`, `\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b`

### New Command: `memo scan`

```
memo scan [path]              # Scan given path (default: team/ under current repo)
memo scan --staged            # Scan git-staged files in the repo at cwd (used by pre-commit hook)
memo scan --fail-on-secrets   # Exit with code 1 if secrets found (used by pre-commit hook)
memo scan --fix               # Auto-redact detectable secrets in-place, then re-stage affected files
```

`memo scan` path resolution:
- **Pre-commit hook context**: The hook lives at `team/.git/hooks/pre-commit`. Git sets cwd to the repository root (`team/`) when invoking hooks. So `memo scan --staged` reads the staging area of the `team/` git repo directly — no path ambiguity.
- **Manual invocation**: `memo scan` (no path) looks up the memobank config directory (same resolution as all other memo commands: walks up from cwd or uses `MEMOBANK_REPO` env var), then scans the `team/` subdirectory within it. The user should run `memo scan` from their project directory, not from inside `team/`.

`--fix` behavior: modifies files in-place using the sanitizer (replaces detected secrets with `[REDACTED]`), then runs `git add` on each modified file so they are re-staged with clean content. Prints a summary of redactions made.

Output format:
```
⚠️  Potential secrets found:
  team/lesson/2026-03-19-db-setup.md:12
    > password is myS3cr3t!
  → Run: memo scan --fix to auto-redact and re-stage
```

---

## Section 3: Recall Quality + Cross-Platform Auto-Capture

### Recall Quality: `--explain` Flag

```
memo recall "redis timeout" --explain
```

Each result shows its score breakdown. The scoring components are defined in the existing `src/core/retriever.ts` and `src/engines/text-engine.ts`:

- **keyword**: weighted keyword match score (0–1), from `text-engine.ts` field weights (name×1.0, tags×0.9, description×0.8, content×0.5)
- **recency**: Weibull decay score (0–1) from `src/core/decay-engine.ts` — decays over ~90-day half-life
- **tags**: tag-match sub-score when tags overlap with query tokens (0–1)

The `--explain` flag reads the intermediate score components already computed by the retriever and formats them. No new scoring logic is added.

```
[score: 0.82 | 👥 team] Redis Connection Pooling
  matched: keyword(0.6) + tags(0.9) + recency(0.7)
  > Use connection pool size ≥ 10 for high-concurrency services...

[score: 0.61 | 👤 personal] Database Retry Logic
  matched: keyword(0.5) + recency(0.8)
  > ...
```

Results include a feedback hint at the bottom (the existing `memo correct` command, already in the codebase):
```
To flag a result: memo correct <file> --reason "not relevant"
```

### Cross-Platform Auto-Capture

The project already has `src/platforms/` with adapters for Claude Code, Cursor, and Codex. This extends the pattern to cover all supported platforms.

#### Platform Hook Mechanism

| Platform | Hook Mechanism | Install Location |
|----------|---------------|------------------|
| Claude Code | `hooks.Stop` in `settings.json` | `~/.claude/settings.json` |
| Codex | Post-session protocol in `AGENTS.md` | Project `AGENTS.md` |
| Gemini CLI | Instruction appended to `GEMINI.md` | `~/.gemini/GEMINI.md` or project-level |
| Qwen Code | Instruction appended to `QWEN.md` | `~/.qwen/QWEN.md` or project-level |
| Cursor | `.cursor/rules/memobank.mdc` | Project root (existing) |

For platforms without native hook support (Gemini, Qwen), the agent's system prompt file is injected with an instruction: "At the end of each session, run `memo capture --auto --silent`". These platforms rely on agent self-execution.

#### `memo install --platform` Command

```
memo install --platform claude-code   # Install Stop hook (primary implementation)
memo install --platform codex         # Write AGENTS.md protocol
memo install --platform gemini        # Inject GEMINI.md instruction
memo install --platform qwen          # Inject QWEN.md instruction
memo install --platform all           # Detect and install all found platforms
```

#### `--silent` Mode for `memo capture`

`memo capture --auto --silent` runs without any terminal output. Capture activity is logged to the top-level `~/.memobank/<project>/meta/capture-log.json` (same directory as `config.yaml`) and is visible via `memo map`.

---

## Section 4: Simplified Interactive Onboarding

### Single Entry Point

```
memo init
```

`memo onboarding` and `memo setup` become aliases for `memo init`. `memo install` is **not** merged into `memo init` — it retains its own identity as a lower-level command used programmatically and via `memo install --platform <x>` (see Section 3). `memo init` calls `memo install` internally but users interact with `memo init` for onboarding.

### 4-Step TUI Flow

The onboarding wizard uses Ink + `ink-select-input` (already in the project) for all interactions. Already-configured items are skipped automatically on re-runs.

**Step 1 — Project name** (text input, defaults to git repo name)
```
? Project name: my-awesome-project ✓
```

**Step 2 — Platform selection** (multi-select with Space + Enter; auto-detects installed tools and pre-checks them)
```
? Select platforms to integrate:  (Space to toggle, Enter to confirm)

  ◉ Claude Code     ✓ detected
  ◉ Codex           ✓ detected
  ◯ Gemini CLI      not found
  ◯ Qwen Code       not found
  ◯ Cursor          not found
```

**Step 3 — Team repository** (text input, Enter to skip)
```
? Team memory repo (optional, Enter to skip):
  > git@github.com:your-org/team-memories.git
```

**Step 4 — Search engine** (single-select)
```
? Search engine:
  ◉ Text (recommended, zero setup)
  ○ Vector / LanceDB (better recall, requires Ollama or OpenAI)
```

**Completion summary**
```
✓ memobank initialized!
  Personal memories: ~/.memobank/my-awesome-project/personal/
  Platforms: Claude Code, Codex
  Team repo: linked
  Run: memo recall "anything" to test
```

### Platform Auto-Detection Logic

Detection is done by checking for known config files or binaries:

| Platform | Detection Method |
|----------|-----------------|
| Claude Code | `~/.claude/settings.json` exists |
| Codex | `codex` binary in PATH |
| Gemini CLI | `~/.gemini/` directory exists or `gemini` in PATH |
| Qwen Code | `~/.qwen/` directory exists or `qwen` in PATH |
| Cursor | `.cursor/` directory in project root |

---

## Data Flow Summary

```
memo init
  └─ detect platforms → multi-select TUI
  └─ configure personal/ + team/ directories
  └─ install platform hooks (claude-code, codex, gemini, qwen, cursor)
  └─ install git pre-commit hook in team/ (if team remote given)

[daily usage]
  └─ agent session ends
      └─ hook fires: memo capture --auto --silent
          └─ smart-extractor extracts learnings → personal/
  └─ memo recall <query>
      └─ searches personal/ + team/
      └─ (--explain) shows score breakdown
  └─ memo team sync
      └─ git pull team/ (merge conflicts → user resolves manually)
      └─ git commit (staged changes, if any) → pre-commit hook fires: memo scan --staged --fail-on-secrets
         └─ secrets found → commit blocked, user runs memo scan --fix then retries sync
         └─ clean → commit succeeds → git push team/
```

---

## Out of Scope

- Encrypted at-rest storage (violates Git-native human-readable design principle)
- Fine-grained per-memory access control
- Cloud/S3 sync (user chose Git-native approach)
- Web UI

---

## Resolved Decisions

1. **Migration trigger**: `memo init` automatically migrates existing root-level memories to `personal/` with a confirmation prompt. No `memo migrate` command needed.
2. **`auto_sync` scope**: Pull-only before `memo recall`. Never auto-pushes, to keep secret exposure risk under explicit user control.
3. **`memo team init` with empty remote**: If the remote has no commits, `memo team init` runs `git init` inside `team/`, sets the remote, creates `.gitkeep` files in each of `team/lesson/`, `team/decision/`, `team/workflow/`, `team/architecture/`, and `team/meta/`, stages them, commits with message "chore: initialize team memory repo", and pushes. If the remote has commits, it clones normally into `team/`.
4. **`memo install` vs `memo init`**: `memo install` stays as a separate low-level command. `memo init` is the user-facing onboarding entry point that calls `memo install` internally.
