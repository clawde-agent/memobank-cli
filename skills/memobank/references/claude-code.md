# memobank — Claude Code Setup

## How it works

1. **Dynamic recall** (`!` injection): when you invoke `/memobank <task>`,
   `memo recall` runs _before_ Claude reads the prompt. Top-N memories are
   injected as context via `scripts/recall-context.sh`. Zero extra tool calls.

2. **Auto-capture** (`hooks.Stop`): when Claude finishes responding,
   `memo capture --auto --silent` runs in the background.
   Extracted learnings go to a `.pending/` queue; `memo process-queue`
   deduplicates and writes them to memory files.

3. **Auto-memory integration**: `memo init` (or `memo onboarding`) sets
   `autoMemoryEnabled: true` in `~/.claude/settings.json`. Claude's native
   auto-memory writes land in the project's `.memobank/` directory, and
   `memo capture` picks them up on the next Stop hook fire.

---

## Installation

### Option A: Interactive (recommended)

```bash
memo onboarding
```

Interactive TUI: project name → platform selection → workspace repo → search engine.

### Option B: CLI install (non-interactive)

```bash
memo init --platform claude-code
```

Sets `autoMemoryEnabled: true` and installs the Stop hook in `~/.claude/settings.json`.

### Option C: Manual skill copy

```bash
bash ~/.claude/skills/memobank/install.sh
# or from the repo root:
bash skills/memobank/install.sh
```

---

## Stop hook format (schema-compliant)

After running `memo init --platform claude-code`, your `~/.claude/settings.json` will contain:

```json
{
  "autoMemoryEnabled": true,
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "memo capture --auto --silent; memo process-queue --background",
            "timeout": 60,
            "async": true,
            "statusMessage": "Saving memories..."
          }
        ]
      }
    ]
  }
}
```

**Windows note**: `memo init` writes a PowerShell-aware variant automatically:

```
powershell -c "memo capture --auto --silent; memo process-queue --background"
```

---

## Configure autoMemoryDirectory (optional override)

To point Claude's native auto-memory at a custom directory:

```json
{
  "autoMemoryEnabled": true,
  "autoMemoryDirectory": "/absolute/path/to/your-project/.memobank"
}
```

---

## Usage

### Auto-triggered (recommended)

The skill triggers automatically when your first message involves code or files:

- Claude runs `memo map` then `memo recall "<topic>" --code`
- MEMORY.md is read and its contents inform the session

### Manual invocation

```text
/memobank deploy the new feature
/memobank debug the Redis connection issue
/memobank refactor the auth module
```

When invoked as `/memobank <task>`, the `$ARGUMENTS` are passed to
`recall-context.sh`, which runs `memo recall "<task>" --code --silent` and
injects the resulting MEMORY.md content before Claude processes your request.

### Code-aware recall

Index your project to enable code-aware search:

```bash
memo index-code .
```

Then recall searches both memories and code symbols:

```bash
memo recall "auth flow" --code
memo recall --refs handleLogin    # find where a function is used
```

---

## Troubleshooting

### `/memobank` command not found

Restart Claude Code. Skill files are loaded at startup.

### Memory context not appearing

Check that `memo recall` works in your terminal:

```bash
memo recall "test"
```

If memo is not installed: `npm install -g memobank-cli`

### Auto-capture not working

Check that `~/.claude/settings.json` has the Stop hook. Run `memo init --platform claude-code` to add it automatically.

---

## See also

- `references/memory-protocol.md` — when/how to write memories + templates
- `references/cli-reference.md` — full CLI flags
- `references/fallback.md` — how to use without CLI
