# memobank

[![npm version](https://img.shields.io/npm/v/memobank-cli.svg)](https://www.npmjs.com/package/memobank-cli)
[![npm downloads](https://img.shields.io/npm/dm/memobank-cli.svg)](https://www.npmjs.com/package/memobank-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0-green.svg)](https://nodejs.org/)
[![CI](https://github.com/clawde-agent/memobank-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/clawde-agent/memobank-cli/actions/workflows/ci.yml)
[![Known Vulnerabilities](https://snyk.io/test/github/clawde-agent/memobank-cli/badge.svg?targetFile=package-lock.json)](https://app.snyk.io/org/clydeshen/project/45e3c665-aec3-466f-aa21-9a0c115d18b4)

AI agents forget everything between sessions.
Static files like CLAUDE.md go stale and require manual upkeep.
Cloud memory APIs add external services your team doesn't own or control.

**memobank gives AI agents persistent, structured memory that lives in your Git repo:**
versioned alongside code, reviewed as PRs, and loaded automatically at session start.

- **Personal** — private lessons and preferences, never committed
- **Team** — shared knowledge that travels with the codebase
- **Workspace** — cross-repo patterns, business decisions, BA/PO context, and non-code project knowledge, synced via a separate Git remote (any wiki or docs repo works)

Works with Claude Code, Cursor, Codex, Gemini CLI, and Qwen Code.
Zero external services required.

Two capabilities set memobank apart from static files and cloud APIs: **lifecycle scoring** — memories auto-promote on recall and decay when unused, so the agent's working context self-curates — and a **code-memory graph** that links code symbols to relevant memories, so `memo recall --code` searches your codebase and memory store together.

|                           | memobank                                    | CLAUDE.md | Cloud APIs | Built-in auto-memory |
| ------------------------- | ------------------------------------------- | --------- | ---------- | -------------------- |
| Accumulates over time     | ✅ lifecycle scoring                        | ❌ manual | ✅         | partial              |
| Team knowledge, versioned | ✅ committed with code                      | ✅ static | ❌         | ❌                   |
| No external services      | ✅                                          | ✅        | ❌         | ✅                   |
| Code symbol search        | ✅ tree-sitter index                        | ❌        | ❌         | ❌                   |
| Works across AI tools     | ✅ Claude Code, Cursor, Codex, Gemini, Qwen | ✅        | varies     | Claude Code only     |
| Auditable via Git         | ✅ diff + PR review                         | ✅        | ❌         | ❌                   |

---

## Get started

```bash
npm install -g memobank-cli
cd your-project
memo onboarding  # creates .memobank/ and configures Claude Code
```

**For individuals** — memories stay on your machine, load automatically into every Claude Code session:

```bash
memo write decision   # interactive: name, description, content
memo recall "package manager"
```

**For teams** — commit `.memobank/` like source code. Teammates get the same memories on clone:

```bash
git add .memobank/
git commit -m "init team memory"
```

Claude Code loads the first 200 lines of `.memobank/MEMORY.md` at every session start. No plugins or extra configuration needed beyond `memo onboarding`.

---

## How it works

memobank uses three memory tiers, like `git config` levels, each with a different scope:

| Tier      | Location                                | Committed?      | Scope                 |
| --------- | --------------------------------------- | --------------- | --------------------- |
| Personal  | `~/.memobank/<project>/`                | No              | Your machine only     |
| Project   | `<repo>/<dir>/` (default: `.memobank/`) | Yes             | Everyone who clones   |
| Workspace | `~/.memobank/_workspace/`               | Separate remote | Across multiple repos |

Most teams only ever need **Personal + Project**. Workspace is opt-in.
The project directory name (default `.memobank`) can be customized during `memo onboarding`.

When you run `memo recall`, memobank searches all active tiers and writes the top results to `.memobank/MEMORY.md`. Claude Code loads that file at the start of every session.

Memories are plain markdown with a small YAML header: readable, diffable, reviewable in PRs:

```markdown
---
name: prefer-pnpm
type: decision
status: active
tags: [tooling, packages]
---

We switched from npm to pnpm in March 2026. Faster installs, better monorepo support.
```

---

## Features

**Lifecycle scoring** — the agent's working context self-curates

- `experimental → active → needs-review → deprecated`, driven by recall frequency
- Recalled memories get promoted; unused memories drift toward deprecated and stop loading
- `memo lifecycle --scan` downgrades stale memories on a schedule; `--prune` permanently deletes all deprecated files and cleans orphaned access logs; `--reset-epoch` restarts decay for team handoffs
- `memo index-code --summarize` replaces the previous auto-generated architecture snapshot on each run — no stale duplicates accumulate
- Git diff on `.memobank/` shows which memories are gaining or losing recall — ambient health signal without a dashboard

**Code-memory graph** _(optional, requires `npm install memobank-cli --include=optional`)_

- `memo index-code [path]` — parses the codebase with tree-sitter, stores symbols in `.memobank/meta/code-index.db`; incremental via SHA256 hash cache
- `memo recall "query" --code` — dual-track: memories + code symbols searched in parallel, score-normalized and merged; traverses the memory graph up to depth 2 (RRF-merged)
- `memo recall --refs <symbol>` — all callers of a function from the call-graph
- Supports TypeScript, JavaScript, Python, Go, Rust, C#, YAML; `--summarize` writes an architecture snapshot memory after indexing

**Memory types and search**

- Four types: `lesson`, `decision`, `workflow`, `architecture`
- Default search: keyword + tag + recency scoring, no external dependencies
- Optional: vector search via LanceDB (Ollama, OpenAI, Azure, Jina)

**Distillation**

- `memo distill --to personal/workspace` — promotes project memories up the tier hierarchy
- `memo distill --to scenes` — clusters memories by tag similarity, calls LLM once per cluster to write narrative `.memobank/scenes/<topic-YYYY-MM>.md` files; scene navigation is injected into MEMORY.md on every `memo recall`

**Safety**

- Automatic secret redaction before every write (API keys, tokens, credentials, PII)
- `memo scan` blocks workspace publish if secrets are detected

**Integrations**

- Claude Code — `autoMemoryDirectory` points to `.memobank/`, loads at session start
- Cursor, Codex, Gemini CLI, Qwen Code — hooks installed via `memo onboarding`
- Import from Claude Code, Gemini, and Qwen: `memo import --claude`

---

## 📋 Commands

### Setup & Configuration

| Command              | Description                                               |
| -------------------- | --------------------------------------------------------- |
| `memo onboarding`    | Interactive setup wizard (recommended)                    |
| `memo init`          | Alias for onboarding                                      |
| `memo init --global` | Set up personal (private) tier only                       |
| `memo install`       | Set up directory structure and platform hooks             |
| `memo import`        | Import memories from other AI tools                       |
| `memo migrate`       | Migrate from old `personal/`+`team/` layout to three-tier |

### Memory Operations

| Command                           | Description                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `memo recall <query>`             | Search all tiers and write results to MEMORY.md                                 |
| `memo recall <query> --code`      | Dual-track: search memories + code symbols in parallel                          |
| `memo recall --refs <symbol>`     | Show all callers of a symbol from the code index                                |
| `memo search <query>`             | Debug search without modifying MEMORY.md                                        |
| `memo write <type>`               | Create a new memory (interactive or non-interactive)                            |
| `memo capture`                    | Extract learnings from session text via LLM, writes to pending queue            |
| `memo process-queue`              | Drain the pending queue — deduplicates and writes to memory files               |
| `memo process-queue --background` | Same, but spawns a detached background process (used by Stop hook)              |
| `memo distill --to personal`      | Distill project memories into personal tier                                     |
| `memo distill --to workspace`     | Distill project memories into workspace tier                                    |
| `memo distill --to scenes`        | Cluster memories by tag similarity and synthesize narrative scene files via LLM |

### Workspace Commands

| Command                         | Description                                                    |
| ------------------------------- | -------------------------------------------------------------- |
| `memo workspace init <url>`     | Configure workspace remote, clone to `~/.memobank/_workspace/` |
| `memo workspace sync`           | Pull latest workspace memories from remote                     |
| `memo workspace sync --push`    | Push local workspace changes to remote                         |
| `memo workspace publish <file>` | Copy a project memory to workspace (+ secret scan)             |
| `memo workspace status`         | Show git status of local workspace clone                       |

### Management

| Command                        | Description                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `memo index`                   | Build/update search index                                                      |
| `memo index-code [path]`       | Index codebase symbols (tree-sitter + SQLite FTS5)                             |
| `memo index-code --summarize`  | Also write architecture snapshot memory after indexing                         |
| `memo index-code --force`      | Re-index all files (ignore hash cache)                                         |
| `memo review`                  | List memories due for review                                                   |
| `memo map`                     | Show memory statistics                                                         |
| `memo lifecycle`               | View memory lifecycle report                                                   |
| `memo lifecycle --scan`        | Run full status sweep (downgrades stale memories, prunes orphaned access logs) |
| `memo lifecycle --prune`       | Delete all deprecated memories and clean orphaned access logs                  |
| `memo lifecycle --reset-epoch` | Reset epoch for team handoff (new team starts fresh decay)                     |
| `memo study --auto`            | Write study suggestions for frequently-recalled memories                       |
| `memo skill-feedback`          | Report recall misses, isolated graph nodes, never-recalled                     |
| `memo correct <path>`          | Record a memory correction                                                     |
| `memo scan`                    | Scan for secrets before pushing                                                |

---

## 🎯 Usage Examples

### First Time Setup

```bash
# Interactive setup with menu navigation
memo onboarding        # or: memo init

# Project tier only (commits to repo)
memo init

# Personal tier only (private, never committed)
memo init --global

# Set up workspace for org-wide knowledge
memo workspace init git@github.com:mycompany/platform-docs.git
```

### Create Memories

```bash
# Interactive (opens editor)
memo write lesson

# Non-interactive — project tier (default)
memo write lesson \
  --name="redis-pooling" \
  --description="Use connection pooling for Redis" \
  --tags="redis,database" \
  --content="## Problem\n\nHigh concurrency exhausts connections.\n\n## Solution\n\nUse connection pool with max=10."

# Write to personal tier explicitly
memo write lesson --scope personal \
  --name="local-dev-trick" \
  --description="Run port 3001 on this machine to avoid conflicts"
```

### Search Memories

```bash
# Search all tiers (default)
memo recall "redis connection"

# Search specific tier
memo recall "redis connection" --scope project
memo recall "redis connection" --scope personal
memo recall "redis connection" --scope workspace

# Vector search (if configured)
memo recall "database pooling" --engine=lancedb

# Filter by tag or type
memo search "redis" --tag=database
memo search "pool" --type=lesson

# Show score breakdown
memo recall "redis" --explain
```

### Share Memories with the Team

```bash
# Promote a personal note to project-level (committed with code)
# Just move the file and commit it — no special command needed
git add .memobank/lesson/redis-pooling.md
git commit -m "mem: add Redis pooling lesson"

# Promote a project memory to org-wide workspace
memo workspace publish .memobank/lesson/redis-pooling.md

# Pull latest org knowledge
memo workspace sync
```

### Team Handoff

```bash
# New team takes over the project
git clone git@github.com:myorg/my-project.git   # project memories arrive automatically
memo workspace sync                               # pull latest org knowledge
memo lifecycle --reset-epoch                     # start fresh decay tracking
```

### Import from Other Tools

```bash
memo import --claude    # Import from Claude Code
memo import --gemini    # Import from Gemini CLI
memo import --qwen      # Import from Qwen Code
memo import --all       # Import from all available tools
```

---

## 📁 Memory Types

| Type             | Directory       | Purpose                                        |
| ---------------- | --------------- | ---------------------------------------------- |
| **Lesson**       | `lesson/`       | Post-mortems, bugs fixed, gotchas              |
| **Decision**     | `decision/`     | ADRs: context, options, decision, consequences |
| **Workflow**     | `workflow/`     | Runbooks, deploy flows, onboarding             |
| **Architecture** | `architecture/` | System diagrams, component descriptions        |

### Memory File Format

```markdown
---
name: api-timeout-handling
type: lesson
description: 'Use async job queue to prevent API timeout'
tags: [api, reliability, async]
created: 2026-03-17
status: active
confidence: medium
---

## Problem

[Describe the problem]

## Solution

[Describe the solution]

## Key Takeaways

- [Key insight 1]
- [Key insight 2]
```

---

## 📈 Status Lifecycle

Every memory has a `status` field that evolves based on how often it is recalled:

| Status         | Meaning                                      | Transition                                                |
| -------------- | -------------------------------------------- | --------------------------------------------------------- |
| `experimental` | Newly written, unverified                    | Default on creation                                       |
| `active`       | Recalled at least once; trusted              | Promoted on first recall                                  |
| `needs-review` | Not recalled in 90 days; may be stale        | Downgraded by `memo lifecycle --scan`                     |
| `deprecated`   | Not recalled in 90 days after `needs-review` | Excluded from recall; deleted by `memo lifecycle --prune` |

**Rules:**

- `experimental → active`: recalled ≥ 1 time
- `needs-review → active`: recalled ≥ 3 times (deliberate re-validation required)
- `deprecated` memories remain searchable via `memo search --include-deprecated` but are excluded from `memo recall`
- `memo lifecycle --prune` permanently deletes all deprecated memories and removes orphaned `access-log.json` entries
- The Git diff on `.memobank/` shows which memories are gaining or losing relevance — your team's ambient health signal

```bash
# Manual lifecycle scan (or run in CI)
memo lifecycle --scan

# Permanently delete deprecated memories and clean access logs
memo lifecycle --prune

# Configure thresholds in meta/config.yaml
lifecycle:
  experimental_ttl_days: 30
  active_to_review_days: 90
  review_to_deprecated_days: 90
  review_recall_threshold: 3
```

---

## ⚙️ Configuration

Configuration lives in `meta/config.yaml` (inside each tier's root):

```yaml
project:
  name: 'my-project'
  description: 'Optional description'

memory:
  token_budget: 2000
  top_k: 5

embedding:
  engine: text # or 'lancedb'
  provider: ollama # or 'openai', 'azure'
  model: mxbai-embed-large
  dimensions: 1024

search:
  use_tags: true
  use_summary: true

lifecycle:
  experimental_ttl_days: 30
  active_to_review_days: 90
  review_to_deprecated_days: 90
  review_recall_threshold: 3
  decay_window_days: 180

workspace:
  enabled: true
  remote: git@github.com:mycompany/platform-docs.git
  path: .memobank # subdirectory within remote repo (optional)
  branch: main
  auto_sync: false # manual sync by default; no network on every recall
```

### Embedding Providers

| Provider   | Model                  | Dimensions | API Key      |
| ---------- | ---------------------- | ---------- | ------------ |
| **Ollama** | mxbai-embed-large      | 1024       | Not required |
| **OpenAI** | text-embedding-3-small | 1536       | Required     |
| **Azure**  | text-embedding-ada-002 | 1536       | Required     |

---

## 🔌 Platform Integrations

After running `memo install --all`:

### Claude Code

Sets `autoMemoryDirectory` in `~/.claude/settings.json` and installs a `Stop` hook that runs `memo process-queue --background` at the end of every session

### Codex

Appends memory protocol to `AGENTS.md`

### Cursor

Creates `.cursor/rules/memobank.mdc` with `alwaysApply: true`

---

## 🛡️ Security

memobank redacts 20+ secret patterns (API keys, JWT tokens, AWS credentials, GitHub tokens, database connection strings, PII) before any write. `memo workspace publish` runs the same scanner and aborts if secrets are found — there is no automatic stripping, so you redact before publishing.

---

## 🔧 Development

```bash
# Clone and install
git clone https://github.com/clawde-agent/memobank-cli.git
cd memobank-cli
npm install

# Build
npm run build

# Run tests
npm test

# Development mode
npm run dev -- --help
```

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Areas for Contribution

- Unit and integration tests
- Additional embedding providers
- Platform integrations (VS Code, JetBrains)
- Performance optimizations
- Documentation improvements

## 📄 License

MIT © 2026 Memobank Project. See [LICENSE](LICENSE) for details.

## 🔗 Links

- [npm package](https://www.npmjs.com/package/memobank-cli)
- [GitHub repository](https://github.com/clawde-agent/memobank-cli)
- [memobank-skill](https://github.com/clawde-agent/memobank-skill) — AI Agent skill
