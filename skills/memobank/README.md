# memobank skill

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Works with Claude Code](https://img.shields.io/badge/Claude%20Code-skill-blueviolet.svg)](https://claude.ai/code)
[![npm](https://img.shields.io/npm/v/memobank-cli.svg)](https://www.npmjs.com/package/memobank-cli)

**AI agents forget everything between sessions. memobank teaches them to learn.**

This skill wires the [`memo` CLI](https://github.com/clawde-agent/memobank-cli) into Claude Code: auto-recall at session start, auto-capture at session end, and `/memobank` for on-demand memory operations.

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

**Manual**:

```bash
mkdir -p ~/.claude/skills/memobank
curl -fsSL https://raw.githubusercontent.com/clawde-agent/memobank-cli/main/skills/memobank/SKILL.md \
  -o ~/.claude/skills/memobank/SKILL.md
# see install.sh for full file list
```

After installing, restart Claude Code. Then:

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

| Event                      | Action                                              |
| -------------------------- | --------------------------------------------------- |
| Session starts (code task) | `memo recall "<topic>" --code` → writes `MEMORY.md` |
| Bug fixed / decision made  | `memo write lesson / decision`                      |
| Before `/compact`          | `memo capture --auto --silent`                      |
| Session ends               | Stop hook: auto-capture + queue drain               |

Memories move through a lifecycle: `experimental → active → needs-review → deprecated`. Frequently recalled knowledge is promoted; unused knowledge fades.

---

## Three storage tiers

| Tier      | Location                  | Committed?      | Use                      |
| --------- | ------------------------- | --------------- | ------------------------ |
| Personal  | `~/.memobank/<project>/`  | No              | Private notes            |
| Project   | `<repo>/.memobank/`       | Yes             | Team lessons, ADRs       |
| Workspace | `~/.memobank/_workspace/` | Separate remote | Cross-repo org knowledge |

---

## References

- [CLI Reference](references/cli-reference.md)
- [Memory Protocol](references/memory-protocol.md)
- [Claude Code setup](references/claude-code.md)
- [Fallback guide](references/fallback.md) — operation without the CLI

Full documentation: [memobank-cli](https://github.com/clawde-agent/memobank-cli)
