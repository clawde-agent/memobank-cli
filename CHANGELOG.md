# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.0] - 2026-05-13

### Added

- **Code Symbol Index** — `memo index-code [path]` parses your codebase with tree-sitter and stores symbols in `.memobank/meta/code-index.db` (SQLite FTS5, local only, not committed). Supports TypeScript, JavaScript, Python, Go, Rust, YAML, and C#.
- **Dual-track recall** — `memo recall "query" --code` searches memories and code symbols in parallel. Results are score-normalized per stream and merged into a single ranked list.
- **Call-graph lookup** — `memo recall --refs <symbol>` returns all callers of a function from the edge table.
- **`--summarize` flag** — after indexing, writes a `project-architecture-snapshot` architecture memory with language counts and symbol stats.
- **Incremental scan** — unchanged files are skipped via SHA256 hash cache; use `--force` to re-index all.
- **`--langs` filter** — `memo index-code --langs typescript,python` limits the scan to specific languages.
- **New types** — `CodeSymbol`, `CodeEdge`, `SymbolResult`, `CodeScanOptions`, `SymbolKind`, `EdgeKind`, `IndexedLanguage` exported from `src/types.ts`.

### Dependencies

- Added `optionalDependencies`: `better-sqlite3`, `tree-sitter`, and grammar packages for 7 languages. Core commands are unaffected when optional deps are absent.
- Install with: `npm install memobank-cli --include=optional`

## [0.7.0] - 2026-03-26

### Added

- **Async pending queue** — `memo capture` writes extracted candidates to `.pending/<id>.json` then immediately drains via `processQueue()`. Decouples extraction from writing; future triggers only need to change _when_ the queue is drained.
- **`memo process-queue` command** — manually drain the pending queue. Exits silently when empty; errors go to stderr.
- **`memo process-queue --background`** — spawns a detached child process and returns immediately (used by the Stop hook).
- **Claude Code Stop hook** — `memo install` now adds `memo process-queue --background` to the `Stop` hooks in `~/.claude/settings.json`, so the queue is drained at the end of every Claude Code session.
- **Project boundary enforcement** — every pending entry is stamped with `projectId` (resolved via git remote origin → `config.project.name` → directory name). `processQueue` deletes cross-project entries; `workspace publish` rejects memories whose `project:` frontmatter doesn't match the current repo.
- **Two-stage dedup in `processQueue`** — Stage 1: Jaccard similarity (word + trigram) — exact match or ≥ 0.8 skip, < 0.4 write, 0.4–0.8 sent to Stage 2. Stage 2: single LLM batch call returning `DUPLICATE | KEEP_BOTH` per pair. Gracefully degrades to `KEEP_BOTH` when no LLM is configured or the call fails.
- **`project` frontmatter field** — all memories written through `processQueue` now carry a `project:` tag in their frontmatter for workspace boundary enforcement.

### Fixed

- `glob.sync()` on Windows returned empty results for backslash paths produced by `path.join()`. Normalized to forward slashes in `store.ts`, `scan.ts`, and `migrate.ts`.

## [0.6.0] - 2026-03-20

### Added

- **Three-Tier Memory Model** — Personal (`~/.memobank/<project>/`), Project (`.memobank/`), Workspace (`~/.memobank/_workspace/`) tiers with distinct scopes and recall priority
- **Custom project memory directory** — onboarding now prompts for the project tier directory name (default `.memobank`); any name is supported
- **`findGitRoot` helper** — correctly resolves the git repo root independently of the memory directory name
- **Auto-memory check step** — onboarding detects if Claude Code has `autoMemoryEnabled: false` and offers to re-enable it
- **Workspace remote renamed from `team`** — `config.workspace` replaces `config.team`; backward-compatible alias in `loadConfig`

### Changed

- `MEMORY.md` now lives at `<repoRoot>/MEMORY.md` (flat, not `memory/MEMORY.md`)
- `autoMemoryDirectory` in Claude Code settings points to the project tier root (not a subdirectory)
- `findRepoRoot` scans all immediate subdirectories to support custom directory names
- `memo onboarding` is the canonical setup command; `memo init` and `memo setup` remain as aliases
- Deprecated `memo team` commands fully removed; use `memo workspace`
- `--scope team` option removed; use `--scope project`

