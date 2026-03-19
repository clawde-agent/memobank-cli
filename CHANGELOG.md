# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- Web UI for memory management
- Memory sharing and collaboration features
- Advanced search filters
- Memory export formats (PDF, HTML)

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
