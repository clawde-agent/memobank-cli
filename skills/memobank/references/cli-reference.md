# memobank CLI Reference

Complete command reference for `memo` CLI.

---

## Setup & Installation

```bash
# First-time setup
memo init                                    # auto-detect project name + platforms; auto-runs memo index-code after
memo init --interactive                      # full TUI wizard (requires interactive terminal)
memo init --platform claude-code,cursor      # install specific platforms (comma-separated)
memo onboarding                              # interactive wizard; in non-interactive environments use memo init instead

# Lower-level directory setup
memo install                                 # set up .memobank/ directory structure
memo install --platform <name>               # with platform adapter
memo install --repo <path>                   # point to existing memobank repo

# Tier initialization (non-interactive, for scripting)
memo tier-init                               # project tier (default)
memo tier-init --global                      # personal tier in ~/.memobank/<project>/
memo tier-init --name <name>                 # specify project name
```

---

## Recall & Search

```bash
memo recall "query"                          # search all tiers (writes to MEMORY.md)
memo recall "query" --top <number>           # number of results (default: 5)
memo recall "query" --engine lancedb         # search engine (text|lancedb, default: text)
memo recall "query" --format json            # output format (text|json, default: text)
memo recall "query" --code                   # dual-track: memories + code symbols + graph expansion
memo recall "query" --refs <symbol>          # call-graph: callers of a function
memo recall "query" --scope personal         # personal tier only
memo recall "query" --scope project          # project tier only
memo recall "query" --scope workspace        # workspace tier only
memo recall "query" --explain                # show score breakdown (keyword/tags/recency)
memo recall "query" --dry-run                # print without writing MEMORY.md
memo recall "query" --repo <path>            # specify memobank repo path
memo recall "query" --silent                 # suppress stdout output

memo search "query"                          # debug search — does NOT update MEMORY.md
memo search "query" --engine lancedb         # vector search (if configured)
memo search "query" --tag <tag>              # filter by tag
memo search "query" --type <type>            # filter by type
memo search "query" --format json            # output format (text|json, default: text)
```

---

## Writing Memories

```bash
memo write <type> --name="..." --description="..." --tags="..." --content="..."
memo write <type> --symbol <symbol>          # anchor memory to a code symbol
memo write <type> --repo <path>              # specify memobank repo path
memo write <type> --silent                   # suppress stdout output
```

Types: `lesson` | `decision` | `workflow` | `architecture`

---

## Study & Promote

```bash
memo study [lesson-name]                     # promote lesson to CLAUDE.md conditional block
memo study --list                            # list available lessons
memo study --if <condition>                  # specify condition (skips interactive prompt)
memo study --auto                            # scan access logs, identify high-recall lessons, write meta/study-suggestions.json
memo study --auto --silent                   # same, suppress output (used by Stop hook)
```

---

## Map & Stats

```bash
memo map                                     # show memory summary and statistics
memo map --type <type>                       # filter by type
```

---

## Code Indexing

```bash
memo index-code [path]                       # index codebase symbols for recall --code
memo index-code --summarize                  # write architecture memory after indexing (replaces previous auto-generated snapshot)
memo index-code --langs ts,go                # limit to specific languages
memo index-code --force                      # re-index all files (ignore hash cache)
memo index-code --incremental --files <...>  # hook mode: re-index only specified files (post-commit hook)
```

`memo index-code` builds a `memory_edges` table linking symbols → memories (`mentions` edges) and memories → related memories (`related_to` edges via tag Jaccard overlap). This enables graph-expanded recall via `memo recall --code`.

---

## Search Index

```bash
memo index                                   # build or update search index
memo index --incremental                     # only index changed files
memo index --force                           # force full rebuild
memo index --engine lancedb                  # use vector engine
```

---

## Lifecycle Management