### Fixed

- Dead imports (`isNoise`, `hasHighValueIndicators`, `filterAndRank`) removed from `capture.ts`
- Removed Stop hook install from Claude Code platform adapter (Claude Code native auto-memory handles writes)

## [0.1.0] - 2026-03-19

### Added

#### Core Features

- **Interactive Onboarding** - Menu-driven setup with arrow key navigation
  - `memo onboarding` command (aliases: `memo init`, `memo setup`)
  - Quick Setup (automated recommended configuration)
  - Custom Setup (step-by-step configuration)
  - Platform selection with checkboxes
  - Embedding provider selection

- **Memory Lifecycle Management**
  - Access tracking for all recalled memories
  - Three-tier system (core/working/peripheral)
  - Automatic archival suggestions
  - Correction tracking with review flagging
  - `memo lifecycle` command suite
  - `memo correct <path>` command

- **Memory Import**
  - Import from Claude Code auto-memory
  - Import from Gemini CLI GEMINI.md
  - Import from Qwen Code QWEN.md
  - `memo import` command with dry-run support

- **Security Features**
  - Automatic secret sanitization (20+ patterns)
  - PII detection and redaction
  - Abstraction level validation
  - Noise filtering for low-value content
  - Value scoring system (0-1 scale)

- **Embedding Support**
  - Ollama local embeddings (no API key)
  - OpenAI embeddings
  - Azure OpenAI embeddings
  - Custom embedding endpoints

#### Platform Integrations

- Claude Code (autoMemoryDirectory)
- Codex (AGENTS.md protocol)
- Cursor (.cursor/rules/memobank.mdc)

#### Commands

- `memo onboarding` - Interactive setup
- `memo init` - Alias for onboarding
- `memo import` - Import memories
- `memo lifecycle` - Lifecycle management
- `memo correct` - Record corrections
- `memo recall` - Search and display
- `memo search` - Debug search
- `memo write` - Create memories
- `memo capture` - Extract learnings
- `memo index` - Build index
- `memo review` - List due reviews
- `memo map` - Show statistics

#### Documentation

- `docs/ONBOARDING-GUIDE.md` - Interactive setup guide
- `docs/MEMORY-VALUE-GUIDE.md` - What to remember
- `docs/LIFECYCLE-MANAGEMENT.md` - Memory optimization
- `CONTRIBUTING.md` - Contribution guidelines
- `CHANGELOG.md` - This file

### Changed

- Unified setup flow (`memo onboarding` replaces separate `memo setup`)
- Simplified `memo install` (directory structure only)
- Improved error messages with actionable guidance
- Enhanced TypeScript strict mode compliance
- Updated LanceDB from `vectordb` to `@lancedb/lancedb`

### Fixed

- LanceDB search API compatibility (`toArray()` vs `execute()`)
- Memory file generation with proper filename format
- Import command sanitization before saving
- Various TypeScript type errors
- Undefined value handling in commands

### Technical

- **Dependencies**
  - `@lancedb/lancedb` ^0.15.0
  - `@lancedb/core` ^0.15.0
  - `openai` ^4.104.0
  - `ink` ^3.2.0 (for future interactive UI)
  - `ink-select-input` ^4.2.0

- **Dev Dependencies**
  - `@types/jest` ^29.5.12
  - `jest` ^29.7.0
  - `ts-jest` ^29.1.2
  - `eslint` ^8.57.0
  - `prettier` ^3.2.5
  - `@typescript-eslint/*` ^7.0.0

- **Quality**
  - 25 unit tests (100% core module coverage)
  - ESLint configuration
  - Prettier formatting
  - TypeScript strict mode
  - CI/CD workflows (GitHub Actions)

### Removed

- `docs/specs/` directory (design spec references)
- `docs/plans/` directory (planning documents)
- Deprecated setup command flow

## [0.0.1] - 2026-03-17

### Added

- Initial prototype
- Basic text search engine
- Memory CRUD operations
- YAML frontmatter parsing
- Markdown file storage

[Unreleased]: https://github.com/clawde-agent/memobank-cli/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/clawde-agent/memobank-cli/releases/tag/v0.1.0
