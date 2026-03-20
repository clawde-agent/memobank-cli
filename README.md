# Memobank CLI

> Persistent memory for AI coding sessions — personal, team, and organization-wide

[![npm version](https://img.shields.io/npm/v/memobank-cli.svg)](https://www.npmjs.com/package/memobank-cli)
[![npm downloads](https://img.shields.io/npm/dm/memobank-cli.svg)](https://www.npmjs.com/package/memobank-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0-green.svg)](https://nodejs.org/)

**Memobank CLI** is a structured memory system for AI coding agents. It stores lessons, decisions, workflows, and architecture notes across three tiers — personal, project, and workspace — so agents never lose context between sessions.

## 🚀 Quick Start

```bash
# Install globally
npm install -g memobank-cli

# Interactive setup (recommended)
memo onboarding

# Or use the alias
memo init
```

---

## 🗂️ Three-Tier Memory Model

Memobank organizes memory into three tiers, each with a distinct scope and use case. The tier determines where files are stored and who can access them — not how they are structured (all tiers share the same file format).

### Tier 1 — Personal (Private)

| | |
|---|---|
| **Location** | `~/.memobank/<project-name>/` |
| **Committed to Git** | Never |
| **Who sees it** | Only you, on this machine |
| **Activate** | `memo init --global` |

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

| | |
|---|---|
| **Location** | `<repo-root>/.memobank/` |
| **Committed to Git** | Yes — like any other source file |
| **Who sees it** | Everyone who clones the repo |
| **Activate** | `memo init` (default) |

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

| | |
|---|---|
| **Location** | `~/.memobank/_workspace/<workspace-name>/` (local clone) |
| **Committed to Git** | To a designated remote repo (infra, platform-docs, etc.) |
| **Who sees it** | Entire organization, across all repos |
| **Activate** | `memo workspace init <remote-url>` |

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

## ✨ Features

- 🗂️ **Three-Tier Memory** — Personal (private), Project (team, Git-committed), Workspace (org-wide, optional)
- 🧠 **Automatic Recall** — Relevant memories injected at session start
- 💾 **Structured Storage** — Markdown files with YAML frontmatter, Git-native
- 📈 **Status Lifecycle** — `experimental → active → needs-review → deprecated` driven by recall frequency
- ⏳ **Epoch Scoring** — Linear decay separates new-team vs old-team memory relevance
- 🔍 **Hybrid Search** — Text engine (keyword + tag + decay) with optional LanceDB vector search
- 🛡️ **Secret Sanitization** — Automatic redaction of API keys, tokens, PII, etc. (20+ patterns)
- 🤖 **LLM Extraction** — Turn session summaries into structured memories
- 🔌 **Multi-Platform** — Claude Code, Codex, Cursor, Gemini CLI, Qwen Code
- 📦 **Zero-Dependency** — Text engine works out-of-the-box
- 🌍 **Local Embeddings** — Ollama support (no API key needed)
- 📥 **Memory Import** — Import from Claude Code, Gemini CLI, Qwen Code

---

## 📋 Commands

### Setup & Configuration

| Command | Description |
|---------|-------------|
| `memo onboarding` | Interactive setup wizard (recommended) |
| `memo init` | Alias for onboarding |
| `memo init --global` | Set up personal (private) tier only |
| `memo install` | Set up directory structure and platform hooks |
| `memo import` | Import memories from other AI tools |
| `memo migrate` | Migrate from old `personal/`+`team/` layout to three-tier |

### Memory Operations

| Command | Description |
|---------|-------------|
| `memo recall <query>` | Search all tiers and write results to MEMORY.md |
| `memo search <query>` | Debug search without modifying MEMORY.md |
| `memo write <type>` | Create a new memory (interactive or non-interactive) |
| `memo capture` | Extract learnings from session text |

### Workspace Commands

| Command | Description |
|---------|-------------|
| `memo workspace init <url>` | Configure workspace remote, clone to `~/.memobank/_workspace/` |
| `memo workspace sync` | Pull latest workspace memories from remote |
| `memo workspace sync --push` | Push local workspace changes to remote |
| `memo workspace publish <file>` | Copy a project memory to workspace (+ secret scan) |
| `memo workspace status` | Show git status of local workspace clone |

### Management

| Command | Description |
|---------|-------------|
| `memo index` | Build/update search index |
| `memo review` | List memories due for review |
| `memo map` | Show memory statistics |
| `memo lifecycle` | View memory lifecycle report |
| `memo lifecycle --scan` | Run full status sweep (downgrades stale memories) |
| `memo lifecycle --reset-epoch` | Reset epoch for team handoff (new team starts fresh decay) |
| `memo correct <path>` | Record a memory correction |
| `memo scan` | Scan for secrets before pushing |

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

| Type | Directory | Purpose |
|------|-----------|---------|
| **Lesson** | `lesson/` | Post-mortems, bugs fixed, gotchas |
| **Decision** | `decision/` | ADRs: context, options, decision, consequences |
| **Workflow** | `workflow/` | Runbooks, deploy flows, onboarding |
| **Architecture** | `architecture/` | System diagrams, component descriptions |

### Memory File Format

```markdown
---
name: api-timeout-handling
type: lesson
description: "Use async job queue to prevent API timeout"
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

| Status | Meaning | Transition |
|--------|---------|-----------|
| `experimental` | Newly written, unverified | Default on creation |
| `active` | Recalled at least once; trusted | Promoted on first recall |
| `needs-review` | Not recalled in 90 days; may be stale | Downgraded by `memo lifecycle --scan` |
| `deprecated` | Not recalled in 90 days after `needs-review` | Excluded from default recall |

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
  name: "my-project"
  description: "Optional description"

memory:
  token_budget: 2000
  top_k: 5

embedding:
  engine: text        # or 'lancedb'
  provider: ollama    # or 'openai', 'azure'
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
  path: .memobank      # subdirectory within remote repo (optional)
  branch: main
  auto_sync: false     # manual sync by default; no network on every recall
```

### Embedding Providers

| Provider | Model | Dimensions | API Key |
|----------|-------|------------|---------|
| **Ollama** | mxbai-embed-large | 1024 | Not required |
| **OpenAI** | text-embedding-3-small | 1536 | Required |
| **Azure** | text-embedding-ada-002 | 1536 | Required |

---

## 🔌 Platform Integrations

After running `memo install --all`:

### Claude Code
Sets `autoMemoryDirectory` in `~/.claude/settings.json`

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
