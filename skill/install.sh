#!/usr/bin/env bash
# memobank-cli developer skill installer
#
# Usage (from repo root):
#   bash docs/skill/install.sh
#
# Usage (remote, one-liner):
#   bash <(curl -fsSL https://raw.githubusercontent.com/clawde-agent/memobank-cli/main/docs/skill/install.sh)

set -euo pipefail

if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
  echo "Error: do not run as root." >&2; exit 1
fi

REPO="https://github.com/clawde-agent/memobank-cli"
RAW="https://raw.githubusercontent.com/clawde-agent/memobank-cli/main"
SKILL_DIR="${HOME}/.claude/skills/memobank-cli"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

mkdir -p "$SKILL_DIR/references"

if [[ -f "$(dirname "$0")/SKILL.md" ]]; then
  # Local install (running from repo)
  BASE="$(cd "$(dirname "$0")" && pwd)"
  cp "$BASE/SKILL.md" "$SKILL_DIR/SKILL.md"
  for f in adding-commands.md debugging.md; do
    [[ -f "$BASE/references/$f" ]] && cp "$BASE/references/$f" "$SKILL_DIR/references/$f"
  done
  echo -e "${GREEN}✓${NC} Installed from local repo"
else
  # Remote install
  curl -fsSL "$RAW/docs/skill/SKILL.md" -o "$SKILL_DIR/SKILL.md"
  for f in adding-commands.md debugging.md; do
    curl -fsSL "$RAW/docs/skill/references/$f" -o "$SKILL_DIR/references/$f"
  done
  echo -e "${GREEN}✓${NC} Installed from $REPO"
fi

echo ""
echo -e "${GREEN}Done.${NC} Skill installed at: $SKILL_DIR"
echo ""
echo "Start Claude Code in the memobank-cli repo and try:"
echo "  /memobank-cli add a new command"
