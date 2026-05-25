# memobank Skill Evaluations

Behavioral evaluations for the memobank skill using [promptfoo](https://promptfoo.dev).
Each test checks whether the model correctly triggers `memo` commands in the right context
and in the right order.

## What is evaluated

All 8 triggers from the skill's trigger table are covered:

| #   | Eval                  | Trigger covered                                                        |
| --- | --------------------- | ---------------------------------------------------------------------- |
| 01  | Session start         | `memo map` + `memo recall --code` before any file exploration          |
| 02  | Bug fix lesson        | `memo write lesson` immediately after a non-obvious fix                |
| 03  | Pre-compact           | `memo capture` + `memo process-queue` before `/compact` erases context |
| 04  | Stale memory          | `memo correct` when a recalled memory contradicts current code         |
| 05  | Architecture decision | `memo write decision` before implementing a tech choice                |
| 06  | Workflow discovery    | `memo write workflow` after a repeatable process is found              |
| 07  | Architecture mapping  | `memo write architecture` after tracing system structure               |
| 08  | Study promotion       | `memo study` when a lesson has been recalled 3+ times                  |

## Running the evals

### Prerequisites

Choose one of the local provider options below.

**Option A — llamacpp HTTP server (default config)**

```bash
llama-server -m <path/to/Qwen3.6-35B-A3B-UD-Q5_K_M.gguf> --port 8080
```

**Option B — pi CLI exec provider**

No server needed — pi is called directly. Edit `promptfooconfig.yaml` and replace
the provider block with `id: file://provider-pi.js`. Verify pi flags match your version:

```bash
pi --help   # check --system-prompt and --no-interactive flags
```

**Option C — Ollama**

```bash
ollama serve
# then override provider at CLI:
npx promptfoo@latest eval -c skills/memobank/evals/promptfooconfig.yaml \
  --providers "openai:chat:qwen3:14b|config.apiBaseUrl=http://localhost:11434/v1|config.apiKey=local" \
  --no-cache --no-share
```

### Run

```bash
# Validate config
npx promptfoo@latest validate config -c skills/memobank/evals/promptfooconfig.yaml

# Run all 8 evals (output to JSON for CI)
npx promptfoo@latest eval \
  -c skills/memobank/evals/promptfooconfig.yaml \
  -o skills/memobank/evals/output.json \
  --no-cache --no-share

# Or use the npm script
npm run test:evals
```

### Windows (pi-node PATH workaround)

If `npx` resolves to pi's broken node instead of system Node, use the helper script:

```powershell
.\run-evals.ps1
```

(`run-evals.ps1` at the repo root calls `C:\Program Files\nodejs\npx.cmd` directly.)

### View results

```bash
npx promptfoo@latest view
```

### Using a cloud provider instead

Override the provider at the CLI without editing the config:

```bash
ANTHROPIC_API_KEY=sk-... npx promptfoo@latest eval \
  -c skills/memobank/evals/promptfooconfig.yaml \
  --providers anthropic:messages:claude-sonnet-4-6 \
  --no-cache --no-share
```

Or edit `promptfooconfig.yaml` and replace the provider block with:

```yaml
providers:
  - id: anthropic:messages:claude-sonnet-4-6
    label: claude-sonnet
    config:
      temperature: 0
      max_tokens: 1024
```

## Assertion strategy

Each test uses two tiers:

| Type         | Purpose                                                                            | Cost               |
| ------------ | ---------------------------------------------------------------------------------- | ------------------ |
| `icontains`  | Command presence — did the model mention `memo recall`, `memo write lesson`, etc.? | Free               |
| `llm-rubric` | Behavioral ordering — did the action happen at the right point in the sequence?    | 1 LLM call (local) |

The `icontains` weight is 3× the `llm-rubric` weight, so command presence dominates the score.
A model that mentions the command but gets the ordering wrong still passes with a lower score.

Evals 01 and 03 (timing-critical behaviors) use `threshold: 0.7`. All others use `threshold: 0.5`.
`not-icontains` assertions enforce `must_not` conditions for wrong-type and stop-hook-excuse failures.

## Files

| File                                                | Purpose                                        |
| --------------------------------------------------- | ---------------------------------------------- |
| `promptfooconfig.yaml`                              | Executable eval suite (promptfoo)              |
| `prompts/skill-behavior.json`                       | Chat-format prompt with inlined skill protocol |
| `output.json`                                       | Last eval run results (gitignored)             |
| `01-session-start.json` … `08-study-promotion.json` | Human-readable spec / design reference         |
