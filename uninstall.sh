#!/usr/bin/env sh
set -eu

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_PATH="$REPO_DIR/hooks/drink-water.js"
MERGE_SCRIPT="$REPO_DIR/scripts/merge-settings.js"

GLOBAL_SETTINGS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
PROJECT_SETTINGS=".claude/settings.json"

echo "Uninstalling Drink-Water..."

# Remove hooks (UserPromptSubmit + any legacy PreToolUse) and permission rules
# from both possible locations. Each operation is a no-op if nothing matches.
for SETTINGS in "$GLOBAL_SETTINGS" "$PROJECT_SETTINGS"; do
  [ -f "$SETTINGS" ] || continue
  node "$MERGE_SCRIPT" "$SETTINGS" remove-hook "$HOOK_PATH" "UserPromptSubmit" || true
  node "$MERGE_SCRIPT" "$SETTINGS" remove-hook "$HOOK_PATH" "PreToolUse" || true
  node "$MERGE_SCRIPT" "$SETTINGS" remove-permission "Bash(node $HOOK_PATH --ack)" || true
  node "$MERGE_SCRIPT" "$SETTINGS" remove-permission "Bash(node $HOOK_PATH --status)" || true
  node "$MERGE_SCRIPT" "$SETTINGS" remove-permission "Bash(node $HOOK_PATH --snooze:*)" || true
done

# Remove skill and slash-command files from both possible locations.
for base in "${CLAUDE_CONFIG_DIR:-$HOME/.claude}" ".claude"; do
  rm -f "$base/skills/drink-water/SKILL.md" 2>/dev/null || true
  rmdir "$base/skills/drink-water" 2>/dev/null || true
  rm -f "$base/commands/drink-water.md" "$base/commands/drink-water-snooze.md" "$base/commands/drink-water-status.md" 2>/dev/null || true
done

# Offer to delete state file.
STATE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/drink-water/state.json"
if [ -f "$STATE" ]; then
  printf "Delete state file at %s? [y/N]: " "$STATE"
  read ANS || true
  case "${ANS:-}" in
    y|Y) rm -f "$STATE"; rmdir "$(dirname "$STATE")" 2>/dev/null || true; echo "State deleted." ;;
    *) echo "Kept state file." ;;
  esac
fi

echo "Drink-Water uninstalled."
