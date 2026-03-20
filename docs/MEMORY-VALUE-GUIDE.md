# Memobank Memory Value Assessment Guide

## How to Determine Which Memories Are Worth Recording

Memobank CLI uses a multi-layer filtering system to determine which content is worth saving as a memory.

---

## Automatic Filtering Mechanism

### 1. Noise Detection (Noise Filter)

The system automatically filters out the following low-value content:

#### ❌ Content That Is Not Recorded

| Type | Examples | Reason |
|------|----------|--------|
| **Simple actions** | "Opened a file", "Ran the tests" | No learning value |
| **Greetings** | "Hello", "Thank you", "Goodbye" | Conversational courtesy |
| **Simple confirmations** | "OK", "Yes", "No problem" | No substantive content |
| **Meta questions** | "Who are you", "What can you do" | About the AI itself |
| **Trivial changes** | "Fixed a typo", "Formatted code" | No long-term value |

### 2. High-Value Indicator Detection

#### ✅ Content That Is Recorded

| Type | Keywords | Example |
|------|----------|---------|
| **Problem solving** | problem, issue, bug, fix, solution | "Fixed the Redis connection pool exhaustion issue" |
| **Decision rationale** | decided, choice, trade-off, because | "Chose PostgreSQL because ACID compliance was required" |
| **Learning insights** | learned, discovered, realized | "Discovered that connection pool size affects performance" |
| **Patterns and practices** | pattern, practice, principle | "Using the repository pattern to decouple data access" |
| **Architectural design** | architecture, design, component | "Responsibility boundaries in a microservices architecture" |
| **Performance optimisation** | performance, optimize, scalability | "Reducing database queries through caching" |
| **Security considerations** | security, authentication, vulnerability | "Best practices for implementing JWT authentication" |
| **Workflows** | workflow, process, deployment | "Configuration steps for the CI/CD pipeline" |

---

## Value Scoring System

The system calculates a value score between 0 and 1 for each potential memory:

### Scoring Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| **Base score** | 0.5 | Starting score for all content |
| **Length factor** | +0.2 | Full score awarded for 500+ characters |
| **High-value patterns** | +0.3 | +0.05 per pattern, up to +0.3 |
| **Low-value patterns** | -0.2 | -0.2 per pattern |
| **Code examples** | +0.1 | Contains a code block |
| **Structured content** | +0.1 | Has headings, lists, etc. |

### Interpreting the Score

```
Score ≥ 0.7  ✅ High value — strongly recommended to record
0.5–0.7      ⚠️  Medium value — recommended to record
0.3–0.5      ❌  Low value — recommended to skip
Score < 0.3  ❌  Very low value — filtered out automatically
```

---

## Practical Usage Examples

### Example 1: High-Value Memory

**Session content:**
```
Today I fixed a Redis connection pool exhaustion issue in the production environment.

Problem: Under high concurrency, the Redis connection pool was exhausted, causing requests to fail.

Investigation process:
1. Monitoring showed the connection count had reached its limit
2. Logs showed a large number of timeout errors
3. Discovered that the code was not releasing connections correctly

Solution:
1. Use connection pool management
2. Release connections in the finally block
3. Set a reasonable timeout

Code example:
```typescript
const pool = new RedisPool({ max: 10, timeout: 5000 });
try {
  const client = await pool.acquire();
  return await client.get(key);
} finally {
  await pool.release(client);
}
```

Lessons learned:
- Adjust pool size based on concurrency (typically 5–10)
- Always release connections in the finally block
- Set a timeout to avoid blocking
```

**Assessment result:**
```
✅ [1] redis-connection-pool-fix
   Score: 0.92 | High-value content worth remembering
   Confidence: high
```

**Reason for this rating:**
- ✅ Contains a problem description and solution
- ✅ Includes an investigation process and code example
- ✅ Contains lessons learned
- ✅ Structured content (headings, lists, code blocks)
- ✅ High-value keywords (problem, solution, fix)

