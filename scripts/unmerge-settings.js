#!/usr/bin/env node
// ⚠️  BATTLE-TESTED — DO NOT MODIFY
// This code atomically edits Claude Code's settings.json.
// It coexists with other hooks, creates timestamped backups,
// and is idempotent. Changes here risk breaking all installs.
// If you think you need to change this, open an issue on
// humane-hooks/template first.
'use strict';

// Usage: node unmerge-settings.js <settings.json-path> <marker>
// Removes any UserPromptSubmit hook entries carrying the given _humane_hook_marker.
// Exits 0 whether or not anything was removed. Backs up before modifying.

const fs = require('node:fs');
const path = require('node:path');

const [settingsPath, marker] = process.argv.slice(2);
if (!settingsPath || !marker) {
  console.error('Usage: unmerge-settings.js <settings.json-path> <marker>');
  process.exit(2);
}

if (!fs.existsSync(settingsPath)) {
  console.log('settings.json not found — nothing to unmerge.');
  process.exit(0);
}

let settings;
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
} catch (err) {
  console.error(`settings.json is not valid JSON: ${err.message}`);
  process.exit(1);
}

if (!settings.hooks || !Array.isArray(settings.hooks.UserPromptSubmit)) {
  console.log('No UserPromptSubmit hooks — nothing to unmerge.');
  process.exit(0);
}

// Backup before any modification.
const backupPath = `${settingsPath}.humane-hook-backup-${Date.now()}`;
fs.copyFileSync(settingsPath, backupPath);

const before = settings.hooks.UserPromptSubmit.length;

// Use structural match on _humane_hook_marker (mirrors merge-settings.js).
settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter((entry) => {
  if (!Array.isArray(entry.hooks)) return true;
  return !entry.hooks.some((h) => h && h._humane_hook_marker === marker);
});

const after = settings.hooks.UserPromptSubmit.length;

// Atomic write with permission preservation (same pattern as merge-settings.js).
function writeJsonAtomic(p, obj) {
  let originalMode = null;
  try {
    originalMode = fs.statSync(p).mode & 0o777;
  } catch (_) {}
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  if (originalMode !== null) fs.chmodSync(tmp, originalMode);
  fs.renameSync(tmp, p);
}

try {
  writeJsonAtomic(settingsPath, settings);
  console.log(`Removed ${before - after} Drink-Water hook entries. Backup: ${backupPath}`);
} catch (err) {
  // Rollback on failure.
  try {
    fs.copyFileSync(backupPath, settingsPath);
    console.error(`Unmerge failed; original restored from ${backupPath}`);
  } catch (restoreErr) {
    console.error(`Unmerge AND restore both failed. Manual recovery: cp ${backupPath} ${settingsPath}`);
  }
  console.error(`Failed to write settings: ${err.message}`);
  process.exit(1);
}
