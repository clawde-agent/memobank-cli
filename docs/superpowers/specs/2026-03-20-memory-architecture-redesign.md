# Memory Architecture Redesign: Three-Tier Model + Status Lifecycle

**Date:** 2026-03-20
**Status:** Draft

---

## Overview

Redesign memobank-cli's memory storage and team collaboration model to eliminate conceptual complexity, align with familiar developer mental models (global vs. project, like npm/git config), and support large multi-repo organizations through an optional workspace layer.

The core insight: **the code repo itself is the team memory**. A project's `.memobank/` directory committed alongside code is the natural "team" layer. The existing `team/` concept (separate remote repo) is elevated to a `workspace/` layer for cross-repo organizational knowledge.

---

## Goals

- Zero extra mental overhead for the common case (single repo, single team)
- Personal memories are truly private — never in a repo, never shared
- Team memories follow the code — committed, reviewed, diffed like any other file
- Workspace memories support large teams and multi-repo architectures via standard Git PR workflow
- `status` field + frequency-driven lifecycle enables long-term maintenance without ownership tracking

---

## Non-Goals

- Supporting non-Git backends
- Real-time collaboration or conflict resolution beyond standard Git merge
- Requiring a workspace layer (it remains optional)

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

### Tier 3: Workspace (Remote Repo, Optional)

| Property | Value |
|----------|-------|
| Location | `~/.memobank/_workspace/<workspace-name>/` (local clone) |
| Committed | To a designated remote repo (infra, platform-docs, etc.) |
| Scope | Entire organization, across all repos/services |
| Activation | `memo workspace init <remote-url>` |

Workspace memories capture cross-repo knowledge: inter-service contracts, workspace-wide decisions, shared architecture patterns. Any Git repo can serve as the workspace remote. Updates flow through standard PRs on that repo.

### Recall Priority

When `memo recall` runs, all three tiers are searched and results merged:

```
Priority (highest → lowest):
1. Project  — most specific to current context
2. Personal — individual experience
3. Workspace      — broad organizational knowledge
```

**Merge / deduplication rules:**
- Results from all tiers are scored independently and combined into a single ranked list
- If the same filename exists in multiple tiers, the highest-priority tier's version wins (Project > Personal > Workspace); lower-tier duplicates are suppressed
- Each result includes a `scope` field (`project | personal | workspace`) shown in output so users know the source
- If workspace tier is not configured or its local clone does not exist, recall silently skips that tier (no error)

**Workspace sync during recall:**
- `auto_sync: false` (default): recall uses the last-synced local clone of workspace memories; if no clone exists, workspace tier is skipped silently
- If workspace remote is unreachable during `memo workspace sync`, the command fails with an error but existing local clone remains usable
- `memo recall` itself never triggers a network request regardless of `auto_sync` setting

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

Onboarding (`memo onboarding`) asks which tier to set up. If the user selects neither workspace nor project, only personal is configured — zero team footprint.

### Workspace Commands (Optional)

```bash
memo workspace init <remote-url>     # configure workspace remote, clone to ~/.memobank/_workspace/
memo workspace sync                  # pull latest workspace memories from remote
memo workspace sync --push           # push local workspace changes to remote
memo workspace publish <file>        # copy project memory to workspace layer (+ secret scan)
memo workspace status                # show git status of local workspace clone
```

### Removed Commands

| Removed | Reason |
|---------|--------|
| `memo team init` | Replaced by `memo workspace init` |
| `memo team sync` | Replaced by `memo workspace sync` |
| `memo team publish` | Replaced by `memo workspace publish` |
| `memo team status` | Replaced by `memo workspace status` |
| `memo team handoff` | Project handoff = new team clones repo; workspace handoff = PR-based |

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

Status is evaluated and updated in two places:
1. **On every `memo recall`** — upgrades and downgrades are checked for any memory returned in results
2. **On `memo lifecycle`** — full scan of all memories, applies downgrades to memories not recently recalled (catches memories that were never returned in recall results)