---

### Example 2: Low-Value Content

**Session content:**
```
Sure, I'll run the tests for you.

I've opened the test file.
Executed the npm test command.
The tests passed.

Is there anything else you need help with?
```

**Assessment result:**
```
❌ Skipped (noise): unnamed
```

**Reason for this rating:**
- ❌ Simple actions (opening a file, running a command)
- ❌ Greetings and confirmations
- ❌ No learning value
- ❌ Too short

---

### Example 3: Medium-Value Content

**Session content:**
```
Today I learnt how to create routes with Express.

Created user routes:
- GET /users - retrieve user list
- POST /users - create a user

Used Express Router.
```

**Assessment result:**
```
⚠️ [1] express-routing-basics
   Score: 0.58 | Potentially useful context
   Confidence: medium
```

**Reason for this rating:**
- ⚠️ Has some structure
- ⚠️ Contains specific information
- ⚠️ However, it is fairly basic and may be common knowledge

---

## Manual Assessment Guide

When the system score is on the boundary, you can assess manually:

### Ask Yourself These Questions

1. **Will I still care about this in 6 months?**
   - Yes → Record it
   - No → Skip it

2. **Can this experience be applied to other situations?**
   - Yes → Record it
   - No → It may be context-specific

3. **If I forgot this, how long would it take to rediscover?**
   - A long time → Record it
   - Not long → It may not be necessary

4. **Would team members benefit from this experience?**
   - Yes → Record it
   - No → It may be a personal preference

5. **Will the reasoning behind this decision still matter in the future?**
   - Yes → Record it
   - No → It may be a temporary solution

---

## Memory Type Priorities

### High Priority (Strongly Recommended to Record)

| Type | Description | Example |
|------|-------------|---------|
| **Lesson** | Learnt from mistakes or problems | "Solution to Redis connection pool exhaustion" |
| **Decision** | Important architectural or technical decisions | "Why PostgreSQL was chosen" |

### Medium Priority (Recommended to Record)

| Type | Description | Example |
|------|-------------|---------|
| **Workflow** | Repetitive workflows | "Production environment deployment process" |
| **Architecture** | System design documentation | "Microservices architecture diagram" |

### Low Priority (Record Selectively)

| Type | Description | Example |
|------|-------------|---------|
| **Temporary solutions** | Stopgap measures | "Temporary fix: restart the service" |
| **Personal preferences** | Coding style | "I prefer single quotes" |

---

## Usage Recommendations

### 1. Let the System Filter Automatically

```bash
# The system will assess and filter automatically
memo capture --auto

# View the assessment results
# ✅ High-value memories will be recorded
# ❌ Low-value content will be skipped
```

### 2. Think Before Creating Manually

```bash
# Before creating a memory, assess its value
memo write lesson
# Ask yourself: is this worth recording?
```

### 3. Review and Clean Up Regularly

```bash
# View memories due for review
memo review

# Delete memories that no longer have value
# (delete the file manually)
```

---

## Configuration Recommendations

### Adjusting the Filter Threshold

In `meta/config.yaml`:

```yaml
capture:
  min_value_score: 0.5  # minimum score to record
  max_memories_per_session: 3  # maximum memories per session
```

### Customising High-Value Patterns

Add custom patterns in the code:

```typescript
// src/core/noise-filter.ts
const CUSTOM_HIGH_VALUE_PATTERNS = [
  /your-project-specific-keyword/i,
];
```

---

## Summary

**Characteristics of a good memory:**
- ✅ Solves a real problem
- ✅ Contains the reasoning behind a decision
- ✅ Can be reused
- ✅ Has code or examples
- ✅ Clearly structured

**Characteristics of a poor memory:**
- ❌ Records simple actions
- ❌ Trivial changes
- ❌ Temporary solutions
- ❌ Personal preferences
- ❌ Lacks context

**The Golden Rule:**
> Record what your future self will thank you for, not merely what your past self has done.
