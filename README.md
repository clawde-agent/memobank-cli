# Memobank CLI

> Persistent memory for AI coding sessions

[![npm version](https://img.shields.io/npm/v/memobank-cli.svg)](https://www.npmjs.com/package/memobank-cli)
[![npm downloads](https://img.shields.io/npm/dm/memobank-cli.svg)](https://www.npmjs.com/package/memobank-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0-green.svg)](https://nodejs.org/)

**Memobank CLI** is a personal AI memory system for coding agents. It provides persistent project memory (lessons, decisions, workflows, architecture) with automatic recall and capture.

## 🚀 Quick Start

```bash
# Install globally
npm install -g memobank-cli

# Interactive setup (recommended)
memo onboarding

# Or quick setup
memo install --all
```

## ✨ Features

- 🧠 **Automatic Recall** — Relevant memories injected at session start
- 💾 **Structured Storage** — Markdown files with YAML frontmatter, Git-native
- ⏳ **Decay Scoring** — Weibull-based relevance decay for recency prioritization
- 🔍 **Hybrid Search** — Text engine (keyword + tag + decay) with optional LanceDB vector search
- 🛡️ **Secret Sanitization** — Automatic redaction of API keys, tokens, PII, etc. (20+ patterns)
- 🤖 **LLM Extraction** — Turn session summaries into structured memories
- 🔌 **Multi-Platform** — Claude Code, Codex, Cursor, Gemini CLI, Qwen Code
- 📦 **Zero-Dependency** — Text engine works out-of-the-box
- 🌍 **Local Embeddings** — Ollama support (no API key needed)
- 📥 **Memory Import** — Import from Claude Code, Gemini CLI, Qwen Code
- 📊 **Lifecycle Management** — Track access patterns, archive inactive memories

## 📋 Commands

### Setup & Configuration

| Command | Description |
|---------|-------------|
| `memo onboarding` | Interactive setup wizard (recommended) |
| `memo init` | Alias for onboarding |
| `memo install` | Set up directory structure |
| `memo import` | Import memories from other AI tools |

### Memory Operations

| Command | Description |
|---------|-------------|
| `memo recall <query>` | Search and display memories (writes to MEMORY.md) |
| `memo search <query>` | Debug search without modifying MEMORY.md |
| `memo write <type>` | Create a new memory (interactive or non-interactive) |
| `memo capture` | Extract learnings from session text |

### Management

| Command | Description |
|---------|-------------|
| `memo index` | Build/update search index |
| `memo review` | List memories due for review |
| `memo map` | Show memory statistics |
| `memo lifecycle` | View memory lifecycle report |
| `memo correct <path>` | Record a memory correction |

## 🎯 Usage Examples

### First Time Setup

```bash
# Interactive setup with menu navigation
memo onboarding

# Quick automated setup
memo install --all

# Configure specific platforms
memo install --claude-code
memo install --cursor
```

### Create Memories

```bash
# Interactive (opens editor)
memo write lesson

# Non-interactive
memo write lesson \
  --name="redis-pooling" \
  --description="Use connection pooling for Redis" \
  --tags="redis,database" \
  --content="## Problem\n\nHigh concurrency exhausts connections.\n\n## Solution\n\nUse connection pool with max=10."
```

### Search Memories

```bash
# Text search
memo recall "redis connection"

# Vector search (if configured)
memo recall "database pooling" --engine=lancedb

# Filter by tag
memo search "redis" --tag=database

# Filter by type
memo search "pool" --type=lesson
```

### Lifecycle Management

```bash
# View lifecycle report
memo lifecycle report

# View by tier
memo lifecycle --tier core
memo lifecycle --tier peripheral

# View archival candidates
memo lifecycle archive

# View flagged memories (multiple corrections)
memo lifecycle flagged
```

### Import from Other Tools

```bash
# Import from Claude Code
memo import --claude

# Import from Gemini CLI
memo import --gemini

# Import from Qwen Code
memo import --qwen

# Import from all available tools
memo import --all
```

## 📁 Memory Types

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
description: "Use async job queue to prevent API timeout"
tags: [api, reliability, async]
created: 2026-03-17
review_after: 90d
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

## ⚙️ Configuration

Configuration lives in `meta/config.yaml`:

```yaml
project:
  name: "my-project"
  description: "Optional description"
memory:
  token_budget: 2000
  top_k: 5
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
lifecycle:
  coreThreshold: 10
  peripheralThreshold: 90
  archiveAfterDays: 180
```

### Embedding Providers

| Provider | Model | Dimensions | API Key |
|----------|-------|------------|---------|
| **Ollama** | mxbai-embed-large | 1024 | Not required |
| **OpenAI** | text-embedding-3-small | 1536 | Required |
| **Azure** | text-embedding-ada-002 | 1536 | Required |

## 🔌 Platform Integrations

After running `memo install --all`:

### Claude Code
Sets `autoMemoryDirectory` in `~/.claude/settings.json`

### Codex
Appends memory protocol to `AGENTS.md`

### Cursor
Creates `.cursor/rules/memobank.mdc` with `alwaysApply: true`

## 🛡️ Security

Memobank automatically sanitizes:
- ✅ API keys and tokens
- ✅ Passwords and secrets
- ✅ IP addresses and hostnames
- ✅ Email addresses and phone numbers (PII)
- ✅ Database connection strings
- ✅ Private keys and certificates
- ✅ JWT tokens
- ✅ AWS credentials
- ✅ GitHub/GitLab tokens

## 📊 Memory Lifecycle

Memories are automatically categorized:

| Tier | Condition | Behavior |
|------|-----------|----------|
| **Core** 🔴 | Access ≥10 times | Priority retrieval |
| **Working** 🟡 | Normal access | Normal retrieval |
| **Peripheral** ⚪ | 90 days no access | Lower priority, archive suggestion |

## 📖 Documentation

- [Onboarding Guide](docs/ONBOARDING-GUIDE.md) - Interactive setup walkthrough
- [Memory Value Guide](docs/MEMORY-VALUE-GUIDE.md) - What to remember
- [Lifecycle Management](docs/LIFECYCLE-MANAGEMENT.md) - Memory optimization

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
