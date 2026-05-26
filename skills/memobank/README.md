# memobank skill

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Works with Claude Code](https://img.shields.io/badge/Claude%20Code-skill-blueviolet.svg)](https://claude.ai/code)
[![npm](https://img.shields.io/npm/v/memobank-cli.svg)](https://www.npmjs.com/package/memobank-cli)

At the start of every session, this skill recalls relevant memories from your project's `.memobank/` store.
On every prompt (when hooks are installed), a `UserPromptSubmit` hook pre-loads relevant context automatically.
At the end of every session, a Stop hook captures what the agent learned and queues it for storage.
Between sessions, nothing is lost.

The skill pairs with the [`memo` CLI](https://github.com/clawde-agent/memobank-cli) — memories persist in your Git repo, review as PRs, and self-curate via recall-frequency lifecycle scoring.

---

## Install

**Via Claude Code plugin** (recommended):

```bash
claude plugin marketplace add clawde-agent/memobank-cli
claude plugin install memobank@memobank-cli
```

**Via skills CLI** ([skills.sh](https://www.skills.sh)):

```bash
npx skills add clawde-agent/memobank-cli
```

**One-liner** (review script before running):

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/clawde-agent/memobank-cli/main/skills/memobank/install.sh)
```

After installing, restart Claude Code. Then use `/memobank` with any task:

```
/memobank debug the auth flow
/memobank refactor the payment module
```

---

## Requires

- **Claude Code** with the `memo` CLI:

  ```bash
  npm install -g memobank-cli
  memo init   # in your project root
  ```

- A `.memobank/` directory in your project (created by `memo init`).

---

## What it does

| Event                          | Action                                                   |
| ------------------------------ | -------------------------------------------------------- |
| Session starts (code task)     | `memo recall "<topic>" --code` → writes `MEMORY.md`      |
| Every prompt (hooks installed) | `UserPromptSubmit` hook: auto-recall from prompt text    |
| Bug fixed / decision made      | `memo remember` or `memo write lesson / decision`        |
| Update an existing memory      | `memo update <name> --content "…"`                       |
| Reverse-lookup a code symbol   | `memo code-context <symbol>` → callers + linked memories |
| Before `/compact`              | `memo capture --auto --silent`                           |
| Session ends                   | Stop hook: auto-capture + queue drain                    |

Memories move through `experimental → active → needs-review → deprecated` based on how often they are recalled. Frequently recalled memories get promoted; unused ones fade out and stop loading. Run `memo lifecycle --prune` to permanently delete deprecated files and clean stale access log entries. The agent's working context self-curates without manual pruning.

The `--code` flag adds a second track: `memo index-code` parses your codebase with tree-sitter, and `memo recall --code` searches memories and code symbols together, traversing the code-memory graph up to depth 2. Use `memo code-context <symbol>` to navigate in reverse — see what calls a symbol and which memories are linked to it.

---

## Storage tiers

| Tier      | Location                  | Committed?      | Use                      |
| --------- | ------------------------- | --------------- | ------------------------ |
| Personal  | `~/.memobank/<project>/`  | No              | Private notes            |
| Project   | `<repo>/.memobank/`       | Yes             | Team lessons, ADRs       |
| Workspace | `~/.memobank/_workspace/` | Separate remote | Cross-repo org knowledge |

Recall priority: Project > Personal > Workspace. The project tier travels with the repo — clone it and the team's accumulated knowledge is already there.

---

## References

- [CLI Reference](references/cli-reference.md)
- [Memory Protocol](references/memory-protocol.md)
- [Claude Code setup](references/claude-code.md)
- [Fallback guide](references/fallback.md) — operation without the CLI

Full documentation: [memobank-cli](https://github.com/clawde-agent/memobank-cli)
