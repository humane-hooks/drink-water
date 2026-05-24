#!/usr/bin/env node
// ⚠️  BATTLE-TESTED — DO NOT MODIFY without testing across all humane-hooks.
// This code atomically edits Claude Code's settings.json. It coexists with
// other hooks, creates timestamped backups, and is idempotent. Changes here
// risk breaking all installs. If you think you need to change this, open an
// issue on humane-hooks/template first.
'use strict';

// Usage:
//   node merge-settings.js <settings-path> install-hook       <hook-path> <event> <subcommand> [matcher]
//   node merge-settings.js <settings-path> remove-hook        <hook-path> <event>
//   node merge-settings.js <settings-path> install-permission <rule>
//   node merge-settings.js <settings-path> remove-permission  <rule>
//
// Idempotency:
//   - install-hook: dedups any existing entries under <event> whose command
//     contains <hook-path>, then appends one fresh entry. Net effect is one
//     entry, regardless of prior state.
//   - remove-hook: removes ALL entries under <event> whose command contains
//     <hook-path>. Prunes empty event arrays.
//   - install-permission: appends <rule> to permissions.allow if not already
//     present (exact match).
//   - remove-permission: removes <rule> from permissions.allow if present.
//
// All operations create a timestamped backup before writing, but only when
// the file is actually modified. No backup on no-op.

const fs = require('node:fs');
const path = require('node:path');

function usage() {
  process.stderr.write(
    'Usage:\n' +
    '  merge-settings.js <settings-path> install-hook       <hook-path> <event> <subcommand> [matcher]\n' +
    '  merge-settings.js <settings-path> remove-hook        <hook-path> <event>\n' +
    '  merge-settings.js <settings-path> install-permission <rule>\n' +
    '  merge-settings.js <settings-path> remove-permission  <rule>\n'
  );
}

function readSettings(p) {
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    process.stderr.write(`settings.json exists but is not valid JSON: ${err.message}\n`);
    process.exit(1);
  }
}

function writeAtomic(p, obj) {
  let mode = null;
  try { mode = fs.statSync(p).mode & 0o777; } catch (_) {}
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  if (mode !== null) fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, p);
}

function backup(p) {
  if (!fs.existsSync(p)) return null;
  const dest = `${p}.humane-hook-backup-${Date.now()}`;
  fs.copyFileSync(p, dest);
  return dest;
}

// True if any hook inside the entry has a command containing the hook path.
function entryMatchesHook(entry, hookPath) {
  if (!entry || !Array.isArray(entry.hooks)) return false;
  return entry.hooks.some((h) => h && typeof h.command === 'string' && h.command.includes(hookPath));
}

function buildHookCommand(hookPath, subCommand) {
  return `node ${JSON.stringify(hookPath)} ${subCommand}`;
}

function doInstallHook(settings, hookPath, eventName, subCommand, matcher) {
  settings.hooks = settings.hooks || {};
  const arr = (settings.hooks[eventName] = settings.hooks[eventName] || []);
  const before = arr.length;
  const filtered = arr.filter((entry) => !entryMatchesHook(entry, hookPath));
  const removed = before - filtered.length;
  const entry = {
    hooks: [{ type: 'command', command: buildHookCommand(hookPath, subCommand) }],
  };
  if (matcher) entry.matcher = matcher;
  filtered.push(entry);
  settings.hooks[eventName] = filtered;
  // If we only stripped duplicates and re-appended an identical entry, it's
  // still a write. Caller compares-by-serialization to decide whether to write.
  return {
    summary: removed > 0
      ? `Replaced ${removed} existing ${eventName} entr${removed === 1 ? 'y' : 'ies'} for ${path.basename(hookPath)}.`
      : `Installed ${eventName} entry for ${path.basename(hookPath)}.`,
  };
}

function doRemoveHook(settings, hookPath, eventName) {
  if (!settings.hooks || !Array.isArray(settings.hooks[eventName])) {
    return { summary: `No ${eventName} entries to remove.` };
  }
  const arr = settings.hooks[eventName];
  const before = arr.length;
  const filtered = arr.filter((entry) => !entryMatchesHook(entry, hookPath));
  const removed = before - filtered.length;
  if (removed === 0) return { summary: `No ${eventName} entries to remove for ${path.basename(hookPath)}.` };
  if (filtered.length === 0) delete settings.hooks[eventName];
  else settings.hooks[eventName] = filtered;
  return { summary: `Removed ${removed} ${eventName} entr${removed === 1 ? 'y' : 'ies'} for ${path.basename(hookPath)}.` };
}

function doInstallPermission(settings, rule) {
  settings.permissions = settings.permissions || {};
  const allow = (settings.permissions.allow = settings.permissions.allow || []);
  if (allow.includes(rule)) return { summary: `Permission already present: ${rule}` };
  allow.push(rule);
  return { summary: `Added permission: ${rule}` };
}

function doRemovePermission(settings, rule) {
  if (!settings.permissions || !Array.isArray(settings.permissions.allow)) {
    return { summary: `No permissions.allow array — nothing to remove.` };
  }
  const allow = settings.permissions.allow;
  const before = allow.length;
  settings.permissions.allow = allow.filter((r) => r !== rule);
  const removed = before - settings.permissions.allow.length;
  if (removed === 0) return { summary: `Permission not present: ${rule}` };
  return { summary: `Removed permission: ${rule}` };
}

function run() {
  const args = process.argv.slice(2);
  const [settingsPath, subcommand, ...rest] = args;
  if (!settingsPath || !subcommand) { usage(); process.exit(2); }

  const before = readSettings(settingsPath);
  // Deep-clone via JSON round-trip — settings are plain data and small.
  const settings = JSON.parse(JSON.stringify(before));
  let result;

  switch (subcommand) {
    case 'install-hook': {
      const [hookPath, eventName, subCommand, matcher] = rest;
      if (!hookPath || !eventName || !subCommand) { usage(); process.exit(2); }
      result = doInstallHook(settings, hookPath, eventName, subCommand, matcher);
      break;
    }
    case 'remove-hook': {
      const [hookPath, eventName] = rest;
      if (!hookPath || !eventName) { usage(); process.exit(2); }
      result = doRemoveHook(settings, hookPath, eventName);
      break;
    }
    case 'install-permission': {
      const [rule] = rest;
      if (!rule) { usage(); process.exit(2); }
      result = doInstallPermission(settings, rule);
      break;
    }
    case 'remove-permission': {
      const [rule] = rest;
      if (!rule) { usage(); process.exit(2); }
      result = doRemovePermission(settings, rule);
      break;
    }
    default:
      usage();
      process.exit(2);
  }

  const beforeJson = JSON.stringify(before);
  const afterJson = JSON.stringify(settings);
  if (beforeJson === afterJson) {
    process.stdout.write(`${result.summary} (no change)\n`);
    return;
  }

  const backupPath = backup(settingsPath);
  try {
    writeAtomic(settingsPath, settings);
    const tail = backupPath ? ` (backup: ${backupPath})` : '';
    process.stdout.write(`${result.summary}${tail}\n`);
  } catch (err) {
    if (backupPath) {
      try {
        fs.copyFileSync(backupPath, settingsPath);
        process.stderr.write(`Write failed; original restored from ${backupPath}\n`);
      } catch (_) {
        process.stderr.write(`Write AND restore both failed. Manual recovery: cp ${backupPath} ${settingsPath}\n`);
      }
    }
    process.stderr.write(`Failed to write settings: ${err.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) run();

module.exports = {
  buildHookCommand,
  entryMatchesHook,
  doInstallHook,
  doRemoveHook,
  doInstallPermission,
  doRemovePermission,
};
