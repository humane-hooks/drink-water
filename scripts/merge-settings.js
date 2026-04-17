#!/usr/bin/env node
// ⚠️  BATTLE-TESTED — DO NOT MODIFY
// This code atomically edits Claude Code's settings.json.
// It coexists with other hooks, creates timestamped backups,
// and is idempotent. Changes here risk breaking all installs.
// If you think you need to change this, open an issue on
// humane-hooks/template first.
'use strict';

// Usage: node merge-settings.js <settings.json-path> <hook-path> <marker> <event> <subcommand> [matcher]
//
// Atomically merges a hook entry into settings.json for the given event.
// Idempotent: if a hook with the given marker already exists under that event, exits 0 with "already installed".
// Backs up the original to <settings.json>.humane-hook-backup-<epoch> before writing.
//
// <event>      — e.g. "UserPromptSubmit" or "PreToolUse"
// <subcommand> — flag passed to the hook script, e.g. "--check" or "--pretool"
// [matcher]    — optional tool-name matcher for events that support it (e.g. "Bash")

const fs = require('node:fs');
const path = require('node:path');

const [settingsPath, hookPath, marker, eventName, subCommand, matcher] = process.argv.slice(2);
if (!settingsPath || !hookPath || !marker || !eventName || !subCommand) {
  console.error('Usage: merge-settings.js <settings.json-path> <hook-path> <marker> <event> <subcommand> [matcher]');
  process.exit(2);
}

// Build the command string with safe JSON escaping of the path.
const hookCommand = `node ${JSON.stringify(hookPath)} ${subCommand}`;

function readJson(p) {
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.error(`settings.json exists but is not valid JSON: ${err.message}`);
    process.exit(1);
  }
}

function writeJsonAtomic(p, obj) {
  let originalMode = null;
  try {
    originalMode = fs.statSync(p).mode & 0o777;
  } catch (_) {
    // File doesn't exist yet — use default permissions.
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  if (originalMode !== null) fs.chmodSync(tmp, originalMode);
  fs.renameSync(tmp, p);
}

const settings = readJson(settingsPath);

// Ensure structure exists.
settings.hooks = settings.hooks || {};
settings.hooks[eventName] = settings.hooks[eventName] || [];

// Idempotency: structural check on _humane_hook_marker field, scoped to this event.
// The same marker may legitimately appear under multiple events (one per hook type),
// so we only skip if an entry with this marker is already registered under THIS event.
const already = settings.hooks[eventName].some(
  (entry) =>
    Array.isArray(entry.hooks) &&
    entry.hooks.some((h) => h && h._humane_hook_marker === marker)
);
if (already) {
  console.log(`Drink-Water ${eventName} hook already installed — nothing to do.`);
  process.exit(0);
}

// Backup before any modification.
let backupPath = null;
if (fs.existsSync(settingsPath)) {
  backupPath = `${settingsPath}.humane-hook-backup-${Date.now()}`;
  fs.copyFileSync(settingsPath, backupPath);
  console.log(`Backed up existing settings to ${backupPath}`);
}

// Append the hook. Include matcher field only when provided (PreToolUse et al).
const entry = {
  hooks: [
    {
      type: 'command',
      command: hookCommand,
      _humane_hook_marker: marker,
    },
  ],
};
if (matcher) entry.matcher = matcher;
settings.hooks[eventName].push(entry);

try {
  writeJsonAtomic(settingsPath, settings);
  console.log(`Installed Drink-Water ${eventName} hook into ${settingsPath}`);
} catch (err) {
  // Rollback: restore backup if one was created.
  if (backupPath) {
    try {
      fs.copyFileSync(backupPath, settingsPath);
      console.error(`Write failed; original restored from ${backupPath}`);
    } catch (restoreErr) {
      console.error(`Write AND restore both failed. Manual recovery: cp ${backupPath} ${settingsPath}`);
    }
  }
  console.error(`Failed to write settings: ${err.message}`);
  process.exit(1);
}
