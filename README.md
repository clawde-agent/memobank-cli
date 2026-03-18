# Memobank CLI

A personal AI memory system for coding agents. Provides persistent project memory (lessons, decisions, workflows, architecture) with automatic recall and capture.

## Features

- 🧠 **Automatic Recall**: At session start, relevant memories are injected into the agent's context
- 💾 **Structured Storage**: Markdown files with YAML frontmatter, organized by type
- ⏳ **Decay Scoring**: Weibull-based relevance decay prioritizes recent and important memories
- 🔍 **Hybrid Search**: Text engine (keyword + tag + decay) with optional LanceDB vector + BM25
- 🛡️ **Secret Sanitization**: Automatically redacts API keys, tokens, IPs, etc.
- 🤖 **LLM Extraction**: Use `memo capture` to turn session summaries into structured memories
- 🔌 **Platform Integrations**: One‑click setup for Claude Code, Codex, Cursor
- 📦 **Zero‑Dependency Default**: Text engine works out‑of‑the‑box; LanceDB is optional

## Quick Start

```bash
# Install globally
npm install -g memobank-cli

# Initialize in your project (inside a git repo)
memo install --all

# Try it out
memo write lesson --name="test" --description="A test memory" --tags="demo" --content="This works!"
memo recall "test"
```

## Commands

| Command | Description |
|---------|-------------|
| `memo install` | Set up directory structure and platform integrations |
| `memo recall <query>` | Search memories and update `MEMORY.md` (hot path) |
| `memo search <query>` | Debug search without touching `MEMORY.md` |
| `memo capture [--auto]` | Extract learnings from session text |
| `memo write <type>` | Create a new memory (interactive or non‑interactive) |
| `memo index` | Build/update search index (no‑op for text engine) |
| `memo review [--due]` | List memories past their review date |
| `memo map` | Show memory statistics and summary |
| `memo config` | View or edit local configuration |

## Configuration

Configuration lives in `meta/config.yaml` inside your memobank root. Example:

```yaml
project:
  name: "my-project"
  description: "Short description"
memory:
  token_budget: 2000
  top_k: 5
embedding:
  engine: text   # or lancedb
  # provider: openai
  # model: text-embedding-3-small
  # dimensions: 1536
search:
  use_tags: true
  use_summary: true
review:
  enabled: true
```

## Platform Setup

After running `memo install --all`, the skill will automatically configure:

- **Claude Code**: sets `autoMemoryDirectory` in `~/.claude/settings.json`
- **Codex**: appends a memory protocol snippet to `AGENTS.md`
- **Cursor**: creates `.cursor/rules/memobank.mdc` with `alwaysApply: true`

You can also install platforms individually:
```bash
memo install --claude-code
memo install --codex
memo install --cursor
```

## Development

```bash
# Clone and install deps
git clone https://github.com/clawde-agent/memobank-cli.git
cd memobank-cli
npm install

# Build
npm run build

# Test CLI
node dist/cli.js --help
```

## License

MIT © 2026 Memobank Project