```bash
memo lifecycle                               # view lifecycle report
memo lifecycle --scan                        # run full scan, downgrade stale memories + prune orphaned access logs (CI)
memo lifecycle --prune                       # delete all deprecated memories and clean orphaned access logs
memo lifecycle --reset-epoch                 # reset epoch for team handoff
memo lifecycle --tier <tier>                 # filter by tier (core|working|peripheral)
memo lifecycle --archive                     # show archival candidates
memo lifecycle --flagged                     # show memories flagged for review
memo lifecycle --delete --path <file>        # delete a memory file

memo correct <path>                          # record a correction for a memory
memo correct <path> --reason <text>          # with reason

memo review                                  # list memories due for review
memo review --due                            # only show overdue items
memo review --format json                    # output format (text|json, default: text)
```

**Lifecycle states:** `experimental` → `active` → `needs-review` → `deprecated`

| Status         | Meaning                                                        |
| -------------- | -------------------------------------------------------------- |
| `experimental` | Newly written; deprecated after 30 days if never recalled      |
| `active`       | Recalled at least once; trusted                                |
| `needs-review` | Not recalled in 90 days; re-activated by ≥ 3 recalls           |
| `deprecated`   | Excluded from default recall; permanently removed by `--prune` |

---

## Workspace Memory (Org-Wide)

```bash
memo workspace init <remote-url>             # connect to shared workspace repo
memo workspace sync                          # pull latest org memories
memo workspace sync --push                   # pull then push local changes
memo workspace publish <file>                # promote memory to workspace (runs secret scan)
memo workspace status                        # show git status of workspace clone
```

Workspace is optional. If not configured, recall silently skips that tier.

---

## Secret Scanning

```bash
memo scan                                    # scan .memobank/ for secrets
memo scan --fix                              # auto-redact and re-stage
memo scan --staged                           # scan git-staged files only (pre-commit hook)
memo scan --fail-on-secrets                  # exit with code 1 if secrets found
```

---

## Import from Other AI Tools

```bash
memo import --claude                         # import from Claude Code
memo import --gemini                         # import from Gemini CLI
memo import --qwen                           # import from Qwen Code
memo import --all                            # import from all available tools (default)
memo import --dry-run                        # preview without writing
```

---

## Capture & Queue

```bash
memo capture --auto                          # extract learnings from Claude auto-memory dir
                                             # also injects git working state so the LLM can write a
                                             # session-checkpoint-<date> workflow memory when a session ends mid-task
memo capture --session <text>                # extract from explicit session text (use - for stdin)
memo capture --repo <path>                   # specify memobank repo path
memo capture --silent                        # suppress output (for hooks)
memo process-queue                           # process pending memory queue
memo process-queue --background              # spawn as background process
```

**Session checkpoint**: when `memo capture --auto` runs at session end and detects uncommitted git changes, it appends a `[GIT STATE]` block to the LLM context. The smart extractor writes a `session-checkpoint-<date>` workflow memory with Task / Done / Next / Files sections. If no API key is configured, a simpler checkpoint is written directly from git state as a fallback.

Zero-result queries are logged to `meta/recall-misses.json` for later analysis with `memo skill-feedback`.

---

## Distillation

```bash
memo distill --to personal                   # copy project memories into personal tier
memo distill --to workspace                  # copy project memories into workspace tier
memo distill --to scenes                     # cluster memories by tag similarity and synthesize narrative scene files via LLM
memo distill --to <tier> --repo <path>       # specify memobank repo path
memo distill --to <tier> --silent            # suppress output
```

`memo distill --to scenes` groups memories by tag overlap, calls the LLM once per cluster, and writes a narrative Markdown scene to `.memobank/scenes/<topic-YYYY-MM>.md`. On every `memo recall` run, a scene navigation block is injected into `MEMORY.md`.

Requires an LLM API key (`llm.apiKey` in config or `OPENAI_API_KEY` env var).

---

## Skill Feedback

```bash
memo skill-feedback                          # report recall miss rate, memories never recalled, and isolated graph nodes
```

---

## Migration

```bash
memo migrate --dry-run                       # preview changes
memo migrate                                 # execute migration
memo migrate --rollback                      # restore previous layout
```
