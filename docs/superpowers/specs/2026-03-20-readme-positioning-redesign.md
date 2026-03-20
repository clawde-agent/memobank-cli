# README Positioning Redesign

**Date:** 2026-03-20
**Status:** Approved for implementation

## Problem

The current README has three compounding weaknesses:

- **A) No clear problem statement** — readers don't understand why they need memobank
- **B) Features without differentiation** — no explanation of why memobank is better than alternatives
- **D) Technical detail buries core value** — three-tier architecture, lifecycle, decay engine are front-loaded before the reader cares

## Target Audiences

Both individual developers (using Claude Code / Cursor solo) and engineering teams (multi-person, knowledge sharing). Individual developers are the easier entry point; teams are the higher-value use case. The README must serve both without forcing either to hunt for their section.

## Killer Differentiators

1. **Three-tier architecture (personal / team / workspace)** — like `git config` levels, each with a different scope
2. **Native Claude Code integration** — `autoMemoryDirectory` points to `.memobank/`, memories load at every session start with no configuration beyond `memo onboarding`

## Approach

**Problem-first with woven comparison (Approach C).**

- Lead with the pain, not the solution
- Comparison points embedded in "Why not X?" sections rather than a defensive table
- Dual entry points (individual / team) in Quick Start
- Technical details moved to the bottom as reference, not pitch

## Structure

```
Hero → Quick Start → How it works → Why memobank → Features
```

---

## Section Designs

### Hero

```markdown
# memobank

AI agents forget everything between sessions.
Static files like CLAUDE.md go stale and require manual upkeep.
Cloud memory APIs add external services your team doesn't own or control.

**memobank gives AI agents persistent, structured memory that lives in your Git repo** —
versioned alongside code, reviewed as PRs, and loaded automatically at session start.

- **Personal** — private lessons and preferences, never committed
- **Team** — shared knowledge that travels with the codebase
- **Workspace** — cross-repo patterns, synced via a separate Git remote

Works with Claude Code, Cursor, Codex, Gemini CLI, and Qwen Code.
Zero external services required.
```

**Rationale:** Each of the three opening lines targets a different competitor category (platform-native, static files, cloud APIs). The bold positioning sentence lands on four concrete properties. Three bullets present the tier model without technical jargon. "Workspace" chosen over "Org" because it communicates cross-repo scope in terms developers already understand from VS Code / Cursor.

---

### Quick Start

````markdown
## Get started

```bash
npm install -g memobank-cli
cd your-project
memo onboarding  # creates .memobank/ and configures Claude Code
```

**For individuals** — memories stay on your machine, load automatically into every Claude Code session:

```bash
memo write decision   # interactive: name, description, content
memo recall "package manager"
```

**For teams** — commit `.memobank/` like source code. Teammates get the same memories on clone:

```bash
git add .memobank/
git commit -m "init team memory"
```

Claude Code loads the first 200 lines of `.memobank/MEMORY.md` at every session start — no plugins, no configuration beyond `memo onboarding`.
````

**Rationale:** Two paths, clearly labelled. Individual path shows the write/recall loop in two lines. Team path shows that sharing is just a `git add` — no special workflow. Claude Code integration explained in one sentence at the end.

---

### How it works

````markdown
## How it works

memobank uses three memory tiers — like `git config` levels, each with a different scope:

| Tier | Location | Committed? | Scope |
|------|----------|-----------|-------|
| Personal | `~/.memobank/<project>/` | No | Your machine only |
| Team | `.memobank/` in repo | Yes | Everyone who clones |
| Workspace | `~/.memobank/_workspace/` | Separate remote | Across multiple repos |

Most teams only ever need **Personal + Team**. Workspace is opt-in.

When you run `memo recall`, memobank searches all active tiers and writes the top results to `.memobank/MEMORY.md`. Claude Code loads that file at the start of every session.

Memories are plain markdown with a small YAML header — readable, diffable, and reviewable in PRs:

```markdown
---
name: prefer-pnpm
type: decision
status: active
tags: [tooling, packages]
---
We switched from npm to pnpm in March 2026. Faster installs, better monorepo support.
```
````

**Rationale:** The `git config` analogy is the fastest path to comprehension for developers. "Most teams only ever need Personal + Team" actively reduces perceived complexity. The memory file example is short enough to not intimidate and concrete enough to show the format.

