# memobank-cli Implementation Plan
**Date:** 2026-03-17
**Spec:** docs/specs/2026-03-17-memobank-cli-design.md
**Goal:** Ship `memo` CLI on npm — `npm install -g memobank-cli`

---

## File Map

```
memobank-cli/
├── src/
│   ├── cli.ts                        # Entry point, command router
│   ├── types.ts                      # Shared interfaces
│   ├── config.ts                     # Read/write meta/config.yaml
│   ├── commands/
│   │   ├── install.ts                # memo install
│   │   ├── recall.ts                 # memo recall
│   │   ├── capture.ts                # memo capture
│   │   ├── write.ts                  # memo write
│   │   ├── search.ts                 # memo search
│   │   ├── index.ts                  # memo index
│   │   ├── review.ts                 # memo review
│   │   └── map.ts                    # memo map
│   ├── core/
│   │   ├── store.ts                  # File I/O, frontmatter parse/write
│   │   ├── embedder.ts               # OpenAI-compatible embedding abstraction
│   │   ├── retriever.ts              # Score fusion + decay
│   │   ├── decay-engine.ts           # Weibull decay scoring
│   │   ├── smart-extractor.ts        # LLM extraction + dedup
│   │   └── sanitizer.ts              # Strip secrets from content
│   ├── engines/
│   │   ├── engine-adapter.ts         # Shared EngineAdapter interface
│   │   ├── text-engine.ts            # Keyword + tag + decay search
│   │   └── lancedb-engine.ts         # Vector + BM25 hybrid (optional)
│   └── platforms/
│       ├── claude-code.ts            # autoMemoryDirectory in settings.json
│       ├── codex.ts                  # AGENTS.md injection
│       └── cursor.ts                 # .cursor/rules/memobank.mdc
├── package.json
├── tsconfig.json
└── README.md
```

---

## Tasks

### Task 1 — Project scaffold + package.json

```bash
cd memobank-cli/
npm init -y
npm install commander gray-matter js-yaml glob chalk
npm install -D typescript @types/node ts-node
npx tsc --init
```

**`package.json`** key fields:
```json
{
  "name": "memobank-cli",
  "version": "0.1.0",
  "bin": { "memo": "./dist/cli.js" },
  "main": "./dist/cli.js",
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/cli.ts",
    "prepublishOnly": "npm run build"
  },
  "optionalDependencies": {
    "vectordb": "^0.4",
    "openai": "^4"
  }
}
```

**`tsconfig.json`:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true
  }
}
```

Test: `npx ts-node src/cli.ts --version` prints `0.1.0`.

---

### Task 2 — `src/types.ts`

Define shared interfaces used across all modules:

```typescript
export type MemoryType = 'lesson' | 'decision' | 'workflow' | 'architecture';
export type Engine = 'text' | 'lancedb';
export type Confidence = 'low' | 'medium' | 'high';

export interface MemoryFile {
  path: string;           // absolute path to .md file
  name: string;           // frontmatter slug
  type: MemoryType;
  description: string;    // one-sentence summary
  tags: string[];
  created: string;        // ISO date
  updated?: string;
  review_after?: string;  // e.g. "90d"
  confidence?: Confidence;
  content: string;        // Markdown body (below ---)
}

export interface RecallResult {
  memory: MemoryFile;
  score: number;          // final composite score
}

export interface MemoConfig {
  project: { name: string; description?: string };
  memory: { token_budget: number; top_k: number };
  embedding: {
    engine: Engine;
    provider?: string;
    model?: string;
    base_url?: string;
    dimensions?: number;
  };
  search: { use_tags: boolean; use_summary: boolean };
  review: { enabled: boolean };
}
```

Test: All imports compile with `tsc --noEmit`.

---

### Task 3 — `src/core/store.ts`

File I/O layer. Reads and writes `.md` files with YAML frontmatter.

Key functions:
```typescript
// Find memobank root (--repo flag, MEMOBANK_REPO env, or ~/.memobank/<project>/)
export function findRepoRoot(cwd: string): string

