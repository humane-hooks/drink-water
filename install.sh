#!/usr/bin/env sh
# Drink-Water installer — interactive global/project choice, safe merge into settings.json.
set -eu

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_PATH="$REPO_DIR/hooks/drink-water.js"
MERGE_SCRIPT="$REPO_DIR/scripts/merge-settings.js"
MARKER="drink-water-hook-v1"

echo ""
echo "Drink-Water helps you stay on track while coding with Claude Code."
echo ""

CHOICE=""
if [ "${1:-}" = "--global" ]; then
  CHOICE="G"
elif [ "${1:-}" = "--project" ]; then
  CHOICE="P"
else
  echo "Where should Drink-Water install?"
  echo ""
  echo "  [G] Global  — ~/.claude/settings.json"
  echo "              Tracks you across every project. Recommended."
  echo "              One source of truth; switching repos won't reset your clock."
  echo ""
  echo "  [P] Project — .claude/settings.json (current directory only)"
  echo "              Portable in the repo; state resets per-project."
  echo ""
  printf "Choice [G/P] (default G): "
  read CHOICE || true
  [ -z "$CHOICE" ] && CHOICE="G"
fi

case "$CHOICE" in
  G|g) SETTINGS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json" ;;
  P|p) SETTINGS=".claude/settings.json" ;;
  *) echo "Invalid choice: $CHOICE" >&2; exit 1 ;;
esac

echo ""
echo "Installing hook into: $SETTINGS"
node "$MERGE_SCRIPT" "$SETTINGS" "$HOOK_PATH" "$MARKER"

# Install skill and commands.
SKILLS_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/drink-water"
COMMANDS_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/commands"
if [ "$CHOICE" = "P" ] || [ "$CHOICE" = "p" ]; then
  SKILLS_DIR=".claude/skills/drink-water"
  COMMANDS_DIR=".claude/commands"
fi

mkdir -p "$SKILLS_DIR" "$COMMANDS_DIR"
if [ -f "$REPO_DIR/skills/drink-water/SKILL.md" ]; then
  cp "$REPO_DIR/skills/drink-water/SKILL.md" "$SKILLS_DIR/SKILL.md"
fi
for cmd in drink-water drink-water-snooze drink-water-status; do
  if [ -f "$REPO_DIR/commands/$cmd.md" ]; then
    sed "s|__HOOK_PATH__|$HOOK_PATH|g" "$REPO_DIR/commands/$cmd.md" > "$COMMANDS_DIR/$cmd.md"
  fi
done

echo ""
echo "Drink-Water is installed."
echo "  Skill:    $SKILLS_DIR/SKILL.md"
echo "  Commands: $COMMANDS_DIR/drink-water.md, drink-water-snooze.md, drink-water-status.md"
echo "  Hook:     $SETTINGS"
echo ""
echo "You'll see a confirmation message on your next prompt in Claude Code."
echo "To uninstall: $REPO_DIR/uninstall.sh"
echo "To suppress while hacking on Drink-Water: export DRINK_WATER_DISABLED=1"
