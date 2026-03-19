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

Existing memories (currently at root level) are migrated to `personal/` during `memo init` or when running `memo team init` on an existing install.

### Config Changes

```yaml
team:
  remote: "git@github.com:your-org/team-memories.git"
  auto_sync: false    # If true, pull before each recall
  branch: main
```

### New Commands

| Command | Description |
|---------|-------------|
| `memo team init <remote-url>` | Clone remote into `team/`, write config |
| `memo team sync` | `git pull` + `git push` on `team/` directory |
| `memo team publish <file>` | Copy a personal memory into `team/`, run sanitizer, stage for commit |
| `memo team status` | Show `team/` git status (ahead/behind/conflicts) |

### Recall Behavior

`memo recall <query>` searches both `personal/` and `team/` by default. Results are labeled with their source:
- `👤 personal` — from personal memory
- `👥 team` — from team memory

Scope can be limited with `--scope personal` or `--scope team`.

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
- Private IP ranges: `192\.168\.`, `10\.`, `172\.(1[6-9]|2\d|3[01])\.`

### New Command: `memo scan`

```
memo scan [path]              # Scan given path (default: current memory repo)
memo scan --staged            # Scan only git-staged files
memo scan --fail-on-secrets   # Exit with code 1 if secrets found
memo scan --fix               # Auto-redact detectable secrets via sanitizer
```

Output format:
```
⚠️  Potential secrets found:
  team/lesson/2026-03-19-db-setup.md:12
    > password is myS3cr3t!
  → Run: memo scan --fix to auto-redact
```

---

## Section 3: Recall Quality + Cross-Platform Auto-Capture

### Recall Quality: `--explain` Flag

```
memo recall "redis timeout" --explain
```

Each result shows its score breakdown:

```
[score: 0.82 | 👥 team] Redis Connection Pooling
  matched: tags(redis=0.9) + keyword(timeout=0.6) + recency(0.7)
  > Use connection pool size ≥ 10 for high-concurrency services...

[score: 0.61 | 👤 personal] Database Retry Logic
  matched: keyword(redis=0.5) + recency(0.8)
  > ...
```

Results include a feedback hint at the bottom:
```
Rate results: memo correct <file> --reason "not relevant"
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

`memo capture --auto --silent` runs without any terminal output. Capture activity is logged to `meta/capture-log.json` and is visible via `memo map`.

---

## Section 4: Simplified Interactive Onboarding

### Single Entry Point

```
memo init
```

`memo onboarding`, `memo install`, and `memo setup` are consolidated under `memo init`. Old commands are kept as aliases for backwards compatibility.

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
      └─ pre-commit hook: memo scan --staged --fail-on-secrets
      └─ git pull + push team/
```

---

## Out of Scope

- Encrypted at-rest storage (violates Git-native human-readable design principle)
- Fine-grained per-memory access control
- Cloud/S3 sync (user chose Git-native approach)
- Web UI

---

## Open Questions

1. When migrating existing memories to `personal/` during `memo team init`, should the migration be automatic (with a confirmation prompt) or require an explicit `memo migrate` command?
2. Should `auto_sync: true` also push after `memo capture`, or only pull before `memo recall`?
