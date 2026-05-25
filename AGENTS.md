# Agent Guidelines — memobank-cli

## Commands

```bash
npm run build          # compile TypeScript → dist/
npm run dev            # run CLI with ts-node (no build needed)
npm test               # Jest (requires Node 22, --experimental-vm-modules)
npm run test:watch     # watch mode
npm run test:coverage  # with coverage report
npm run lint           # ESLint on src/**/*.ts
npm run lint:fix       # auto-fix lint issues
npm run typecheck      # tsc --noEmit (strict mode)
npm run format         # Prettier on src/ and tests/
```

Run a single test file:

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/store.test.ts
```

CLI binary is `memo` (dist/cli.js). During development: `npm run dev -- <command>`.

## Memory Protocol (Cursor/Copilot)

Before starting work:

```bash
memo recall "project context"
```

After finishing work:

```bash
memo capture --auto
```

Other useful commands: `memo search`, `memo write <type>`, `memo map`, `memo review`, `memo --help`.

## Architecture Overview

Persistent memory system with a three-tier model:

| Tier      | Location                         | Committed? | Purpose               |
| --------- | -------------------------------- | ---------- | --------------------- |
| Personal  | `~/.memobank/<project-name>/`    | No         | Private lessons       |
| Project   | `.memobank/` in repo             | Yes        | Shared team knowledge |
| Workspace | `~/.memobank/_workspace/<name>/` | Separate   | Org-wide patterns     |

Recall priority: **Project > Personal > Workspace** (higher tier wins on duplicate filenames).

Memory files are Markdown with YAML frontmatter (via `gray-matter`). Types: `lesson`, `decision`, `workflow`, `architecture`. Statuses: `experimental` → `active` → `needs-review` → `deprecated`.

### Source Layout

```
src/
  cli.ts           # Commander CLI entry point (register all commands here)
  types.ts         # Shared types (MemoryFile, MemoConfig, etc.)
  core/            # store, config, retriever, lifecycle-manager, sanitizer, embedding
  commands/        # One file per CLI subcommand
  engines/         # text-engine (default, zero-deps), lancedb-engine (optional)
  platforms/       # Per-tool adapters (Claude Code, Cursor, Codex, Gemini, Qwen)
tests/             # Jest files mirroring src/ structure
```

### Key Design Decisions

- **Text engine is zero-dependency** (default). LanceDB is optional for vector search, selected via config `engine: text | lancedb`.
- **Secret sanitization** auto-runs before any memory write — 20+ patterns (API keys, JWTs, AWS credentials, etc.).
- **Lifecycle tracking** via access logs + epoch scoring. Auto-demotes stale memories.
- **Async pending queue**: `memo capture` writes to `.pending/*.json` then calls `processQueue()`. Queue drains on `memo process-queue` and the Claude Code Stop hook.
- **Project boundary**: pending entries stamped with `projectId` (git remote → `config.project.name` → dirname). `processQueue` deletes cross-project entries. `workspace publish` rejects mismatched memories.
- **Two-stage dedup** in `processQueue`: Jaccard similarity (word + trigram) Stage 1, optional LLM batch Stage 2.
- **React/Ink** for interactive prompts (onboarding wizard, selection menus).
- ESLint enforces: no `any`, explicit return types, `type`-only imports.

## Code Style

- **TypeScript strict mode** (`noImplicitReturns`, `noFallthroughCasesInSwitch`, `noImplicitOverride`).
- **Explicit return types** on all functions (ESLint `explicit-function-return-type`).
- **Type-only imports** must use `import type` modifier.
- **No `any`** — use `unknown` + type guards, or specific error types. Cast with `(error as Error).message` in catch blocks.
- **Prettier**: semicolons, single quotes, tabWidth 2, trailingComma es5, printWidth 100, LF line endings.
- **Naming**: PascalCase for classes/types/interfaces, camelCase for functions/variables. Command files: `<kebab-case>.ts` → exported function/command name in camelCase.
- **Error handling**: `try/catch` with typed casts. CLI commands exit with code 1 and `console.error(`Error: ${msg}`)` on failure.
- **Imports**: Node builtins (`fs`, `path`) first, then third-party (`commander`, `chalk`), then local (`./core/store`).
- **No `console.log`** in production code paths — use structured logging or return values. CLI commands output via `process.stdout` / `console.error`.
- **Tests** mirror `src/` structure, use Jest with `ts-jest` preset. 30-second timeout per test. Coverage thresholds at 30-45%.

## Adding a New CLI Command

1. Create `src/commands/<name>.ts` with exported function.
2. Register in `src/cli.ts` with `.command()` and `.action()`.
3. Create `tests/commands/<name>.test.ts`.
4. Add options with `--option <value>` or `--option <values>`.

## File I/O

Use `findRepoRoot()` to locate the project root. Use `loadConfig()` to read `.memobank/config.yaml`. All write paths go through `store.ts` which handles three-tier resolution. Pending captures write to `.pending/*.json` first.

## Git Hooks

- **pre-commit**: runs `memo scan --staged` to reject secrets in staged files.
- **commit-msg**: commitlint conventional commits.
- **prepare**: `husky` initializes hooks on `npm install`.
