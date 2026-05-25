# memobank — Without the CLI

The skill works without `memobank-cli`. Functionality is reduced but still useful.

## What works without CLI

- **MEMORY.md is read at session start** — via the `cat` fallback in `recall-context.sh`
- **You can manually write memories** — directly to `.memobank/MEMORY.md` in Markdown format
- **Claude's native auto-memory** — still writes to the configured directory if `autoMemoryEnabled` is set

## What requires CLI

- **Smart extraction** (`memo capture --auto`) — automatic extraction from conversation transcripts
- **Structured memory files** — separate `lesson/`, `decision/`, etc. directories per tier
- **Semantic search** (`memo recall`) — keyword + decay scoring over all memory files
- **Vector search** (LanceDB engine) — requires CLI and configured index
- **Workspace sharing** — `memo workspace init/sync/publish`
- **Secret scanning** — `memo scan`

## Manual memory format (without CLI)

Add entries to `.memobank/MEMORY.md` in your project:

```markdown
# Project Memory — <project>

## [lesson] Redis pool exhaustion (2026-03-17)

**Tags:** redis, reliability

Use connection pooling with max=10. Close connections in finally blocks.

---

## [decision] Chose blue-green deploy (2026-03-17)

**Tags:** deploy, infrastructure

Avoids downtime during deploy. Requires load balancer config. Trade-off: slower rollback.

---

## [workflow] Local testing with mocked APIs (2026-03-17)

**Tags:** testing, devops

1. Start mock server on localhost:9999
2. Set MOCK_API_URL env var
3. Run pytest
4. Verify in mock logs
```

## How fallback retrieval works

The `recall-context.sh` script attempts these in order:

1. `memo recall "$ARGUMENTS" --code --silent` — CLI retrieval (writes MEMORY.md)
2. `cat .memobank/MEMORY.md` — fallback: last cached MEMORY.md in project tier
3. `echo "(no memory configured...)"` — final: graceful message

## Installing the CLI

```bash
npm install -g memobank-cli
cd /path/to/your/project
memo init    # or memo onboarding for interactive TUI
```

## When to upgrade to CLI

- You have >20 memories and manual upkeep is painful
- You want automatic capture from Claude's conversation transcripts
- You want to share memories with your team via workspace tier
- You need semantic search or LanceDB vector search
- You want session checkpoints written automatically at session end

## See also

- `references/memory-protocol.md` — memory write templates
- `references/claude-code.md` — Claude Code setup with CLI
