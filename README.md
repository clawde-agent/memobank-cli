# memobank

[![npm version](https://img.shields.io/npm/v/memobank-cli.svg)](https://www.npmjs.com/package/memobank-cli)
[![npm downloads](https://img.shields.io/npm/dm/memobank-cli.svg)](https://www.npmjs.com/package/memobank-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0-green.svg)](https://nodejs.org/)
[![CI](https://github.com/clawde-agent/memobank-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/clawde-agent/memobank-cli/actions/workflows/ci.yml)
[![Known Vulnerabilities](https://snyk.io/test/github/clawde-agent/memobank-cli/badge.svg)](https://snyk.io/test/github/clawde-agent/memobank-cli)

AI agents forget everything between sessions.
Static files like CLAUDE.md go stale and require manual upkeep.
Cloud memory APIs add external services your team doesn't own or control.

**memobank gives AI agents persistent, structured memory that lives in your Git repo** —
versioned alongside code, reviewed as PRs, and loaded automatically at session start.

- **Personal** — private lessons and preferences, never committed
- **Team** — shared knowledge that travels with the codebase
- **Workspace** — cross-repo patterns, synced via a separate Git remote

Works with Claude Code, Cursor, Codex, Gemini CLI, and Qwen Code.
Zero external services required.

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

Claude Code loads the first 200 lines of `.memobank/MEMORY.md` at every session start — no plugins, no configuration beyond `memo onboarding`.

---

## How it works

memobank uses three memory tiers — like `git config` levels, each with a different scope:

| Tier      | Location                                | Committed?      | Scope                 |
| --------- | --------------------------------------- | --------------- | --------------------- |
| Personal  | `~/.memobank/<project>/`                | No              | Your machine only     |
| Project   | `<repo>/<dir>/` (default: `.memobank/`) | Yes             | Everyone who clones   |
| Workspace | `~/.memobank/_workspace/`               | Separate remote | Across multiple repos |

Most teams only ever need **Personal + Project**. Workspace is opt-in.
The project directory name (default `.memobank`) can be customized during `memo onboarding`.

When you run `memo recall`, memobank searches all active tiers and writes the top results to `.memobank/MEMORY.md`. Claude Code loads that file at the start of every session.

Memories are plain markdown with a small YAML header — readable, diffable, and reviewable in PRs:

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

## Why not just use CLAUDE.md?

CLAUDE.md is great for static rules you write once. memobank handles knowledge that accumulates over time — lessons learned, decisions made, patterns discovered. The two are complementary: CLAUDE.md for "always do X", memobank for "we learned Y".

## Why not a cloud memory API?

Tools like mem0 or Zep store memories in external services. memobank stores them in your Git repo — no API keys, no vendor lock-in, no data leaving your machine. Memory health is visible in `git diff`. Reviews happen in PRs.

## Why not Claude Code's built-in auto-memory?

Claude Code's auto-memory is personal and machine-local by default. memobank adds the team layer: `.memobank/` is committed alongside your code, so every teammate and every CI run starts with the same shared knowledge. memobank also works with Cursor, Codex, Gemini CLI, and Qwen Code.

---

## Features

**Memory management**

- Four types: `lesson`, `decision`, `workflow`, `architecture`
- Status lifecycle: `experimental → active → needs-review → deprecated`
- Automatic stale memory detection via `memo review`

**Search**

- Default: keyword + tag + recency scoring, zero external dependencies
- Optional: vector search via LanceDB (Ollama, OpenAI, Azure, Jina)
- Optional: code symbol index via tree-sitter + SQLite FTS5 (`memo recall --code`)

**Code Symbol Index** _(optional, requires `npm install memobank-cli --include=optional`)_

- `memo index-code [path]` — parses your codebase with tree-sitter and stores symbols in `.memobank/meta/code-index.db`
- `memo recall "query" --code` — dual-track recall: searches memories and code symbols in parallel, results score-normalized and merged
- `memo recall --refs <symbol>` — show all callers of a function from the call-graph
- Supports TypeScript, JavaScript, Python, Go, Rust, YAML, C# (more via the same extension pattern)
- Incremental: unchanged files are skipped via SHA256 hash cache
- `--summarize` writes a `project-architecture-snapshot` memory after indexing

**Safety**

- Automatic secret redaction before every write (API keys, tokens, credentials)
- `memo scan` blocks workspace publish if secrets are detected

**Integrations**

- Claude Code — `autoMemoryDirectory` points to `.memobank/`, loads at session start
- Cursor, Codex, Gemini CLI, Qwen Code — hooks installed via `memo onboarding`
- Import from Claude Code, Gemini, and Qwen: `memo import --claude`

**Team workflows**

- Workspace tier: cross-repo knowledge synced via separate Git remote
- Epoch-aware scoring: team knowledge naturally fades during handoffs
- `memo map` for memory statistics, `memo lifecycle` for health scans

---

## 🗂️ Three-Tier Memory Model

Memobank organizes memory into three tiers, each with a distinct scope and use case. The tier determines where files are stored and who can access them — not how they are structured (all tiers share the same file format).

### Tier 1 — Personal (Private)

|                      |                               |
| -------------------- | ----------------------------- |
| **Location**         | `~/.memobank/<project-name>/` |
| **Committed to Git** | Never                         |
| **Who sees it**      | Only you, on this machine     |
| **Activate**         | `memo init --global`          |

**Use when:** You want to keep private notes about a project — experiments that didn't pan out, personal shortcuts, machine-specific env quirks. This tier never touches the repo and is never shared.

```
~/.memobank/my-project/
├── lesson/
├── decision/
├── workflow/
└── architecture/
```

---

### Tier 2 — Project (Team)

|                      |                                  |
| -------------------- | -------------------------------- |
| **Location**         | `<repo-root>/.memobank/`         |
| **Committed to Git** | Yes — like any other source file |
| **Who sees it**      | Everyone who clones the repo     |
| **Activate**         | `memo init` (default)            |

**Use when:** You want the team to share knowledge about this repo. Adding a memory = opening a PR. Reviewing a memory = code review. History = `git log`. No extra commands needed — standard Git workflow handles everything.

```
your-project/
├── src/
├── .memobank/          ← committed alongside code
│   ├── lesson/
│   ├── decision/
│   ├── workflow/
│   └── architecture/
└── package.json
```

**Differentiated use cases vs. personal:**

- Bug post-mortems the whole team should know about → **project**
- "I personally keep forgetting to run `npm run generate` before building" → **personal**
- Architecture decision records (ADRs) → **project**
- Your local dev environment gotcha → **personal**

---

### Tier 3 — Workspace (Organization, Optional)

|                      |                                                          |
| -------------------- | -------------------------------------------------------- |
| **Location**         | `~/.memobank/_workspace/<workspace-name>/` (local clone) |
| **Committed to Git** | To a designated remote repo (infra, platform-docs, etc.) |
| **Who sees it**      | Entire organization, across all repos                    |
| **Activate**         | `memo workspace init <remote-url>`                       |

**Use when:** You have knowledge that spans multiple repos or services — inter-service contracts, company-wide architecture patterns, platform team decisions. Any existing Git repo can serve as the workspace remote; updates flow through standard PRs.

```
Organization knowledge (cross-repo):
  git@github.com:mycompany/platform-docs.git
    └── .memobank/
        ├── lesson/       ← "all services must handle 429s with exponential backoff"
        ├── decision/     ← "we use gRPC for internal, REST for external"
        └── architecture/ ← "auth service owns all JWT validation"
```

**Differentiated use cases vs. project:**

- "Redis connection pooling pattern for this service" → **project**
- "Redis connection pooling pattern for all services" → **workspace**
- "We switched to Postgres in this repo" → **project**
- "Our data platform team maintains Postgres, contact @data-infra for schema changes" → **workspace**

---

### Recall Priority

When `memo recall` runs, all configured tiers are searched and merged into a single ranked list:

```
Priority (highest → lowest):
1. Project   — most specific to current context
2. Personal  — your individual experience
3. Workspace — broad organizational knowledge
```

If the same filename exists in multiple tiers, the higher-priority tier's version wins. Each result shows its source tier so you always know where a memory came from.

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

| Command                           | Description                                                          |
| --------------------------------- | -------------------------------------------------------------------- |
| `memo recall <query>`             | Search all tiers and write results to MEMORY.md                      |
| `memo recall <query> --code`      | Dual-track: search memories + code symbols in parallel               |
| `memo recall --refs <symbol>`     | Show all callers of a symbol from the code index                     |
| `memo search <query>`             | Debug search without modifying MEMORY.md                             |
| `memo write <type>`               | Create a new memory (interactive or non-interactive)                 |
| `memo capture`                    | Extract learnings from session text via LLM, writes to pending queue |
| `memo process-queue`              | Drain the pending queue — deduplicates and writes to memory files    |
| `memo process-queue --background` | Same, but spawns a detached background process (used by Stop hook)   |

### Workspace Commands

| Command                         | Description                                                    |
| ------------------------------- | -------------------------------------------------------------- |
| `memo workspace init <url>`     | Configure workspace remote, clone to `~/.memobank/_workspace/` |
| `memo workspace sync`           | Pull latest workspace memories from remote                     |
| `memo workspace sync --push`    | Push local workspace changes to remote                         |
| `memo workspace publish <file>` | Copy a project memory to workspace (+ secret scan)             |
| `memo workspace status`         | Show git status of local workspace clone                       |

### Management

| Command                        | Description                                                |
| ------------------------------ | ---------------------------------------------------------- |
| `memo index`                   | Build/update search index                                  |
| `memo index-code [path]`       | Index codebase symbols (tree-sitter + SQLite FTS5)         |
| `memo index-code --summarize`  | Also write architecture snapshot memory after indexing     |
| `memo index-code --force`      | Re-index all files (ignore hash cache)                     |
| `memo review`                  | List memories due for review                               |
| `memo map`                     | Show memory statistics                                     |
| `memo lifecycle`               | View memory lifecycle report                               |
| `memo lifecycle --scan`        | Run full status sweep (downgrades stale memories)          |
| `memo lifecycle --reset-epoch` | Reset epoch for team handoff (new team starts fresh decay) |
| `memo correct <path>`          | Record a memory correction                                 |
| `memo scan`                    | Scan for secrets before pushing                            |

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

| Status         | Meaning                                      | Transition                            |
| -------------- | -------------------------------------------- | ------------------------------------- |
| `experimental` | Newly written, unverified                    | Default on creation                   |
| `active`       | Recalled at least once; trusted              | Promoted on first recall              |
| `needs-review` | Not recalled in 90 days; may be stale        | Downgraded by `memo lifecycle --scan` |
| `deprecated`   | Not recalled in 90 days after `needs-review` | Excluded from default recall          |

**Rules:**

- `experimental → active`: recalled ≥ 1 time
- `needs-review → active`: recalled ≥ 3 times (deliberate re-validation required)
- `deprecated` memories remain searchable via `memo search --include-deprecated` but are excluded from `memo recall`
- The Git diff on `.memobank/` shows which memories are gaining or losing relevance — your team's ambient health signal

```bash
# Manual lifecycle scan (or run in CI)
memo lifecycle --scan

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

Memobank automatically sanitizes secrets before publishing to workspace:

- ✅ API keys and tokens
- ✅ Passwords and secrets
- ✅ IP addresses and hostnames
- ✅ Email addresses and phone numbers (PII)
- ✅ Database connection strings
- ✅ Private keys and certificates
- ✅ JWT tokens
- ✅ AWS credentials
- ✅ GitHub/GitLab tokens

`memo workspace publish` runs the same scanner and aborts if secrets are found — no automatic stripping, you must redact manually.

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
