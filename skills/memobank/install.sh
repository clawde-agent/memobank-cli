#!/usr/bin/env bash
# memobank skill installer
#
# Usage (from repo root):
#   bash skills/memobank/install.sh
#
# Usage (remote, one-liner):
#   bash <(curl -fsSL https://raw.githubusercontent.com/clawde-agent/memobank-cli/main/skills/memobank/install.sh)

set -euo pipefail

if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
  echo "Error: do not run as root." >&2; exit 1
fi

RAW="https://raw.githubusercontent.com/clawde-agent/memobank-cli/main"
SKILL_DIR="${HOME}/.claude/skills/memobank"
GREEN='\033[0;32m'; NC='\033[0m'

mkdir -p "$SKILL_DIR/scripts"
mkdir -p "$SKILL_DIR/references"
mkdir -p "$SKILL_DIR/evals"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ -f "$SCRIPT_DIR/SKILL.md" ]]; then
  # Local repo install
  cp "$SCRIPT_DIR/SKILL.md"                      "$SKILL_DIR/SKILL.md"
  cp "$SCRIPT_DIR/scripts/recall-context.sh"     "$SKILL_DIR/scripts/recall-context.sh"
  cp "$SCRIPT_DIR/references/memory-protocol.md" "$SKILL_DIR/references/memory-protocol.md"
  cp "$SCRIPT_DIR/references/cli-reference.md"   "$SKILL_DIR/references/cli-reference.md"
  cp "$SCRIPT_DIR/references/claude-code.md"     "$SKILL_DIR/references/claude-code.md"
  cp "$SCRIPT_DIR/references/fallback.md"        "$SKILL_DIR/references/fallback.md"
  cp "$SCRIPT_DIR/evals/"*.json                  "$SKILL_DIR/evals/"
  cp "$SCRIPT_DIR/evals/README.md"               "$SKILL_DIR/evals/README.md"
  echo -e "${GREEN}✓${NC} Installed from local repo → $SKILL_DIR"
else
  # Remote install via curl
  FILES=(
    "SKILL.md"
    "scripts/recall-context.sh"
    "references/memory-protocol.md"
    "references/cli-reference.md"
    "references/claude-code.md"
    "references/fallback.md"
    "evals/README.md"
    "evals/01-session-start.json"
    "evals/02-bug-fix-lesson.json"
    "evals/03-pre-compact.json"
    "evals/04-stale-memory.json"
    "evals/05-architecture-decision.json"
  )
  for FILE in "${FILES[@]}"; do
    mkdir -p "$SKILL_DIR/$(dirname "$FILE")"
    curl -fsSL "$RAW/skills/memobank/$FILE" -o "$SKILL_DIR/$FILE"
  done
  echo -e "${GREEN}✓${NC} Installed from GitHub → $SKILL_DIR"
fi

chmod +x "$SKILL_DIR/scripts/recall-context.sh"

echo ""
echo "Restart Claude Code, then use /memobank to activate."
