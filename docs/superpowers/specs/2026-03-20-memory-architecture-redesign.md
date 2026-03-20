# Memory Architecture Redesign: Three-Tier Model + Status Lifecycle

**Date:** 2026-03-20
**Status:** Draft

---

## Overview

Redesign memobank-cli's memory storage and team collaboration model to eliminate conceptual complexity, align with familiar developer mental models (global vs. project, like npm/git config), and support large multi-repo organizations through an optional org layer.

The core insight: **the code repo itself is the team memory**. A project's `.memobank/` directory committed alongside code is the natural "team" layer. The existing `team/` concept (separate remote repo) is elevated to an `org/` layer for cross-repo organizational knowledge.

---

## Goals

- Zero extra mental overhead for the common case (single repo, single team)
- Personal memories are truly private — never in a repo, never shared
- Team memories follow the code — committed, reviewed, diffed like any other file
- Org memories support large teams and multi-repo architectures via standard Git PR workflow
- `status` field + frequency-driven lifecycle enables long-term maintenance without ownership tracking

---

## Non-Goals

- Supporting non-Git backends
- Real-time collaboration or conflict resolution beyond standard Git merge
- Requiring an org layer (it remains optional)

---

## Three-Tier Memory Model

### Tier 1: Personal (Global Install)

| Property | Value |
|----------|-------|
| Location | `~/.memobank/<project-name>/` |
| Committed | Never — lives outside any repo |
| Scope | Current machine, current user |
| Activation | `memo init --global` |

Personal memories are private drafts, local experiments, and individual notes. They are never shared.

### Tier 2: Project (Team)

| Property | Value |
|----------|-------|
| Location | `<repo-root>/.memobank/` |
| Committed | Yes — as regular code files |
| Scope | Everyone who clones this repo |
| Activation | `memo init` (default, no flag) |

Project memories are committed alongside code. Adding a memory = adding a file in a PR. Reviewing a memory = code review. History = git log. This tier requires no special commands — standard Git workflow handles everything.

### Tier 3: Org (Remote Repo, Optional)

| Property | Value |
|----------|-------|
| Location | `~/.memobank/_org/<org-name>/` (local clone) |
| Committed | To a designated remote repo (infra, platform-docs, etc.) |
| Scope | Entire organization, across all repos/services |
| Activation | `memo org init <remote-url>` |

Org memories capture cross-repo knowledge: inter-service contracts, org-wide decisions, shared architecture patterns. Any Git repo can serve as the org remote. Updates flow through standard PRs on that repo.

### Recall Priority

When `memo recall` runs, all three tiers are searched and results merged:

```
Priority (highest → lowest):
1. Project  — most specific to current context
2. Personal — individual experience
3. Org      — broad organizational knowledge
```

Scope is surfaced in results so users know where each memory comes from.

---

## Storage Structure

All three tiers share identical internal structure:

```
<tier-root>/
├── lesson/
├── decision/
├── workflow/
├── architecture/
└── meta/
    ├── config.yaml
    └── access-log.json
```

No `personal/` or `team/` subdirectories. Tier is determined by install location, not directory structure.

---

## Command Set

### Init

```bash
memo init             # project tier — .memobank/ in current repo
memo init --global    # personal tier — ~/.memobank/<project>/
```

Onboarding (`memo onboarding`) asks which tier to set up. If the user selects neither org nor project, only personal is configured — zero team footprint.

### Org Commands (Optional)

```bash
memo org init <remote-url>     # configure org remote, clone to ~/.memobank/_org/
memo org sync                  # pull latest org memories from remote
memo org sync --push           # push local org changes to remote
memo org publish <file>        # copy project memory to org layer (+ secret scan)
memo org status                # show git status of local org clone
```

### Removed Commands

| Removed | Reason |
|---------|--------|
| `memo team init` | Replaced by `memo org init` |
| `memo team sync` | Replaced by `memo org sync` |
| `memo team publish` | Replaced by `memo org publish` |
| `memo team status` | Replaced by `memo org status` |
| `memo team handoff` | Project handoff = new team clones repo; org handoff = PR-based |

### Unchanged Commands

`memo write`, `memo recall`, `memo search`, `memo capture`, `memo scan`, `memo review`, `memo lifecycle`, `memo map`, `memo correct`, `memo index` — all unchanged.

---

## Status Field + Lifecycle

### The `status` Field

Added to all memory frontmatter:

```yaml
status: experimental   # newly written, unverified
status: active         # recalled at least once in current epoch; trusted
status: needs-review   # not recalled for 90 days; may be stale
status: deprecated     # not recalled for 180 days after needs-review; effectively retired
```

**Default on creation:** `experimental`. First recall promotes to `active` automatically.

### Bidirectional Auto-Update

Status is updated silently during `memo recall` — no user interaction required.