`memo recall` alone is sufficient for memories that are actively used. `memo lifecycle` is a periodic maintenance command (can be run manually or via CI).

| Transition | Trigger | Checked by |
|-----------|---------|-----------|
| `experimental` → `active` | Recalled ≥ 1 time in current epoch | recall |
| `needs-review` → `active` | Recalled ≥ 3 times in current epoch | recall |
| `active` → `needs-review` | 0 recalls in last 90 days | lifecycle |
| `needs-review` → `deprecated` | 0 recalls in 90 days after entering needs-review | lifecycle |
| `experimental` → `deprecated` | 0 recalls in 30 days since creation | lifecycle |

The asymmetry between upgrade thresholds (1 vs 3) is intentional: a single accidental recall should not validate a `needs-review` memory; it takes deliberate repeated use to confirm it is still relevant.

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

### Deprecated Memory Re-recall

If a `deprecated` memory is explicitly recalled (e.g., via `memo search --include-deprecated` followed by direct use, or if it surfaces via workspace sync), it transitions back to `needs-review` — not directly to `active`. This requires at least 3 more recalls to re-validate, preventing accidental resurrection.

### Epoch Decay Function

The decay formula uses **linear decay** from 1.0 to 0.0 over `decay_window_days` (default 180):

```
decay(daysSinceEpoch, window) = max(0, 1 - daysSinceEpoch / window)
```

Linear decay is chosen for predictability — contributors can reason about how fast old-team history fades without needing to understand an exponential curve.

---

### Epoch Reset (Handoff)

`team_epoch` is set on `memo init` (project or global) and can be explicitly reset:

```bash
memo lifecycle --reset-epoch    # reset epoch to now, epochAccessCount → 0 for all memories
```

When a new team takes over a project:
1. Clone the repo (project-tier memories arrive automatically)
2. Run `memo workspace sync` to pull latest workspace knowledge
3. Run `memo lifecycle --reset-epoch` to start fresh decay tracking

If no workspace layer is configured, step 2 is skipped. The epoch still resets via step 3.

The epoch reset does not change any `status` values — status continues to evolve based on how often the new team recalls each memory. Unused memories fade naturally via the downgrade path.

For an explicit handoff record (optional):

```bash
memo write decision --name "team-handoff-$(date +%Y-%m-%d)"
```

---

## Migration from Current Architecture

Users with existing `personal/` and `team/` structures run once:

```bash
memo migrate --dry-run   # preview: show every file move, no changes made
memo migrate             # execute after reviewing dry-run output
```

**Steps executed:**
1. Moves `personal/` contents → `~/.memobank/<project-name>/` (global tier)
2. Flattens `team/` contents → `.memobank/` root (project tier, if team remote was configured)
3. Renames `team:` key → `workspace:` in `meta/config.yaml`
4. Old configs with `team:` key continue to work during transition (aliased to `workspace:`)
5. Prints a per-file summary of what moved

**Conflict handling (same filename in multiple tiers):**
- If a file from `personal/` and `team/` share the same name, the user is prompted to choose which to keep; the other is saved as `<name>.bak.md` in place
- Migration is idempotent: re-running after partial completion skips already-migrated files

**Rollback:**
- Original directories (`personal/`, `team/`) are renamed to `personal.bak/` and `team.bak/` rather than deleted
- User can restore by renaming back; `memo migrate --rollback` automates this
- Backups can be removed manually once the user is satisfied

---

## Workspace Layer: Large Team Governance

Since the workspace remote is a standard Git repo, all standard Git governance applies with no additional tooling:

| Need | Mechanism |
|------|-----------|
| Review before publishing | PR to workspace repo |
| Prevent unauthorized changes | Branch protection on workspace repo |
| Audit trail | Git log on workspace repo |
| Dispute a memory | Open PR/issue on workspace repo |
| Distribute to new services | `memo workspace init <same-remote-url>` |
| Cross-service context in recall | `memo workspace sync` before `memo recall` |

