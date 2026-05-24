---
name: memobank
description: >
  Recalls and persists coding knowledge across sessions using the memo CLI.
  Writes memories when a non-obvious bug is fixed, an architecture decision
  is made, a repeatable process is discovered, or codebase structure is mapped.
  Distills and promotes memories across tiers over time.
  Use when: the user's first message involves code or files, after fixing
  a non-obvious bug, after making a tech or design decision, before switching
  project context, or when a recalled memory turns out to be wrong.
  NOT for: projects without a .memobank/ directory or memo CLI installed.
hooks:
  Stop:
    - command: 'memo capture --auto --silent 2>/dev/null; memo process-queue --background 2>/dev/null || true'
      async: true
      timeout: 60
user-invocable: true
allowed-tools: 'Bash(memo *)'
compatibility: Requires Claude Code with the memo CLI installed (npm install -g memobank-cli) and a project initialized with memo init (.memobank/ directory).
---

# memobank — Persistent Memory Protocol

## Trigger table — act immediately when any of these fires

| Event                                                    | Command                                            | Timing                      |
| -------------------------------------------------------- | -------------------------------------------------- | --------------------------- |
| First message involves code / files / a technical change | `memo map` → `memo recall "<topic>" --code`        | Before your first tool call |
| Mid-session: entering an unfamiliar module or subsystem  | `memo recall "<topic>" --code`                     | Before editing that area    |
| Before /compact or conversation has grown very long      | `memo capture --auto --silent; memo process-queue` | Before compacting           |
| Fixed a non-obvious bug                                  | `memo write lesson`                                | Immediately after fix       |
| Made an architecture / tech choice                       | `memo write decision`                              | Immediately after decision  |
| Discovered a repeatable process                          | `memo write workflow`                              | End of task                 |
| Mapped system structure                                  | `memo write architecture`                          | End of task                 |
| Recalled memory is wrong or stale                        | `memo correct <path>`                              | Immediately on discovery    |
| Lesson recalled 3+ times this week                       | `memo study <lesson-name>`                         | Promote to CLAUDE.md        |
| Session ended                                            | _(Stop hook fires automatically)_                  | No action needed            |

## Session start — before your first tool call

When the user's first message involves code, files, or a technical task:

```bash
memo map                          # instant inventory: types, tags, recent additions
memo recall "<topic>" --code      # memories + linked code symbols + scene navigation
```

Read MEMORY.md after recall.

## Before /compact

```bash
memo capture --auto --silent; memo process-queue
```

## Write — templates by type

```bash
# Bug fix lesson
memo write lesson \
  --name="slug-describing-the-bug" \
  --description="one-sentence root cause" \
  --tags="affected-module,symptom-tag" \
  --content="## Problem\n...\n## Root Cause\n...\n## Fix\n..."

# Architecture / tech decision
memo write decision \
  --name="decision-slug" \
  --description="what was decided and why" \
  --tags="arch,module" \
  --content="## Context\n...\n## Decision\n...\n## Consequences\n..."

# Repeatable workflow
memo write workflow \
  --name="workflow-slug" \
  --description="process name" \
  --tags="process,area" \
  --content="## Steps\n1. ...\n2. ..."
```

## Maintenance — run periodically

```bash
memo lifecycle --scan          # auto-downgrade stale memories
memo review                    # list memories overdue for manual review
memo study --auto              # identify high-recall lessons → suggest CLAUDE.md promotion
memo skill-feedback            # report recall misses + never-recalled memories
memo distill --to scenes       # synthesize narrative scenes from clustered memories
memo distill --to workspace    # promote project lessons to org-wide workspace tier
memo workspace sync            # pull latest workspace memories before cross-project work
```

## Memory tiers

| Where it belongs             | Tier                                | How                                                        |
| ---------------------------- | ----------------------------------- | ---------------------------------------------------------- |
| Private / machine-specific   | Personal (`~/.memobank/<project>/`) | `memo write ... --tier personal`                           |
| Team should learn this       | Project (`.memobank/` in repo)      | Default — no flag needed                                   |
| Useful across multiple repos | Workspace                           | Write to project first, then `memo distill --to workspace` |

## Setup check

```bash
memo map             # memory counts per tier and type
memo recall "test"   # if empty, run: memo init
```

Capture requires a chat LLM. Verify: `grep -A3 "capture:" .memobank/meta/config.yaml`
If missing, add a `capture:` section or set `ANTHROPIC_API_KEY` in `.memobank/.env`.
