# Memory Write Protocol

When to write which type, tier selection, and complete frontmatter templates.

---

## Decision tree: which type?

| Situation                                                              | Type           |
| ---------------------------------------------------------------------- | -------------- |
| Fixed a bug that wasn't obvious, required investigation, or will recur | `lesson`       |
| Chose a library, pattern, architecture, or approach over alternatives  | `decision`     |
| Discovered a multi-step process worth repeating (deploy, debug, test)  | `workflow`     |
| Mapped a module's structure, ownership, or relationships               | `architecture` |

## Decision tree: which tier?

| Situation                                            | Tier                                              |
| ---------------------------------------------------- | ------------------------------------------------- |
| Personal config, machine quirks, private experiments | `--tier personal`                                 |
| Bug fix or decision specific to this repo/team       | Project (default)                                 |
| Pattern or lesson that applies across repos          | Project first, then `memo distill --to workspace` |

---

## Templates

Copy the relevant template when running `memo write`. Fill every `<placeholder>`.

### lesson — bug fixes and unexpected behavior

```markdown
---
name: <kebab-case-slug>
type: lesson
description: '<one sentence: what was learned>'
tags: [<tag1>, <tag2>]
status: experimental
confidence: medium
---

## Problem

<what went wrong or what was unexpected>

## Root Cause

<why it happened>

## Solution

<what fixed it>

## Applies When

<conditions under which this lesson is relevant>
```

### decision — architecture and technology choices

```markdown
---
name: <kebab-case-slug>
type: decision
description: '<one sentence: what was decided>'
tags: [<tag1>, <tag2>]
status: experimental
confidence: high
---

## Context

<situation and constraints that led to this decision>

## Decision

<what was chosen>

## Alternatives Considered

<what was rejected and why>

## Consequences

<tradeoffs accepted>
```

### workflow — repeatable processes

```markdown
---
name: <kebab-case-slug>
type: workflow
description: '<one sentence: what process this captures>'
tags: [<tag1>, <tag2>]
status: experimental
---

## Trigger

<when to use this workflow>

## Steps

1. <step>
2. <step>

## Notes

<caveats, environment requirements, or known variations>
```

### architecture — system structure documentation

```markdown
---
name: <kebab-case-slug>
type: architecture
description: '<one sentence: what structure this documents>'
tags: [<tag1>, <tag2>]
status: experimental
---

## Overview

<what this architectural pattern or decision covers>

## Structure

<how components are organized>

## Rationale

<why this structure was chosen over alternatives>
```

---

## Lifecycle states

`experimental` → `active` → `needs-review` → `deprecated`

A memory starts as `experimental`. It becomes `active` on first recall. It enters `needs-review` after 90 days without recall and reverts to `active` after 3 new recalls. Deprecated memories are excluded from default results but still searchable.

---

## Maintenance commands

```bash
memo lifecycle --scan      # auto-downgrade stale memories (run in CI)
memo review                # list memories overdue for manual review
memo study --auto          # identify high-recall lessons → suggest CLAUDE.md promotion
memo skill-feedback        # report recall misses + never-recalled memories
memo distill --to scenes   # synthesize narrative scenes from clustered memories
memo distill --to workspace  # promote project lessons to org-wide workspace tier
```
