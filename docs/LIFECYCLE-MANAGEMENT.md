# Memobank Memory Lifecycle Management Guide

## Issue 1: Memory Access Frequency Optimisation

### Automatic Tracking Mechanism

Memobank automatically tracks the usage of each memory:

```typescript
// Recorded automatically on every recall
{
  memoryPath: "/path/to/memory.md",
  lastAccessed: "2026-03-19T10:00:00Z",
  accessCount: 15,
  recallQueries: ["redis", "connection pool", "database"]
}
```

### Memory Tier System

Based on access frequency, memories are automatically classified into three tiers:

| Tier | Condition | Handling |
|------|-----------|----------|
| **Core** | Accessed ≥10 times | Prioritised retrieval, never archived |
| **Working** | Normal access | Standard retrieval |
| **Peripheral** | No access for 90 days | Reduced priority, archival recommended |

### Viewing Memory Status

```bash
# View the full lifecycle report
memo lifecycle report

# Example output:
## Memory Lifecycle Report

**Total Memories:** 50

### Tier Distribution
- Core (frequently accessed): 5
- Working (active): 35
- Peripheral (inactive): 10

### Archival Candidates (10)
- redis-pool-fix (180 days inactive)
- old-deployment-flow (200 days inactive)
...
```

### Viewing by Tier

```bash
# View core memories
memo lifecycle --tier core

# View peripheral memories
memo lifecycle --tier peripheral
```

### Archiving Inactive Memories

```bash
# View memories eligible for archival
memo lifecycle archive

# Archive a specific memory
memo lifecycle archive --path lessons/2023-01-01-old-fix.md
```

### Deleting Memories

```bash
# Delete a memory (use with caution)
memo lifecycle delete --path lessons/obsolete.md
```

---

## Issue 2: Correcting Erroneous Memories

### Correction Mechanism

When an error is discovered in a memory:

#### Method 1: Edit the File Directly

```bash
# Locate the memory file
ls ~/.memobank/<project>/lessons/

# Edit it directly
vim ~/.memobank/<project>/lessons/2026-03-19-redis-fix.md

# Save after making changes
```

#### Method 2: Use the Correction Command

```bash
# Record a correction (tracks correction history)
memo correct lessons/2026-03-19-redis-fix.md \
  --reason "Original solution had incorrect pool size"
```

#### Method 3: Recreate the Memory

```bash
# Delete the erroneous entry
rm ~/.memobank/<project>/lessons/2026-03-19-redis-fix.md

# Create the correct one
memo write lesson \
  --name="redis-fix-corrected" \
  --description="Corrected Redis fix" \
  --content="..."
```

### Correction Tracking

The system records every correction made:

```json
{
  "lessons/2026-03-19-redis-fix.md": {
    "corrections": [
      {
        "date": "2026-03-19T10:00:00Z",
        "originalText": "pool size = 5",
        "correctedText": "pool size = 10",
        "reason": "Incorrect pool size"
      }
    ],
    "flaggedForReview": false
  }
}
```

### Viewing Memories Flagged for Review

```bash
# View memories that have been corrected multiple times
memo lifecycle flagged

# Example output:
🚩 Flagged Memories (2)

These memories have been corrected multiple times:

- [lesson] redis-pool-fix
  Redis connection pool solution
  Path: /path/to/memory.md

- [decision] database-choice
  Database selection rationale
  Path: /path/to/memory.md
```

---

## Best Practices

### 1. Regular Review

```bash
# Review once a month
memo lifecycle report

# View peripheral memories
memo lifecycle --tier peripheral

# Consider whether to delete or archive
```

### 2. Protecting Core Memories

```bash
# Core memories should generally not be deleted
# They represent your most frequently used knowledge

memo lifecycle --tier core
# Review the quality of these memories
```

### 3. Error Correction Workflow

```
Discover error → Record correction → Update content → Verify correction
    ↓
Multiple corrections → Flag for review → Team discussion → Final confirmation
```

### 4. Sharing Memories Within a Team

```bash
# In a team project, notify the team before making corrections
git pull origin main  # fetch the latest

# Commit after correcting
git add .
git commit -m "fix: correct redis pool size in memory"
git push

# Team members synchronise
git pull origin main
```

---

## Configuration Options

Configure in `meta/config.yaml`:

```yaml
lifecycle:
  # Core memory threshold (number of accesses)
  coreThreshold: 10

  # Peripheral memory threshold (days without access)
  peripheralThreshold: 90

  # Archival recommendation threshold (days without access)
  archiveAfterDays: 180

  # Deletion recommendation threshold (days after archival)
  deleteAfterDays: 365

  # Allow correction tracking
  allowCorrections: true

  # Correction count threshold (flag for review if exceeded)
  correctionThreshold: 3
```

---

## Command Reference

### `memo lifecycle [options]`

Manage the memory lifecycle.

| Option | Description |
|--------|-------------|
| `--report` | Generate a full report (default) |
| `--tier <tier>` | View a specific tier (core/working/peripheral) |
| `--archive` | View memories eligible for archival |
| `--delete` | Delete a memory (requires --path) |
| `--flagged` | View memories flagged for review |

### `memo correct <path> [options]`

Record a memory correction.

| Option | Description |
|--------|-------------|
| `--reason <text>` | Reason for the correction |

---

## Practical Examples

### Example 1: Cleaning Up Stale Memories

```bash
# 1. View the report
memo lifecycle report

# 2. View peripheral memories
memo lifecycle --tier peripheral

# 3. View archival candidates
memo lifecycle archive

# 4. Archive outdated entries
memo lifecycle archive --path lessons/2023-obsolete.md
```

### Example 2: Correcting an Erroneous Memory

```bash
# 1. Discover the error in a memory
memo recall "redis pool"

# 2. View the original file
cat ~/.memobank/project/lessons/redis-pool.md

# 3. Record the correction
memo correct lessons/redis-pool.md \
  --reason "Pool size should be 10, not 5"

# 4. Edit the content
vim ~/.memobank/project/lessons/redis-pool.md

# 5. Verify the correction
memo recall "redis pool"
```

### Example 3: Team Review

```bash
# 1. View flagged memories
memo lifecycle flagged

# 2. Discuss these memories as a team

# 3. Decide to keep, modify, or delete

# 4. Commit the changes
git add .
git commit -m "review: fix flagged memories"
git push
```

---

## Summary

### Memory Optimisation Strategy

| Situation | Handling |
|-----------|----------|
| Frequently accessed | Maintain as core, prioritise retrieval |
| Not accessed for a long time | Reduce priority, recommend archival |
| Incorrect content | Record correction, update content |
| Corrected multiple times | Flag for review, team discussion |
| Completely outdated | Archive or delete |

### The Golden Rule

> **Memories are living documents, not set in stone.**
>
> Review regularly, correct promptly, and clean up decisively.
