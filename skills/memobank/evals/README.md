# memobank Skill Evaluations

Behavioral evaluations for the memobank skill. Each file tests whether Claude
triggers the correct `memo` commands in the correct context.

## Format

Each `.json` file follows the agent-skills eval schema:

```json
{
  "skills": ["memobank"],
  "query": "the user message to send",
  "context": "optional setup context / prior conversation",
  "expected_behavior": ["Claude does X", "Claude does Y before Z"],
  "must_not": ["Claude does NOT do A"]
}
```

## Running evaluations

There is no built-in runner. Options:

1. **Manual**: Open Claude Code with the skill installed, send the `query`, and
   verify behavior against `expected_behavior` and `must_not` checklists.

2. **Automated with evals framework**: Load each file, construct the test
   conversation, and use an LLM-as-judge prompt against `expected_behavior`.

## Evaluations in this directory

| File                            | What it tests                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `01-session-start.json`         | Triggers `memo map` + `memo recall` before first tool call when code is involved |
| `02-bug-fix-lesson.json`        | Writes a `lesson` memory immediately after fixing a non-obvious bug              |
| `03-pre-compact.json`           | Runs `memo capture` + `memo process-queue` before the context is compacted       |
| `04-stale-memory.json`          | Runs `memo correct` immediately when a recalled memory contradicts current code  |
| `05-architecture-decision.json` | Writes a `decision` memory after a technology choice is made                     |

## Pass criteria

A skill version **passes** when all 5 evals produce behavior matching every
item in `expected_behavior` and none of the items in `must_not`.
