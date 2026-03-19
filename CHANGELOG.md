# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Interactive setup wizard (`memo setup`) with tool configuration
- Memory import from Claude Code, Gemini CLI, and Qwen Code (`memo import`)
- Automatic sensitive information sanitization (API keys, passwords, PII, etc.)
- Support for Ollama local embeddings
- Azure OpenAI embedding support
- Memory abstraction level validation (high/medium/low)
- Security checklist in memory templates

### Changed
- Updated LanceDB dependency from `vectordb` to `@lancedb/lancedb`
- Memory file format now aligns with official memobank design spec
- Frontmatter uses date-only format (YYYY-MM-DD) for better git history
- Improved error messages with actionable guidance

### Fixed
- LanceDB search using correct `toArray()` API
- Memory file generation with proper filename format (`<date>-<slug>.md`)
- Import command now properly sanitizes content before saving

### Security
- Automatic redaction of 20+ sensitive information types
- Validation prevents storing overly specific content
- PII detection and removal

## [0.1.0] - 2026-03-19

### Added
- Initial release
- Core CLI commands: `install`, `recall`, `search`, `capture`, `write`, `index`, `review`, `map`
- Text-based search engine with decay scoring
- LanceDB vector search engine (optional)
- Platform integrations: Claude Code, Codex, Cursor
- YAML frontmatter for memory metadata
- Markdown memory files organized by type
- Configuration via `meta/config.yaml`
- Memory templates for each type (lesson, decision, workflow, architecture)

### Dependencies
- TypeScript 5.3.3
- Commander 12.0.0
- LanceDB 0.15.0 (optional)
- OpenAI SDK 4.104.0 (optional)