The workspace repo can be any existing repo (infra, platform-docs, monorepo root). A `.memobank/` directory within that repo holds the memories. The `workspace.path` config option specifies the subdirectory if needed.

```yaml
# meta/config.yaml
workspace:
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
| `src/types.ts` | Add `status: Status` field to `MemoryFile`; add `Status` type; update `MemoryScope` to `'personal' \| 'project' \| 'workspace'`; rename `TeamConfig` → `WorkspaceConfig` |
| `src/config.ts` | Update config schema; add `lifecycle` thresholds block; alias `team:` → `workspace:` for backward compat |
| `src/core/store.ts` | Rewrite path resolution: `getGlobalDir()`, `getProjectDir()`, `getWorkspaceDir()`; three-tier `loadAll()`; remove `getPersonalDir()`, `getTeamDir()`, `migrateToPersonal()` |
| `src/core/retriever.ts` | Update to merge results from three tiers; apply tier priority deduplication; add `scope` to `RecallResult` |
| `src/core/lifecycle-manager.ts` | Add `updateStatusOnRecall()` (called by recall); add `runLifecycleScan()` (called by lifecycle command); add epoch-aware scoring; add `resetEpoch()` |
| `src/core/decay-engine.ts` | Integrate dual-track epoch scoring formula |
| `src/commands/team.ts` | **Delete** |
| `src/commands/workspace.ts` | **New**: `workspaceInit`, `workspaceSync`, `workspacePublish`, `workspaceStatus` |
| `src/commands/recall.ts` | Call `updateStatusOnRecall()` after results returned |
| `src/commands/lifecycle.ts` | Add `--reset-epoch` flag; call `runLifecycleScan()` for full status sweep |
| `src/commands/write.ts` | Set `status: experimental` on all newly created memories |
| `src/commands/migrate.ts` | **New**: dry-run + execute migration; conflict handling; rollback support |
| `src/commands/init.ts` | **New** (or extend onboarding): handle `memo init` and `memo init --global` |
| `src/cli.ts` | Replace `team` subcommand with `workspace`; add `migrate` and `init` commands |
| `src/onboarding.tsx` | Ask global vs project tier; ask workspace remote URL (optional, skippable) |

---

## Edge Case Behavior

### Onboarding when workspace remote is pre-configured

If `workspace.remote` is already set in `config.yaml` and the user runs `memo onboarding` or `memo init` without specifying workspace, the existing workspace config is preserved untouched. Skipping the workspace step in onboarding only means "don't configure now" — it does not disable or remove a pre-existing workspace remote.

### `memo workspace init` subdirectory handling

When `workspace.path` is set to a subdirectory (e.g., `.memobank` inside a larger repo), `memo workspace init` clones the entire remote repo to `~/.memobank/_workspace/<workspace-name>/` and reads memories from the specified `workspace.path` subdirectory within that clone. If the subdirectory does not exist in the remote, `memo workspace init` creates it with an empty `.gitkeep` and commits it as part of initialization.

### `memo init` conflicts

- Running `memo init` when `.memobank/` already exists: prints a warning and exits (no-op); user must run `memo migrate` if upgrading from old layout
- Running `memo init --global` when `~/.memobank/<project>/` already exists: same behavior
- Both personal and project tiers can coexist simultaneously; recall merges both

### `memo workspace publish` secret scanning

- Uses the same regex-based scanner as `memo scan` (`src/commands/scan.ts`)
- If secrets are found: command aborts, lists findings, instructs user to fix before publishing
- No automatic stripping — user must manually redact and re-run
- If the same filename already exists in the workspace local clone: user is prompted to confirm overwrite; the workspace repo's PR review is the final governance gate

### `memo workspace sync --push` conflict handling

- If remote has changes not in local clone: `sync --push` is rejected with an error; user must `memo workspace sync` (pull) first, resolve conflicts via standard `git` commands, then retry push
- This mirrors standard Git push-rejection behavior; no special tooling needed