---

### Why memobank

```markdown
## Why not just use CLAUDE.md?

CLAUDE.md is great for static rules you write once. memobank handles knowledge
that accumulates over time — lessons learned, decisions made, patterns discovered.
The two are complementary: CLAUDE.md for "always do X", memobank for "we learned Y".

## Why not a cloud memory API?

Tools like mem0 or Zep store memories in external services. memobank stores them
in your Git repo — no API keys, no vendor lock-in, no data leaving your machine.
Memory health is visible in `git diff`. Reviews happen in PRs.

## Why not Claude Code's built-in auto-memory?

Claude Code's auto-memory is personal and machine-local. memobank adds the team
layer: `.memobank/` is committed alongside your code, so every teammate and every
CI run starts with the same shared knowledge. memobank also works with Cursor,
Codex, Gemini CLI, and Qwen Code.
```

**Rationale:** Questions framed as what the reader is already thinking, not as "here's why competitors are bad." Each response acknowledges the competitor's strength before drawing the boundary. Order: most common objection first (CLAUDE.md), then cloud APIs, then platform-native.

---

### Features

```markdown
## Features

**Memory management**
- Four types: `lesson`, `decision`, `workflow`, `architecture`
- Status lifecycle: `experimental → active → needs-review → deprecated`
- Automatic stale memory detection via `memo review`

**Search**
- Default: keyword + tag + recency scoring, zero external dependencies
- Optional: vector search via LanceDB (Ollama, OpenAI, Azure, Jina)

**Safety**
- Automatic secret redaction before every write (API keys, tokens, credentials)
- `memo scan` blocks workspace publish if secrets are detected

**Integrations**
- Claude Code — `autoMemoryDirectory` points to `.memobank/`, loads at session start
- Cursor, Codex, Gemini CLI, Qwen Code — hooks installed via `memo onboarding`
- Import from Claude Code, Gemini, and Qwen: `memo import --claude`

**Team workflows**
- Workspace tier: cross-repo knowledge synced via separate Git remote
- Epoch-aware scoring: team knowledge naturally fades during handoffs
- `memo map` for memory statistics, `memo lifecycle` for health scans
```

**Rationale:** Grouped by concern rather than a flat bullet list. Advanced features (epoch scoring, workspace) are in Team workflows — invisible to individual developers until they need them.

---

## Implementation Notes

**Scope:** Rewrite the top portion of README.md (Hero through Features). Everything below the Features section (command reference, configuration, platform docs) stays in place. The new content replaces roughly the first 60% of the current README.

**Tier naming:** The README uses "Team" as the user-facing label for the project tier. The codebase and CLI use `project` internally (e.g., `--scope project` flag, `MemoryScope` type). When the README mentions CLI flags or scope values, use `project` to match CLI output. "Team" is only used in the prose tier description.

**MEMORY.md path:** After the Claude Code integration refactor, `autoMemoryDirectory = repoRoot = .memobank/`, so MEMORY.md lives at `.memobank/MEMORY.md`. The 200-line figure is a Claude Code platform constraint (documented in Claude Code docs), not a memobank config. The token_budget config in `meta/config.yaml` controls memobank's own recall output, which is a separate concept.

**MEMORY.md commit status:** `.memobank/MEMORY.md` is regenerated on every `memo recall`. The implementer should add a note in the README (or in `.memobank/.gitignore`) clarifying whether it should be committed. Recommendation: gitignore it, since it's a derived artifact — only the source memory files in `lesson/`, `decision/`, etc. need committing.

**Claude Code auto-memory claim:** "Claude Code's auto-memory is personal and machine-local" reflects current Claude Code behavior. Verify against current Claude Code documentation before shipping, and word it as "by default" in case the behavior changes.

**Badges:** Existing npm/license/TypeScript badges at the top of the README stay in place above the Hero section.

**"Three-Tier Memory Model" deep-dive section:** The existing deep-dive section (currently near the top) should be moved below Features, after the new "How it works" table. It becomes supplementary reference, not the primary explanation.

## What This Does Not Change

- The existing command reference section — keep as-is
- Configuration documentation — keep as-is
- Platform integration guides — keep as-is
- Existing badges (npm version, license, Node.js, TypeScript) — stay above Hero