// Load all memory files from a repo
export function loadAll(repoRoot: string): MemoryFile[]

// Load single file
export function loadFile(filePath: string): MemoryFile

// Write a new memory file (creates filename from name + created date)
export function writeMemory(repoRoot: string, memory: Omit<MemoryFile, 'path'>): string

// Update MEMORY.md with recall results
export function writeMemoryMd(repoRoot: string, results: RecallResult[], query: string): void
```

`findRepoRoot` resolution order:
1. `--repo` CLI flag
2. `MEMOBANK_REPO` env var
3. `meta/config.yaml` in cwd or parent dirs (walk up)
4. `~/.memobank/<git-repo-name>/`
5. `~/.memobank/default/`

Test: `loadAll()` on the memobank template repo returns 2 example files. `writeMemory()` creates a valid `.md` file with correct frontmatter.

---

### Task 4 — `src/core/decay-engine.ts`

Ported from `memory-lancedb-pro/decay-engine.ts`. Weibull decay model.

```typescript
// Returns a score 0–1 based on recency, access frequency, and confidence
export function computeDecayScore(memory: MemoryFile, now: Date): number
```

Formula: `score = recency_weight × frequency_weight × importance_weight`
- `recency_weight`: Weibull stretched-exponential decay from `created` date
- `frequency_weight`: 1.0 for now (incremented by future access tracking)
- `importance_weight`: `confidence` → `{ high: 1.0, medium: 0.7, low: 0.4 }`

Test: A memory created today scores > 0.9. A memory created 1 year ago with low confidence scores < 0.3.

---

### Task 5 — `src/engines/engine-adapter.ts` + `text-engine.ts`

**`engine-adapter.ts`** — shared interface:
```typescript
export interface EngineAdapter {
  search(query: string, memories: MemoryFile[], topK: number): Promise<RecallResult[]>
  index?(memories: MemoryFile[], incremental: boolean): Promise<void>
}
```

**`text-engine.ts`** — keyword + tag search:
```typescript
export class TextEngine implements EngineAdapter {
  async search(query: string, memories: MemoryFile[], topK: number): Promise<RecallResult[]>
  // 1. Tokenize query
  // 2. Score each memory: match against name + description + tags + content
  // 3. Apply decay score from decay-engine.ts
  // 4. Final: (text_score × 0.6) + (decay_score × 0.4)
  // 5. Return top-K sorted by final score
}
```

No `index()` needed for text engine — searches live files directly.

Test: `search("redis reliability", memories, 3)` returns the example lesson file with `tags: [redis, reliability]` in top result.

---

### Task 6 — `src/core/retriever.ts`

Orchestrates engine + formats output for MEMORY.md injection:

```typescript
export async function recall(
  query: string,
  repoRoot: string,
  config: MemoConfig
): Promise<{ results: RecallResult[]; markdown: string }>
```

Output markdown format (written to MEMORY.md and printed to stdout):
```markdown
<!-- Last updated: <ISO> | query: "<query>" | engine: text | top 3 of 47 -->

## Recalled Memory

### [lesson] Redis pool exhaustion · high confidence
> Use connection pooling with max=10; close connections in finally blocks.
> `lessons/2026-02-14-redis-pool.md` · tags: redis, reliability

### [workflow] Production deploy checklist
> 1. Run smoke tests 2. Check Redis health 3. Deploy blue-green 4. Monitor 5min
> `workflows/deploy-checklist.md` · tags: deploy, production

