# Memobank CLI

> Persistent memory for AI coding sessions

[![npm version](https://img.shields.io/npm/v/memobank-cli.svg)](https://www.npmjs.com/package/memobank-cli)
[![npm downloads](https://img.shields.io/npm/dm/memobank-cli.svg)](https://www.npmjs.com/package/memobank-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0-green.svg)](https://nodejs.org/)

**Memobank CLI** is a personal AI memory system for coding agents. It provides persistent project memory (lessons, decisions, workflows, architecture) with automatic recall and capture.

## Features

- 🧠 **Automatic Recall** — Relevant memories injected at session start
- 💾 **Structured Storage** — Markdown files with YAML frontmatter, Git-native
- ⏳ **Decay Scoring** — Weibull-based relevance decay for recency prioritization
- 🔍 **Hybrid Search** — Text engine (keyword + tag + decay) with optional LanceDB vector search
- 🛡️ **Secret Sanitization** — Automatic redaction of API keys, tokens, PII, etc.
- 🤖 **LLM Extraction** — Turn session summaries into structured memories
- 🔌 **Platform Integrations** — One-click setup for Claude Code, Codex, Cursor
- 📦 **Zero-Dependency Default** — Text engine works out-of-the-box
- 🌍 **Local Embeddings** — Support for Ollama (no API key needed)
- 📥 **Memory Import** — Import from Claude Code, Gemini CLI, Qwen Code

## Quick Start

```bash
# Install globally
npm install -g memobank-cli

# Initialize in your project (inside a git repo)
cd your-project
memo install --all

# Create your first memory
memo write lesson \
  --name="redis-pooling" \
  --description="Use connection pooling for Redis" \
  --tags="redis,database" \
  --content="## Problem\n\nHigh concurrency exhausts connections.\n\n## Solution\n\nUse connection pool with max=10."

# Search memories
memo recall "redis"
```

## Installation

### Requirements

- Node.js 18.0.0 or higher
- Git (for repository detection)

### Global Installation (Recommended)

```bash
npm install -g memobank-cli
```

### Local Installation

```bash
npm install memobank-cli
# Use with npx
npx memo --help
```

### Development Installation

```bash
git clone https://github.com/clawde-agent/memobank-cli.git
cd memobank-cli
npm install
npm run build
npm link
```

## Commands

| Command | Description |
|---------|-------------|
| `memo install` | Set up directory structure and platform integrations |
| `memo setup` | Interactive configuration wizard |
| `memo import` | Import memories from other AI tools |
| `memo recall <query>` | Search and display memories (writes to MEMORY.md) |
| `memo search <query>` | Debug search without modifying MEMORY.md |
| `memo capture` | Extract learnings from session text |
| `memo write <type>` | Create a new memory (interactive or non-interactive) |
| `memo index` | Build/update search index |
| `memo review` | List memories due for review |
| `memo map` | Show memory statistics and summary |

### Command Examples

```bash
# Interactive setup with tool configuration
memo setup

# Import memories from Claude Code
memo import --claude

# Search with vector engine (requires LanceDB)
memo recall "database connection" --engine=lancedb

# Create memory non-interactively
memo write decision \
  --name="db-selection" \
  --description="Choose PostgreSQL for ACID compliance" \
  --tags="database,architecture" \
  --content="## Context\n\nNeed relational database.\n\n## Decision\n\nPostgreSQL over MongoDB."

# Extract learnings from text
memo capture --session="Today I learned about connection pooling..."

# View memory statistics
memo map

# List overdue reviews
memo review --due
```

## Memory Types

Memobank organizes memories into four types:

| Type | Directory | Purpose |
|------|-----------|---------|
| **Lesson** | `lessons/` | Post-mortems, bugs fixed, gotchas |
| **Decision** | `decisions/` | ADRs: context, options, decision, consequences |
| **Workflow** | `workflows/` | Runbooks, deploy flows, onboarding |
| **Architecture** | `architecture/` | System diagrams, component descriptions |

### Memory File Format

```markdown
---
name: api-timeout-handling
type: lesson
description: "Use async job queue to prevent API timeout under high load"
tags: [api, reliability, async]
created: 2026-03-17
updated: 2026-03-17
review_after: 90d
confidence: medium
---

## Problem

[Describe the problem or challenge encountered]

## Solution

[Describe the solution or approach that worked]

## Key Takeaways

- [Key insight 1]
- [Key insight 2]
- [Key insight 3]
```

## Configuration

Configuration lives in `meta/config.yaml`:

```yaml
project:
  name: "my-project"
  description: "Optional project description"
memory:
  token_budget: 2000  # Max tokens to inject
  top_k: 5          # Number of memories to recall
embedding:
  engine: text      # or 'lancedb'
  provider: ollama  # or 'openai', 'azure'
  model: mxbai-embed-large
  dimensions: 1024
search:
  use_tags: true
  use_summary: true
review:
  enabled: true
```

### Embedding Providers

| Provider | Model | Dimensions | API Key |
|----------|-------|------------|---------|
| **Ollama** | mxbai-embed-large | 1024 | Not required |
| **OpenAI** | text-embedding-3-small | 1536 | Required |
| **Azure** | text-embedding-ada-002 | 1536 | Required |
| **Custom** | Any compatible model | Variable | Required |

## Platform Integrations

After running `memo install --all`, memobank configures:

### Claude Code

Sets `autoMemoryDirectory` in `~/.claude/settings.json`:

```json
{
  "autoMemoryDirectory": "/Users/you/.memobank/your-project"
}
```

### Codex

Appends memory protocol to `AGENTS.md`:

```markdown
## Memory Protocol

This project uses memobank for persistent memory...
```

### Cursor

Creates `.cursor/rules/memobank.mdc` with `alwaysApply: true`.

## Security

Memobank automatically sanitizes sensitive information:

- ✅ API keys and tokens
- ✅ Passwords and secrets
- ✅ IP addresses and hostnames
- ✅ Email addresses and phone numbers (PII)
- ✅ Database connection strings
- ✅ Private keys and certificates
- ✅ JWT tokens

**Design Goal:** Safe to share — No secrets, no embeddings, no binary blobs in the repo.

## Directory Structure

```
~/.memobank/<project>/
├── lessons/           # Post-mortems, bugs fixed, gotchas
├── decisions/         # ADRs
├── workflows/         # Runbooks, deploy flows
├── architecture/      # System diagrams
├── memory/
│   └── MEMORY.md      # Dynamic recall cache
└── meta/
    └── config.yaml    # Configuration
```

## Development

```bash
# Clone and install
git clone https://github.com/clawde-agent/memobank-cli.git
cd memobank-cli
npm install

# Build
npm run build

# Run in development mode
npm run dev -- --help

# Run tests
npm test
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Areas for Contribution

- Unit and integration tests
- Additional embedding providers
- Platform integrations (VS Code, JetBrains)
- Performance optimizations
- Documentation improvements

## License

MIT © 2026 Memobank Project. See [LICENSE](./LICENSE) for details.

## Links

- [npm package](https://www.npmjs.com/package/memobank-cli)
- [GitHub repository](https://github.com/clawde-agent/memobank-cli)
- [memobank-skill](https://github.com/clawde-agent/memobank-skill) — AI Agent skill definition