| Transition | Trigger | Direction |
|-----------|---------|-----------|
| `experimental` → `active` | Recalled ≥ 1 time | Upgrade |
| `needs-review` → `active` | Recalled ≥ 3 times (configurable) | Upgrade |
| `active` → `needs-review` | Not recalled for 90 days | Downgrade |
| `needs-review` → `deprecated` | Not recalled for 90 more days | Downgrade |
| `experimental` → `deprecated` | Not recalled for 30 days | Downgrade |

Transitions write to frontmatter in place. The Git diff on `.memobank/` naturally surfaces which memories are gaining or losing relevance — this becomes the team's ambient health signal.

`deprecated` memories are not deleted. They remain searchable via `memo search --include-deprecated` but are excluded from default recall.

### Configurable Thresholds

```yaml
# meta/config.yaml
lifecycle:
  experimental_ttl_days: 30
  active_to_review_days: 90
  review_to_deprecated_days: 90
  review_recall_threshold: 3
```

---

## Dual-Track Access Log (Epoch Model)

Supports knowledge continuity across team changes without tracking individual identities.

### Structure

```json
{
  "team_epoch": "2026-03-20T00:00:00Z",
  "entries": {
    ".memobank/lesson/redis-pooling.md": {
      "accessCount": 15,
      "lastAccessed": "2026-03-19T10:00:00Z",
      "epochAccessCount": 4
    }
  }
}
```

- `accessCount` — lifetime total (carries across team changes)
- `epochAccessCount` — recalls since current `team_epoch`
- `team_epoch` — timestamp of last team handoff (or repo init)

### Scoring Formula

```
score = epochAccessCount × 1.0
      + (accessCount − epochAccessCount) × decay(daysSinceEpoch, 180)
```

Old team's access history contributes positively but fades to zero over 180 days (configurable). New team's usage drives the score fully from day one.

### Epoch Reset (Handoff)

When a new team takes over a project, they run:

```bash
memo org sync    # pull latest org knowledge
```

No special handoff command needed for the project layer. The epoch resets naturally: new team members start recalling the memories they actually need, frequency scores rebuild organically, unused memories fade via status downgrade.

For an explicit checkpoint (optional):

```bash
memo write decision --name "team-handoff-$(date +%Y-%m-%d)"
```

---

## Migration from Current Architecture

Users with existing `personal/` and `team/` structures run once:

```bash
memo migrate
```

This command:
1. Moves `personal/` contents → `~/.memobank/<project-name>/` (global tier)
2. Flattens `team/` contents → `.memobank/` root (project tier, if team remote was configured)
3. Updates `meta/config.yaml` to new schema
4. Prints a summary of what moved

The migration is non-destructive — originals are preserved until the user confirms with `--confirm`.

---

## Org Layer: Large Team Governance

Since the org remote is a standard Git repo, all standard Git governance applies with no additional tooling:

| Need | Mechanism |
|------|-----------|
| Review before publishing | PR to org repo |
| Prevent unauthorized changes | Branch protection on org repo |
| Audit trail | Git log on org repo |
| Dispute a memory | Open PR/issue on org repo |
| Distribute to new services | `memo org init <same-remote-url>` |
| Cross-service context in recall | `memo org sync` before `memo recall` |

The org repo can be any existing repo (infra, platform-docs, monorepo root). A `.memobank/` directory within that repo holds the memories. The `org.path` config option specifies the subdirectory if needed.

```yaml
# meta/config.yaml
org:
  enabled: true
  remote: git@github.com:mycompany/platform-docs.git
  path: .memobank       # subdirectory within remote repo
  branch: main
  auto_sync: false      # manual sync by default; avoids network on every recall
```

---

## Affected Files

| File | Change |
|------|--------|
| `src/types.ts` | Add `status` field to `MemoryFile`; update `MemoryScope` to `'personal' \| 'project' \| 'org'`; update `TeamConfig` → `OrgConfig` |
| `src/config.ts` | Update config schema; add `lifecycle` thresholds; rename `team` → `org` |
| `src/core/store.ts` | Rewrite path resolution for three-tier lookup; `getGlobalDir()`, `getProjectDir()`, `getOrgDir()`; remove `getPersonalDir()`, `getTeamDir()` |
| `src/core/lifecycle-manager.ts` | Add status auto-update on access; add epoch-aware scoring |
| `src/core/decay-engine.ts` | Integrate dual-track epoch scoring |
| `src/commands/team.ts` | Remove file; replace with `src/commands/org.ts` |
| `src/commands/org.ts` | New file: `orgInit`, `orgSync`, `orgPublish`, `orgStatus` |
| `src/commands/recall.ts` | Trigger status update after successful recall |
| `src/commands/migrate.ts` | New file: migration from old `personal/`+`team/` layout |
| `src/cli.ts` | Replace `team` subcommand with `org`; add `migrate` command |
| `src/onboarding.tsx` | Update wizard: ask global vs project; ask org remote (optional) |

---

## Open Questions

None blocking implementation.
