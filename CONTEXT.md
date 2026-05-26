# Memobank CLI

A persistent memory system for AI coding agents. It captures structured knowledge from coding sessions and recalls it on demand, using a three-tier storage model (project, personal, workspace).

## Language

### Memory system

**Memory**: A structured piece of knowledge extracted from a coding session — a lesson, decision, workflow, or architecture note. Stored as a Markdown file with YAML frontmatter.
_Avoid_: Note, entry, record, snippet

**Capture**: The act of extracting Memories from a raw session transcript using an LLM. Produces `ExtractionResult[]` which are then written to the pending queue. Triggered by `memo capture --auto` at session end.
_Avoid_: Extract, ingest, parse, analyze

**Memorize**: The act of an AI agent directly writing a Memory during active reasoning — no LLM extraction step. The agent supplies structured content (name, description, body) and the CLI writes it to the pending queue immediately. CLI command: `memo remember`. Distinguished from Capture in that the agent IS the author, not the subject of extraction.
_Avoid_: Instant capture, quick capture, inline capture

**Recall**: The act of retrieving the most relevant Memories for a given query. Ranks results using keyword scoring, tag matching, and optional vector similarity.
_Avoid_: Search, fetch, look up, query

**Tier**: One of three storage scopes — Project (committed to the repo), Personal (local to the user, not committed), Workspace (shared across repos via a separate remote).
_Avoid_: Level, layer, scope, namespace

### Provider system

**Provider**: An external service integration that powers one capability — Capture, embedding, or reranking. Each Provider is identified by a name string that belongs to exactly one Provider Name Union.
_Avoid_: Backend, adapter, integration, service

**Local Provider**: A Provider that runs on the user's machine and requires no API key (e.g. Ollama, llama.cpp, oMLX).
_Avoid_: Offline provider, self-hosted provider

**Cloud Provider**: A Provider that requires an API key from the environment (e.g. Anthropic, OpenAI, Jina).
_Avoid_: Remote provider, hosted provider, API provider

**Provider Name Union**: The TypeScript union type in `types.ts` that enumerates valid names for a given Provider category (`CaptureProviderName`, `EmbeddingProvider`, `RerankerProvider`). Adding a new Provider requires widening the relevant union — this is the intended and only extension point.
_Avoid_: Provider enum, provider list, allowed providers

**Provider Descriptor**: An object that bundles all metadata and factory logic for one Provider. Lives in a Registry. Contains: display label, `requiresApiKey` flag, `requiresBaseUrlStep` flag (wizard routing), `showInWizard` flag (embedding only), API key env var name, default base URL, default model, factory methods to list models and instantiate the Provider, and an optional `testConnection` method (local providers only) to probe the server at setup time.
_Avoid_: Provider config, provider definition, provider entry

**Registry**: A `Map` keyed by Provider name that holds one Descriptor per Provider. One Registry exists per capability (Capture, Embedding, Reranker). Callers do a single lookup instead of branching on provider name.
_Avoid_: Factory map, provider map, dispatch table

### Session system

**Code Reference** (`code_refs`): A frontmatter field in a Memory that explicitly links it to one or more source files or symbols. Format: `file/path.ts` (file-level) or `file/path.ts::symbolName` (symbol-level). Source of truth for code-memory associations. Populated at Capture time by LLM extraction and at Memorize time by the agent explicitly passing `--code-refs`. Indexed into `symbols.memory_refs` by `memo index-code`.
_Avoid_: Code link, code annotation, source reference

**Session Snapshot**: A `workflow`-type Memory auto-generated at the end of each session by `capture --auto`. Records branch name, last commit, changed files, the list of Memories extracted in that session, and any unfinished work. Name pattern: `session-<YYYY-MM-DD>-<branch-slug>`. Distinguished from other workflow Memories by `tags: [session]`. Lives in `.memobank/workflow/`.
_Avoid_: Session summary, session log, session record

**Harness**: An external task-management system (e.g. GSD Redux) that manages planning state via `.planning/STATE.md` and `.planning/phases/XX/.continue-here.md`. memobank treats Harness files as **optional enhancement signals** — memobank operates fully without them. When present, `session_status: idle` in `STATE.md` upgrades Capture input quality by providing `.continue-here.md` as a structured source; all other states (missing file, missing field, `in_progress`, parse error) fall back to transcript extraction silently.
_Avoid_: Planning system, GSD, task runner

**Planning State** (`STATE.md`): A YAML-frontmatter + Markdown file at `.planning/STATE.md` maintained by the Harness. The "Session Continuity" section in the Markdown body contains two fields memobank reads: `session_status` (`idle` or `in_progress`) and `Resume file` (path to the active `.continue-here.md`). Written by `session-start` skill (`in_progress`) and `context-handover` skill (`idle`). memobank reads this file as a hint only — parse errors are silently ignored.
_Avoid_: State file, session state, GSD state
