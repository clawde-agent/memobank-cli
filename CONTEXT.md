# Memobank CLI

A persistent memory system for AI coding agents. It captures structured knowledge from coding sessions and recalls it on demand, using a three-tier storage model (project, personal, workspace).

## Language

### Memory system

**Memory**: A structured piece of knowledge extracted from a coding session — a lesson, decision, workflow, or architecture note. Stored as a Markdown file with YAML frontmatter.
_Avoid_: Note, entry, record, snippet

**Capture**: The act of extracting Memories from a raw session transcript using an LLM. Produces `ExtractionResult[]` which are then written to the pending queue.
_Avoid_: Extract, ingest, parse, analyze

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
