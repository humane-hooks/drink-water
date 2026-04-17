#!/usr/bin/env node
// ⚠️  BATTLE-TESTED — DO NOT MODIFY
// This code atomically edits Claude Code's settings.json.
// It coexists with other hooks, creates timestamped backups,
// and is idempotent. Changes here risk breaking all installs.
// If you think you need to change this, open an issue on
// humane-hooks/template first.
'use strict';

// Usage: node merge-settings.js <settings.json-path> <hook-path> <marker>
//
// Atomically merges a UserPromptSubmit hook entry into settings.json.
// Idempotent: if a hook with the given marker already exists, exits 0 with "already installed".
// Backs up the original to <settings.json>.humane-hook-backup-<epoch> before writing.

const fs = require('node:fs');
const path = require('node:path');

const [settingsPath, hookPath, marker] = process.argv.slice(2);
if (!settingsPath || !hookPath || !marker) {
  console.error('Usage: merge-settings.js <settings.json-path> <hook-path> <marker>');
  process.exit(2);
}

// Build the command string with safe JSON escaping of the path.
const hookCommand = `node ${JSON.stringify(hookPath)} --check`;

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
settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit || [];

// Idempotency: structural check on _humane_hook_marker field.
const already = settings.hooks.UserPromptSubmit.some(
  (entry) =>
    Array.isArray(entry.hooks) &&
    entry.hooks.some((h) => h && h._humane_hook_marker === marker)
);
if (already) {
  console.log('Drink-Water hook already installed — nothing to do.');
  process.exit(0);
}

// Backup before any modification.
let backupPath = null;
if (fs.existsSync(settingsPath)) {
  backupPath = `${settingsPath}.humane-hook-backup-${Date.now()}`;
  fs.copyFileSync(settingsPath, backupPath);
  console.log(`Backed up existing settings to ${backupPath}`);
}

// Append the hook.
settings.hooks.UserPromptSubmit.push({
  hooks: [
    {
      type: 'command',
      command: hookCommand,
      _humane_hook_marker: marker,
    },
  ],
});

try {
  writeJsonAtomic(settingsPath, settings);
  console.log(`Installed Drink-Water hook into ${settingsPath}`);
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
