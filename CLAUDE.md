# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build          # compile TypeScript → dist/
npm run dev            # run CLI with ts-node (no build needed)
npm test               # Jest (requires Node 18+, uses --experimental-vm-modules)
npm run test:watch     # watch mode
npm run test:coverage  # with coverage report (50% threshold)
npm run lint           # ESLint
npm run lint:fix       # auto-fix lint issues
npm run typecheck      # tsc --noEmit (strict mode)
npm run format         # Prettier
```

Run a single test file:
```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/store.test.ts
```

The CLI binary is `memo` (dist/cli.js). During development: `npm run dev -- <command>`.

## Architecture

**Purpose**: Persistent memory system for AI coding agents with a three-tier model.

### Three-Tier Memory Model

| Tier | Location | Committed? | Use |
|------|----------|-----------|-----|
| Personal | `~/.memobank/<project-name>/` | No | Private lessons |
| Project | `.memobank/` in repo | Yes | Shared team knowledge |
| Workspace | `~/.memobank/_workspace/<name>/` | Separate remote | Org-wide patterns |

Recall priority: **Project > Personal > Workspace** (higher-priority tier wins on duplicate filenames).

### Memory File Format

Markdown with YAML frontmatter (parsed with `gray-matter`):
```yaml
---
name: api-timeout-handling
type: lesson            # lesson | decision | workflow | architecture
description: "..."
tags: [api, reliability]
created: 2026-03-17
status: active          # experimental → active → needs-review → deprecated
confidence: medium
---
## Problem / Context / Solution ...
```

### Source Layout

```
src/
  cli.ts              # Commander CLI entry point, registers all commands
  types.ts            # Shared TypeScript types (MemoryFile, MemoConfig, etc.)
  core/
    store.ts          # Three-tier directory resolution, file I/O
    config.ts         # YAML config loading/writing
    retriever.ts      # Search orchestration, ranking, token budgeting, access logging
    lifecycle-manager.ts  # Status promotion/demotion based on access frequency
    sanitizer.ts      # Auto-redacts 20+ secret patterns before writes
    embedding.ts      # OpenAI-compatible embeddings (Ollama/Azure/Jina/custom)
    decay-engine.ts   # Recency scoring with 180-day decay window
  commands/           # One file per CLI subcommand
    onboarding.tsx    # Interactive React/Ink setup wizard
    recall.ts         # Search + write results to MEMORY.md
    capture.ts        # LLM-powered extraction from session text
    workspace.ts      # Workspace remote config, sync, publish
    ...
  engines/
    text-engine.ts    # Keyword + tag + decay scoring (zero external deps, default)
    lancedb-engine.ts # Vector search (optional; requires @lancedb/lancedb)
    engine-adapter.ts # Search engine interface
  platforms/          # Per-tool integration adapters (Claude Code, Cursor, Codex, Gemini, Qwen)
tests/                # Jest test files mirroring src/ structure
docs/                 # Extended guides (lifecycle, onboarding, memory value)
```

### Key Design Decisions

- **Text engine is zero-dependency** (default). LanceDB is optional for vector search. The engine is selected via config `engine: text | lancedb`.
- **Secret sanitization** runs automatically before any memory write — 20+ patterns (API keys, JWTs, AWS credentials, etc.).
- **Lifecycle tracking**: access logs + epoch scoring auto-demote stale memories (`active → needs-review → deprecated`).
- **React/Ink** powers interactive prompts (onboarding wizard, selection menus).
- **ESLint enforces**: no `any`, explicit return types, `import type` for type-only imports.
- The `workspace` tier uses a separate Git remote; `memo workspace sync` pulls/pushes it. Secret scan (`memo scan`) must pass before `memo workspace publish`.
