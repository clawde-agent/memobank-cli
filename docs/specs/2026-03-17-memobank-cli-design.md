# memobank-cli — Design Spec
**Date:** 2026-03-17
**Status:** Draft
**Role in system:** Execution layer — CLI tool and engine adapters

---

## 1. Purpose

`memobank-cli` is a TypeScript/Node.js CLI published on npm as `memobank-cli`. It provides the `memo` command: the interface between the user/agent and the memobank data layer.

It handles retrieval, capture, indexing, and installation. The core retrieval and extraction logic is ported from `memory-lancedb-pro` (MIT), adapted for the memobank schema and multi-engine architecture.

---

## 2. Design Goals

1. **Zero-config for Mode B** — `npm install -g memobank-cli && memo install` works in 30 seconds with no API keys
2. **Pluggable engines** — `text` (default, zero deps) → `lancedb` (upgrade path)
3. **Agent-friendly output** — all commands support `--format=json` and `--quiet` for scripting
4. **Port memory-lancedb-pro core** — reuse hybrid retrieval, smart extraction, decay engine
5. **Cross-platform** — macOS, Linux, Windows (Node.js 18+)

---

## 3. Commands

```
memo install [--repo <path>] [--claude-code] [--codex] [--cursor]
memo recall <query> [--top=5] [--engine=text|lancedb] [--format=json]
memo capture [--session=<summary>] [--auto]
memo write <type> [--title=<t>] [--tags=<t,t>]
memo search <query> [--engine=text|lancedb] [--tag=<tag>] [--type=<type>]
memo index [--incremental] [--engine=lancedb]
memo review [--due]
memo map [--type=<type>]
memo config [get|set] <key> [value]
```

### Command details

#### `memo install`
The setup command. Idempotent — safe to run multiple times.

```
--repo <path>     Point to an existing memobank repo (Mode A)
                  If omitted, creates ~/.memobank/<project>/ (Mode B)
--claude-code     Write autoMemoryDirectory to ~/.claude/settings.json
--codex           Inject memory protocol into AGENTS.md
--cursor          Write to .cursor/rules/memobank.mdc
--all             All supported platforms (default when no flag given)
```

Actions performed:
1. Detect git repo name → determine project key
2. Create or validate memobank directory structure
3. Write `meta/config.yaml` if missing
4. Set `autoMemoryDirectory` in Claude Code settings (if `--claude-code` or `--all`)
5. Print next steps

#### `memo recall <query>`
The hot path — called by `memobank-skill` via `!`memo recall "$ARGUMENTS"`` before every session.

1. Read `meta/config.yaml` to determine engine
2. Run retrieval (text keyword match or lancedb hybrid)
3. Apply decay scoring (recency + frequency + importance)
4. Write top-N results to `memory/MEMORY.md`
5. Print the MEMORY.md content to stdout (for `!`memo recall`` injection)

```
--top=N           Return top N memories (default: 5)
--engine=...      Override engine for this call
--format=json     Output raw JSON array instead of Markdown
--dry-run         Print without writing MEMORY.md
```

#### `memo capture`
Called by `hooks.Stop` in `memobank-skill`. Extracts learnings from the current session.

```
--session=<text>  Summary text to extract from (piped or passed directly)
--auto            Read from ~/.claude/projects/<project>/memory/ recent writes
```

Process:
1. Receive session summary (from hook stdio or `--session`)
2. Run smart extractor (LLM call: classify into lesson/decision/workflow)
3. Run sanitizer (strip API keys, IPs, tokens via regex patterns)
4. Deduplicate against existing memories (vector similarity if lancedb, title hash if text)
5. Write new `.md` file(s) to appropriate directory (`lessons/`, `decisions/`, etc.)
6. Update index incrementally

#### `memo write <type>`
Interactive memory creation. Opens `$EDITOR` or uses `--title`/`--tags`/`--content` flags for non-interactive use.

```
memo write lesson --title="Redis pool exhaustion" --tags="redis,reliability" --content="..."
```

#### `memo search <query>`
Direct search without updating MEMORY.md. For manual use and debugging.

```
--engine=...      text (default) | lancedb
--tag=<tag>       Filter by tag
--type=<type>     Filter by memory type
--format=json     JSON output
```

#### `memo index`
Build or update the search index.

```
--incremental     Only index changed/new files (git diff based)
--engine=lancedb  LanceDB vector DB (requires embedding API key)
--force           Rebuild from scratch
```

#### `memo review`
List memories where `review_after` has expired.

```
--due             Only show overdue items
--format=json
```

#### `memo map`
Print a summary of the memory graph: counts by type, tag frequency, recent additions.

---

## 4. Architecture

```
memobank-cli/
├── src/
│   ├── cli.ts                  # Entry point, command routing (commander.js)
│   ├── commands/
│   │   ├── install.ts
│   │   ├── recall.ts
│   │   ├── capture.ts
│   │   ├── write.ts
│   │   ├── search.ts
│   │   ├── index.ts
│   │   ├── review.ts
│   │   └── map.ts
│   ├── core/                   # Ported from memory-lancedb-pro (MIT)
│   │   ├── store.ts            # File I/O: read/write .md files, parse frontmatter
│   │   ├── embedder.ts         # OpenAI-compatible embedding abstraction
│   │   ├── retriever.ts        # Hybrid fusion: text + vector, decay scoring
│   │   ├── decay-engine.ts     # Weibull decay: recency × frequency × importance
│   │   ├── smart-extractor.ts  # LLM extraction: classify + deduplicate
│   │   └── sanitizer.ts        # Strip secrets: regex patterns for keys/IPs/tokens
│   ├── engines/
│   │   ├── text-engine.ts      # Pure text: keyword + tag + summary search (default)
│   │   └── lancedb-engine.ts   # LanceDB: vector + BM25 hybrid (optional)
│   ├── platforms/              # Platform-specific install helpers
│   │   ├── claude-code.ts      # Writes autoMemoryDirectory to settings.json
│   │   ├── codex.ts            # Injects memory protocol into AGENTS.md
│   │   └── cursor.ts           # Writes to .cursor/rules/memobank.mdc
│   ├── config.ts               # Read/write meta/config.yaml
│   └── types.ts                # Shared TypeScript interfaces
├── package.json
├── tsconfig.json
└── README.md
```

