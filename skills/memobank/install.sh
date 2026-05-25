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

mkdir -p "$SKILL_DIR"

if [[ -f "$(dirname "$0")/SKILL.md" ]]; then
  cp "$(dirname "$0")/SKILL.md" "$SKILL_DIR/SKILL.md"
  echo -e "${GREEN}✓${NC} Installed from local repo → $SKILL_DIR"
else
  curl -fsSL "$RAW/skills/memobank/SKILL.md" -o "$SKILL_DIR/SKILL.md"
  echo -e "${GREEN}✓${NC} Installed from GitHub → $SKILL_DIR"
fi

echo ""
echo "Restart Claude Code, then use /memobank to activate."