---
*3 of 47 memories · engine: text · ~280 tokens*
```

Token count appended to footer. If total exceeds `config.memory.token_budget`, truncate results.

Test: Output is valid Markdown. Token count is accurate. Empty repo returns graceful "no memories" message.

---

### Task 7 — `src/commands/recall.ts` + `src/commands/search.ts`

**`recall.ts`** — hot path, called by skill:
```typescript
// memo recall <query> [--top=5] [--engine=text|lancedb] [--format=json] [--dry-run]
// 1. Load config
// 2. Load all memories
// 3. Run retriever
// 4. Write MEMORY.md (unless --dry-run)
// 5. Print markdown to stdout
```

**`search.ts`** — manual debugging:
```typescript
// memo search <query> [--engine=...] [--tag=<tag>] [--type=<type>] [--format=json]
// Same as recall but never writes MEMORY.md, supports tag/type filters
```

Test: `memo recall "deploy"` prints markdown and updates MEMORY.md. `memo search "redis" --tag=reliability` returns only tagged results.

---

### Task 8 — `src/core/sanitizer.ts`

Strip secrets before writing memories:

```typescript
export function sanitize(content: string): string
```

Patterns to strip (replace with `[REDACTED]`):
- API keys: `sk-[A-Za-z0-9]{20,}`, `ghp_[A-Za-z0-9]{36}`, `Bearer [A-Za-z0-9._-]{20,}`
- IPs: IPv4 `\b\d{1,3}(\.\d{1,3}){3}\b`, IPv6
- JWT tokens: `eyJ[A-Za-z0-9._-]{50,}`
- `.env`-style: `[A-Z_]+=["']?[A-Za-z0-9/+]{20,}["']?`

Test: `sanitize("key=sk-abc123xyz890foobar12345")` returns `"key=[REDACTED]"`. Normal text passes through unchanged.

---

### Task 9 — `src/core/smart-extractor.ts`

LLM-powered extraction for `memo capture`. Ported from `memory-lancedb-pro`.

```typescript
export async function extract(
  sessionText: string,
  apiKey: string,
  model: string
): Promise<Omit<MemoryFile, 'path'>[]>
```

LLM prompt (system):
```
You extract structured memories from AI coding session summaries.
Return a JSON array. Each item:
{
  "name": "slug-format",
  "type": "lesson|decision|workflow|architecture",
  "description": "one sentence summary",
  "tags": ["tag1", "tag2"],
  "confidence": "low|medium|high",
  "content": "markdown body with the full insight"
}
Extract only significant learnings. Skip trivial actions. Max 3 items per session.
```

Falls back to no-op if no API key configured — `memo capture` prints a warning and exits cleanly.

Test: Extract from a sample session text returns 1–3 items with valid types and non-empty descriptions.

---

### Task 10 — `src/commands/capture.ts`

```typescript
// memo capture [--session=<text>] [--auto]
// --auto: reads recently modified files in memory/ dir (Claude auto-memory output)
// 1. Get session text (from --session, stdin, or --auto file read)
// 2. Run sanitizer
// 3. Run smart-extractor (LLM call)
// 4. Deduplicate against existing memories (name hash for text engine)
// 5. Write new .md files
// 6. Run incremental index update
// 7. Print: "Captured N memories"
```

Test: `echo "We fixed a Redis timeout by using connection pooling" | memo capture --session=-` creates one lesson file in `lessons/`.

---

### Task 11 — `src/commands/write.ts`

Interactive + non-interactive memory creation:

```typescript
// memo write <type> [--name=<n>] [--description=<d>] [--tags=<t,t>] [--content=<c>]
// Non-interactive: all flags provided → write immediately
// Interactive: opens $EDITOR with pre-filled template
```

Non-interactive example:
```bash
memo write lesson \
  --name="redis-pool-exhaustion" \
  --description="Use connection pooling with max=10" \
  --tags="redis,reliability" \
  --content="## Problem\n..."
```

Test: Running with all flags creates valid `.md` file. Running without flags and `EDITOR=cat` prints the template to stdout.

---

### Task 12 — `src/commands/index.ts`

```typescript
// memo index [--incremental] [--engine=lancedb] [--force]
// text engine: no-op (searches live files)
// lancedb engine:
//   1. Load all memories
//   2. --incremental: check git diff / file mtimes for changed files only
//   3. Generate embeddings via embedder.ts
//   4. Upsert into LanceDB table
//   5. Print: "Indexed N memories (X new, Y updated)"
```

Test (text): `memo index` exits cleanly with message "text engine: no index needed". Test (lancedb): Skipped if no API key — prints clear instructions.

---

### Task 13 — `src/commands/review.ts` + `src/commands/map.ts`

**`review.ts`:**
```typescript
// memo review [--due]
// Parse review_after field (e.g. "90d") + created date
// List memories past their review date
// --due: only show overdue items
```

**`map.ts`:**
```typescript
// memo map [--type=<type>]
// Print summary table:
//   Total: 47 memories
//   By type: lesson (23) | decision (12) | workflow (8) | architecture (4)
//   Top tags: redis (8), reliability (6), deploy (5)
//   Recent: last 5 added
```

Test: Both commands run on the template repo without errors.

---

### Task 14 — `src/platforms/` — install helpers

**`claude-code.ts`:**
```typescript
// Read ~/.claude/settings.json (or create if missing)
// Set: { "autoMemoryDirectory": "<repoRoot>/memory/" }
// Write back
```

**`codex.ts`:**
```typescript
// Find AGENTS.md in cwd
// Append memory protocol section (from embedded template string)
// Idempotent: skip if "memobank" already present
```

**`cursor.ts`:**
```typescript
// Create .cursor/rules/ if missing
// Write memobank.mdc with memory protocol content
```

Test: Each function is idempotent — running twice produces same result.

---

### Task 15 — `src/commands/install.ts`

Orchestrates all platform installs:

```typescript
// memo install [--repo <path>] [--claude-code] [--codex] [--cursor] [--all]
// 1. Detect git repo root + project name
// 2. Resolve memobank root (Mode A: --repo, Mode B: ~/.memobank/<project>/)
// 3. Create directory structure if missing
// 4. Write meta/config.yaml if missing
// 5. Run selected platform installs
// 6. Print success summary with next steps
```

Test: Running `memo install --all` in a git repo creates `~/.memobank/<project>/` with correct structure and updates `~/.claude/settings.json`.

---

### Task 16 — `src/cli.ts` — entry point

Wire all commands with Commander.js:

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
const program = new Command();
program.name('memo').version('0.1.0').description('memobank CLI');

program.command('install').description('...').action(...)
program.command('recall <query>').description('...').action(...)
program.command('capture').description('...').action(...)
program.command('write <type>').description('...').action(...)
program.command('search <query>').description('...').action(...)
program.command('index').description('...').action(...)
program.command('review').description('...').action(...)
program.command('map').description('...').action(...)
program.command('config').description('...').action(...)

program.parse();
```

Test: `memo --help` shows all commands. `memo recall --help` shows flags.

---

### Task 17 — `src/engines/lancedb-engine.ts` (optional, last)

Implement only after all other tasks are complete and tested.

```typescript
export class LanceDbEngine implements EngineAdapter {
  async search(query: string, memories: MemoryFile[], topK: number): Promise<RecallResult[]>
  async index(memories: MemoryFile[], incremental: boolean): Promise<void>
}
```

Port from `memory-lancedb-pro`:
- `store.ts` → LanceDB table creation and upsert
- `embedder.ts` → OpenAI-compatible embedding call
- `retriever.ts` → hybrid fusion (vector × 0.7 + BM25 × 0.3)
- Decay boost applied after fusion

Wrapped in `try/catch` with clear error if `vectordb` package not installed:
```
LanceDB engine requires: npm install vectordb openai
Or use the default text engine (no setup needed).
```

Test: Skip in CI if no `MEMO_EMBEDDING_API_KEY`. Manual test: `memo search "redis" --engine=lancedb` returns semantic matches.

---

### Task 18 — Build + publish prep

```bash
npm run build           # tsc → dist/
node dist/cli.js --help # smoke test built output
```

**`README.md`** key sections:
- Install: `npm install -g memobank-cli`
- Quick start: `memo install && memo recall "project setup"`
- Command reference table
- Engine upgrade guide (text → lancedb)
- Platform support table (Claude Code / Codex / Cursor)

Test: `npm pack --dry-run` shows correct files. `node dist/cli.js recall "test"` runs without error in a fresh temp directory.
