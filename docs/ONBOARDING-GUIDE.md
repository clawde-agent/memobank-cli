# Memobank CLI Interactive Onboarding Guide

## Quick Start

### Method 1: Interactive Menu (Recommended)

```bash
# Navigate to your project directory
cd /path/to/your/project

# Launch the interactive setup
memo onboarding

# Or use an alias
memo init
memo setup
```

### Interface Preview

```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🧠  Welcome to Memobank CLI Setup                       ║
║                                                           ║
║   Persistent memory for AI coding sessions                ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

📁 Project: my-project
📂 Location: /Users/you/.memobank/my-project

What would you like to do?

❯ ◉ Quick Setup - Recommended for most users
  ◯ Custom Setup - Configure each option
  ◯ Import Memories - From Claude Code, Gemini, etc.
  ◯ Platform Setup - Configure AI tools
  ◯ Embedding Setup - Vector search configuration
  ◯ Exit - Finish setup

Use ↑↓ arrows to navigate, Enter to select
```

---

## Menu Options Explained

### 1. Quick Setup

**Suitable for:** Most users who want to get started quickly

**Completed automatically:**
- ✅ Detects Ollama and configures local vector search
- ✅ Installs all platform integrations (Claude Code, Cursor, Codex)
- ✅ Creates the default configuration

**Steps:**
1. Select `Quick Setup`
2. Press Enter
3. Wait for the process to complete automatically

---

### 2. Custom Setup

**Suitable for:** Advanced users who want fine-grained control

**Steps:**

#### Step 1: Choose an Embedding Provider

```
Choose embedding provider:

❯ ◉ Ollama (Local, Free) - Recommended
  ◯ OpenAI (Cloud)
  ◯ Text Only (No embeddings)
```

**Option descriptions:**
- **Ollama**: Runs locally, free of charge, recommended
- **OpenAI**: Cloud API, requires an API key
- **Text Only**: Does not use vector search

#### Step 2: Select Platforms

```
Configure AI tools:

❯ [◉] Claude Code
  [◉] Cursor
  [◯] Codex (AGENTS.md)

↑↓ navigate, Space to toggle, Enter to confirm
```

**Controls:**
- ↑↓ to navigate
- Space to toggle selection
- Enter to confirm

---

### 3. Import Memories

**Suitable for:** Users migrating from other AI tools

**Supported tools:**
- Claude Code
- Gemini CLI
- Qwen Code

**Steps:**
1. Select `Import Memories`
2. Choose the source tool
3. Import completes automatically

---

### 4. Platform Setup

**Suitable for:** Users who only want to configure a specific platform

**Available platforms:**
- Claude Code
- Cursor
- Codex

---

### 5. Embedding Setup

**Suitable for:** Users who want to change their vector search configuration

**Options:**
- Ollama (local)
- OpenAI (cloud)
- Azure OpenAI
- Text Only (no vector search)

---

## Keyboard Shortcuts

| Key | Function |
|-----|----------|
| `↑` / `↓` | Navigate menu items |
| `Enter` | Confirm selection |
| `Space` | Toggle checkbox |
| `Ctrl+C` | Exit |

---

## Complete Workflow Examples

### Example 1: First-Time Use (Quick Setup)

```bash
# 1. Navigate to your project
cd my-project

# 2. Launch setup
memo onboarding

# 3. Select Quick Setup
# 4. Wait for completion

✅ Setup Complete!

Configuration:
  Embedding Engine: lancedb
  Provider: ollama
  Model: mxbai-embed-large

Next steps:
  memo write lesson          Create your first memory
  memo recall "query"        Search memories
  memo lifecycle report      View memory statistics
```

### Example 2: Custom Configuration

```bash
# 1. Launch setup
memo onboarding

# 2. Select Custom Setup

# 3. Choose OpenAI embedding
❯ ◉ OpenAI (Cloud)

# 4. Select platforms (Space to toggle)
❯ [◉] Claude Code
  [◯] Cursor
  [◉] Codex

# 5. Finish

✅ Custom Setup Complete!
```

---

## Post-Configuration Verification

```bash
# Check the configuration
cat ~/.memobank/my-project/meta/config.yaml

# Test recall
memo recall "test query"

# Create your first memory
memo write lesson
```

---

## Frequently Asked Questions

### Q: How do I re-run the setup?

```bash
# You can re-run it at any time
memo onboarding

# Select Exit to quit at any point
```

### Q: What if Ollama is not detected?

```bash
# 1. Install Ollama
brew install ollama  # macOS
# or visit https://ollama.ai

# 2. Pull the model
ollama pull mxbai-embed-large

# 3. Re-run the setup
memo onboarding
```

### Q: How do I change a platform that is already configured?

```bash
# Re-run the setup
memo onboarding

# Select Platform Setup
# Choose the platforms to add or remove
```

---

## Command Comparison

| Old Command | New Command | Description |
|-------------|-------------|-------------|
| `memo install` | `memo onboarding` | Interactive menu (recommended) |
| `memo setup` | `memo onboarding` | Merged into a single command |
| - | `memo init` | New alias |

**Backwards compatibility:**
- `memo install` is still available (simplified version)
- `memo setup` is still available (redirects to onboarding)

---

## Advanced Options

### Specify a Project Path

```bash
memo onboarding --repo /path/to/memobank
```

### Non-Interactive Mode (for use in scripts)

```bash
# Quick install (no prompts)
memo install --all

# Configure a specific platform only
memo install --claude-code
memo install --cursor
```

---

## Summary

**`memo onboarding` is recommended because:**

1. ✅ Intuitive menu navigation
2. ✅ Real-time option preview
3. ✅ Keyboard shortcut support
4. ✅ Automatic environment detection
5. ✅ All configuration in one place

**Getting started:**

```bash
cd your-project
memo onboarding
```
