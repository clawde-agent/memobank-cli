---
name: memobank-cli
description: >
  Developer skill for contributing to the memobank-cli codebase. Covers
  architecture (three-tier memory, async queue, commands), build/test/lint
  quality gates, adding CLI commands, and debugging capture/recall pipelines.
  Use when: working on memobank-cli source code, adding a new memo subcommand,
  debugging capture/recall behaviour, writing tests, or reviewing PRs in this
  repo. NOT for: using memobank as a memory tool (see the memobank skill);
  general TypeScript or Node.js questions unrelated to this codebase.
user-invocable: true
disable-model-invocation: false
allowed-tools: 'Bash(npm *), Bash(git *), Bash(npx *), Read, Edit, Write, Grep, Glob'
---

# memobank-cli Developer Skill

## Quality gates — run before every commit

```bash
npm run typecheck          # tsc --noEmit (must pass — 0 errors)
npm run lint               # ESLint (0 errors required; warnings OK)
NODE_OPTIONS=--experimental-vm-modules npx jest tests/<file>.test.ts --no-coverage
```

Never modify `dist/` directly. Build via `npm run build`.

## Architecture in one page

**Three-tier model** (recall priority: Project > Personal > Workspace)

| Tier      | Path                                      | Committed       |
| --------- | ----------------------------------------- | --------------- |
| Project   | `.memobank/` in repo                      | Yes             |
| Personal  | `~/.memobank/<project>/`                  | No              |
| Workspace | `~/.memobank/_workspace/` or `local_path` | Separate remote |

**Async capture pipeline**

```
conversation transcript (.jsonl)
  → memo capture --auto           (transcript-parser → smart-extractor → LLM)
  → .pending/<id>.json            (writePending)
  → memo process-queue            (dedup → write to .memobank/<type>/<name>.md)
```

Key invariant: `projectId` stamps every pending entry. `processQueue` deletes cross-project entries.

**Search pipeline**: `memo recall` → retriever → text-engine (default) or lancedb → RRF merge → decay score → MEMORY.md

## Adding a new command

1. Create `src/commands/<name>.ts` — export the async handler
2. Register in `src/cli.ts` — follow the `program.command(...)` pattern
3. Create `tests/<name>.test.ts`
4. Run typecheck + lint + test

See [references/adding-commands.md](references/adding-commands.md) for patterns and examples.

## Debugging capture / recall

```bash
# Verify transcript directory is found (Windows: D--Repo-... not D:\Repo\...)
node -e "const {getTranscriptDir}=require('./dist/core/transcript-parser');console.log(getTranscriptDir(process.cwd()))"

# Dry-run capture without writing
npx ts-node src/cli.ts capture --auto   # shows sessions found + extracted memories

# Check what's in pending queue
ls .memobank/.pending/ 2>/dev/null || echo "queue empty"

# Force-drain queue
npx ts-node src/cli.ts process-queue
```

For detailed troubleshooting see [references/debugging.md](references/debugging.md).

## Key source locations

| What                                       | Where                                              |
| ------------------------------------------ | -------------------------------------------------- |
| CLI entry / command registration           | `src/cli.ts`                                       |
| Three-tier store, `resolveWorkspaceDir`    | `src/core/store.ts`                                |
| Transcript parsing, `deriveProjectId`      | `src/core/transcript-parser.ts`                    |
| LLM extraction dispatch                    | `src/core/capture-provider.ts`                     |
| OpenAI-compat provider (Ollama / llamacpp) | `src/core/providers/openai-compat.ts`              |
| Search orchestration + ranking             | `src/core/retriever.ts`                            |
| Pending queue + dedup                      | `src/core/queue-processor.ts`, `src/core/dedup.ts` |
| Shared types                               | `src/types.ts`                                     |