---

## 5. Engine Adapters

Two engines form a progressive upgrade path — switch by changing one line in `meta/config.yaml`.

| Engine | Scale | Deps | API Key | Install size |
|---|---|---|---|---|
| `text` | <1k memories | none | none | 0 MB |
| `lancedb` | >1k | native bindings | embedding provider | ~50 MB |

Both engines share the same interface (`EngineAdapter`) and are swappable at runtime.

### text-engine (default)

Zero external dependencies. Uses:
- **Keyword search**: tokenize query, match against `name + description + tags + content`
- **Tag filter**: exact match on `tags[]`
- **Type filter**: exact match on `type`
- **Recency sort**: combine match score with `decay-engine.ts` score
- **Result**: top-N sorted by `(text_score × 0.6) + (decay_score × 0.4)`

No API key required. Works immediately after `npm install -g memobank-cli`.

### lancedb-engine (upgrade)

Activated with `engine: lancedb` in `meta/config.yaml` or `--engine=lancedb`.

Ported directly from `memory-lancedb-pro`:
- **Vector search**: LanceDB ANN (cosine distance) on embeddings
- **BM25 full-text search**: LanceDB FTS index on `name + description + content`
- **Hybrid fusion**: `vector_score × 0.7 + bm25_score × 0.3`
- **Reranking**: cross-encoder via Jina/SiliconFlow (optional, configured in `meta/config.yaml`)
- **Decay boost**: `retriever.ts` applies Weibull scores after fusion

Best for >10k memories or teams needing maximum recall quality.

Requires: embedding provider API key + native build tools (LanceDB has Rust bindings).

---

## 6. Smart Extractor (capture)

Ported from `memory-lancedb-pro/smart-extractor.ts`, adapted to memobank schema.

**Input:** session summary text (from hook or `--session`)

**Process:**
1. **Classification prompt** → LLM returns: `type` (lesson/decision/workflow/architecture), `title`, `tags`, `summary`, `confidence`, `content`
2. **Deduplication:**
   - `text` engine: hash `name` → skip if exists
   - `lancedb` engine: vector similarity ≥ 0.7 → LLM decides CREATE/MERGE/SKIP
3. **Sanitization:** strip patterns matching `sk-...`, `ghp_...`, IPv4/6, JWT tokens
4. **Write:** generate `.md` file with frontmatter, save to correct directory

**LLM call:** uses the same model Claude Code is using (read from env `ANTHROPIC_API_KEY` or config). Falls back to `--session` text passthrough with no extraction if no API key.

---

## 7. Installation Flow (`memo install`)

```
memo install --all
  1. Detect: git rev-parse --show-toplevel → project root + name
  2. Detect: mode A (--repo) or mode B (auto ~/.memobank/<project>/)
  3. Create directory structure (idempotent)
  4. Write meta/config.yaml if missing
  5. Platform installs:
     Claude Code: read ~/.claude/settings.json → set autoMemoryDirectory → write back
     Codex:       find AGENTS.md → append ## Memory Protocol section
     Cursor:      write .cursor/rules/memobank.mdc
  6. Print:
     ✓ memobank ready at ~/.memobank/my-project/
     ✓ Claude Code: autoMemoryDirectory configured
     ✓ Run: memo recall "project context" to test
```

---

## 8. Configuration Resolution

Priority (highest to lowest):
1. CLI flags (`--engine=lancedb`)
2. Environment variables (`MEMO_ENGINE=lancedb`)
3. `meta/config.yaml` in the memobank repo
4. `~/.memobank/config.yaml` (global user defaults)
5. Built-in defaults (engine: text, top_k: 5, token_budget: 500)

---

## 9. Dependencies

### Runtime (minimal)
```json
{
  "commander": "^12",          // CLI framework
  "gray-matter": "^4",         // YAML frontmatter parsing
  "js-yaml": "^4",             // YAML read/write
  "glob": "^11",               // File discovery
  "chalk": "^5"                // Terminal colors
}
```

### Optional (lancedb engine)
```json
{
  "vectordb": "^0.4",          // LanceDB Node.js bindings (Rust-based)
  "openai": "^4"               // OpenAI-compatible embeddings client
}
```

Optional deps are `optionalDependencies` in `package.json` — not installed unless user runs `memo install --engine=lancedb`.

---

## 10. Design Decisions

**Why port from memory-lancedb-pro rather than reimplementing?**
The Weibull decay engine and hybrid fusion scoring in memory-lancedb-pro are battle-tested. The MIT license allows direct reuse. Reimplementing would introduce bugs and divergence.

**Why Commander.js over yargs/oclif?**
Commander is minimal, widely understood, and has zero transitive deps. This CLI doesn't need plugin systems.

**Why separate `recall` from `search`?**
`recall` is the hot path: it writes MEMORY.md and returns formatted Markdown for context injection. `search` is for human debugging. Different output formats, different side effects.

**Why `optionalDependencies` for LanceDB?**
LanceDB has native bindings that add ~50MB to install size and require build tools. Making it optional keeps the default install fast and dependency-free for Mode B users.
