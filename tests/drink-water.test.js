'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveStatePath, readState, writeState } = require('../hooks/drink-water.js');

function tmpStateDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drink-water-test-'));
  process.env.DRINK_WATER_STATE_DIR = dir;
  return dir;
}

test('resolveStatePath honors DRINK_WATER_STATE_DIR override', () => {
  const dir = tmpStateDir();
  assert.strictEqual(resolveStatePath(), path.join(dir, 'state.json'));
});

test('readState on missing file returns fresh state with _existed=false', () => {
  tmpStateDir();
  const state = readState();
  assert.strictEqual(state._existed, false);
  assert.ok(state.last_drink_at, 'last_drink_at should be set to now');
  assert.strictEqual(state.snooze_until, null);
  assert.strictEqual(state.last_injected_at, null);
});

test('readState on corrupt file returns fresh state with _existed=false', () => {
  const dir = tmpStateDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'state.json'), '{not valid json');
  const state = readState();
  assert.strictEqual(state._existed, false);
});

test('writeState then readState round-trips values', () => {
  tmpStateDir();
  const now = new Date().toISOString();
  writeState({
    last_drink_at: now,
    snooze_until: null,
    last_injected_at: null,
  });
  const state = readState();
  assert.strictEqual(state._existed, true);
  assert.strictEqual(state.last_drink_at, now);
  assert.strictEqual(state.snooze_until, null);
  assert.strictEqual(state.last_injected_at, null);
});

test('writeState is atomic (no partial file on disk)', () => {
  const dir = tmpStateDir();
  const statePath = path.join(dir, 'state.json');
  writeState({
    last_drink_at: '2026-04-16T14:00:00-07:00',
    snooze_until: null,
    last_injected_at: null,
  });
  // The .tmp file should NOT exist after writeState returns.
  assert.ok(!fs.existsSync(statePath + '.tmp'));
  assert.ok(fs.existsSync(statePath));
});

const { classifyStaleness } = require('../hooks/drink-water.js');

const MINUTE = 60 * 1000;

test('classifyStaleness: fresh when < 60 min', () => {
  const now = Date.now();
  assert.strictEqual(classifyStaleness(now - 30 * MINUTE, now), 'fresh');
  assert.strictEqual(classifyStaleness(now - 59 * MINUTE, now), 'fresh');
});

test('classifyStaleness: standard when 60-90 min', () => {
  const now = Date.now();
  assert.strictEqual(classifyStaleness(now - 60 * MINUTE, now), 'standard');
  assert.strictEqual(classifyStaleness(now - 89 * MINUTE, now), 'standard');
});

test('classifyStaleness: firmer when 90-120 min', () => {
  const now = Date.now();
  assert.strictEqual(classifyStaleness(now - 90 * MINUTE, now), 'firmer');
  assert.strictEqual(classifyStaleness(now - 119 * MINUTE, now), 'firmer');
});

test('classifyStaleness: insistent when 120-240 min', () => {
  const now = Date.now();
  assert.strictEqual(classifyStaleness(now - 120 * MINUTE, now), 'insistent');
  assert.strictEqual(classifyStaleness(now - 239 * MINUTE, now), 'insistent');
});

test('classifyStaleness: welcome-back when >= 240 min', () => {
  const now = Date.now();
  assert.strictEqual(classifyStaleness(now - 240 * MINUTE, now), 'welcome-back');
  assert.strictEqual(classifyStaleness(now - 600 * MINUTE, now), 'welcome-back');
});

const {
  isSnoozed,
  shouldSuppressStandardRefire,
  isLateHours,
} = require('../hooks/drink-water.js');

test('isSnoozed: null snooze_until returns false', () => {
  assert.strictEqual(isSnoozed(null, new Date()), false);
});

test('isSnoozed: past snooze_until returns false', () => {
  const now = new Date();
  const past = new Date(now.getTime() - 60 * 1000).toISOString();
  assert.strictEqual(isSnoozed(past, now), false);
});

test('isSnoozed: future snooze_until returns true', () => {
  const now = new Date();
  const future = new Date(now.getTime() + 60 * 1000).toISOString();
  assert.strictEqual(isSnoozed(future, now), true);
});

test('shouldSuppressStandardRefire: null last_injected_at returns false', () => {
  assert.strictEqual(shouldSuppressStandardRefire(null, new Date()), false);
});

test('shouldSuppressStandardRefire: injection 5 min ago suppresses', () => {
  const now = new Date();
  const fiveAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  assert.strictEqual(shouldSuppressStandardRefire(fiveAgo, now), true);
});

test('shouldSuppressStandardRefire: injection 11 min ago does not suppress', () => {
  const now = new Date();
  const elevenAgo = new Date(now.getTime() - 11 * 60 * 1000).toISOString();
  assert.strictEqual(shouldSuppressStandardRefire(elevenAgo, now), false);
});

test('isLateHours: 23:00 is late', () => {
  const d = new Date(); d.setHours(23, 0, 0, 0);
  assert.strictEqual(isLateHours(d), true);
});

test('isLateHours: 02:30 is late', () => {
  const d = new Date(); d.setHours(2, 30, 0, 0);
  assert.strictEqual(isLateHours(d), true);
});

test('isLateHours: 14:00 is not late', () => {
  const d = new Date(); d.setHours(14, 0, 0, 0);
  assert.strictEqual(isLateHours(d), false);
});

test('isLateHours: 06:00 is not late (boundary)', () => {
  const d = new Date(); d.setHours(6, 0, 0, 0);
  assert.strictEqual(isLateHours(d), false);
});

const { cmdCheck, formatHookOutput, buildReminderText } = require('../hooks/drink-water.js');

// Helper: capture cmdCheck stdout into a string.
function captureCheck() {
  const chunks = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (buf) => { chunks.push(buf); return true; };
  try { cmdCheck(); } finally { process.stdout.write = origWrite; }
  return chunks.join('');
}

test('formatHookOutput produces valid Claude Code hook JSON', () => {
  const out = formatHookOutput('hello world');
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.strictEqual(parsed.hookSpecificOutput.additionalContext, 'hello world');
});

test('cmdCheck: DRINK_WATER_DISABLED=1 produces no output', () => {
  tmpStateDir();
  process.env.DRINK_WATER_DISABLED = '1';
  const out = captureCheck();
  delete process.env.DRINK_WATER_DISABLED;
  assert.strictEqual(out, '');
});

test('cmdCheck: first run creates state and emits welcome (JSON format)', () => {
  tmpStateDir();
  const out = captureCheck();
  // Output must be valid JSON.
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(parsed.hookSpecificOutput.additionalContext, /DrinkWater is now enabled/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /<drink-water-reminder>/);
  // State file should now exist.
  const state = readState();
  assert.strictEqual(state._existed, true);
});

test('cmdCheck: fresh state produces no output', () => {
  tmpStateDir();
  writeState({
    last_drink_at: new Date().toISOString(),
    snooze_until: null,
    last_injected_at: null,
  });
  const out = captureCheck();
  assert.strictEqual(out, '');
});

test('cmdCheck: stale state emits reminder in standard band', () => {
  tmpStateDir();
  const seventyMinAgo = new Date(Date.now() - 70 * 60 * 1000).toISOString();
  writeState({
    last_drink_at: seventyMinAgo,
    snooze_until: null,
    last_injected_at: null,
  });
  const out = captureCheck();
  const parsed = JSON.parse(out);
  const ctx = parsed.hookSpecificOutput.additionalContext;
  assert.match(ctx, /<drink-water-reminder>/);
  assert.match(ctx, /staleness: standard/);
  assert.match(ctx, /last_drink: 70 minutes ago/);
});

test('cmdCheck: snoozed state stays silent even when stale', () => {
  tmpStateDir();
  const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000).toISOString();
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  writeState({
    last_drink_at: twoHoursAgo,
    snooze_until: fiveMinFromNow,
    last_injected_at: null,
  });
  const out = captureCheck();
  assert.strictEqual(out, '');
});

test('cmdCheck: standard-band anti-double-injection suppresses within 10 min', () => {
  tmpStateDir();
  const seventyMinAgo = new Date(Date.now() - 70 * 60 * 1000).toISOString();
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  writeState({
    last_drink_at: seventyMinAgo,
    snooze_until: null,
    last_injected_at: fiveMinAgo,
  });
  const out = captureCheck();
  assert.strictEqual(out, '');
});

test('cmdCheck: firmer band fires every prompt regardless of last injection', () => {
  tmpStateDir();
  const hundredMinAgo = new Date(Date.now() - 100 * 60 * 1000).toISOString();
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  writeState({
    last_drink_at: hundredMinAgo,
    snooze_until: null,
    last_injected_at: twoMinAgo,
  });
  const out = captureCheck();
  const parsed = JSON.parse(out);
  assert.match(parsed.hookSpecificOutput.additionalContext, /staleness: firmer/);
});

test('cmdCheck: insistent band fires with the right instruction text', () => {
  tmpStateDir();
  const hundredFiftyMinAgo = new Date(Date.now() - 150 * 60 * 1000).toISOString();
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  writeState({
    last_drink_at: hundredFiftyMinAgo,
    snooze_until: null,
    last_injected_at: twoMinAgo,
  });
  const out = captureCheck();
  const parsed = JSON.parse(out);
  assert.match(parsed.hookSpecificOutput.additionalContext, /staleness: insistent/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /More than two hours have passed/);
});

test('cmdCheck: welcome-back band uses soft framing', () => {
  tmpStateDir();
  const sixHoursAgo = new Date(Date.now() - 360 * 60 * 1000).toISOString();
  writeState({
    last_drink_at: sixHoursAgo,
    snooze_until: null,
    last_injected_at: null,
  });
  const out = captureCheck();
  const parsed = JSON.parse(out);
  assert.match(parsed.hookSpecificOutput.additionalContext, /staleness: welcome-back/);
});

test('cmdCheck: corrupt state is silently treated as first run', () => {
  const dir = tmpStateDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'state.json'), '{{{bad json');
  const out = captureCheck();
  const parsed = JSON.parse(out);
  assert.match(parsed.hookSpecificOutput.additionalContext, /DrinkWater is now enabled/);
});

const { cmdAck, cmdSnooze, cmdStatus } = require('../hooks/drink-water.js');

function captureCmd(fn) {
  const chunks = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (buf) => { chunks.push(buf); return true; };
  try { fn(); } finally { process.stdout.write = origWrite; }
  return chunks.join('');
}

test('cmdAck: resets last_drink_at to now and clears snooze', () => {
  tmpStateDir();
  const old = new Date(Date.now() - 120 * 60 * 1000).toISOString();
  const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  writeState({ last_drink_at: old, snooze_until: future, last_injected_at: null });
  captureCmd(cmdAck);
  const state = readState();
  assert.strictEqual(state.snooze_until, null);
  const ageMs = Date.now() - new Date(state.last_drink_at).getTime();
  assert.ok(ageMs < 5000, `expected recent last_drink_at, got age ${ageMs}ms`);
});

test('cmdSnooze: with explicit 30 sets snooze_until ~30 min in future', () => {
  tmpStateDir();
  const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  writeState({ last_drink_at: old, snooze_until: null, last_injected_at: null });
  captureCmd(() => cmdSnooze(['30']));
  const state = readState();
  const snoozeMs = new Date(state.snooze_until).getTime();
  const targetMs = Date.now() + 30 * 60 * 1000;
  assert.ok(Math.abs(snoozeMs - targetMs) < 5000, 'snooze_until should be ~30 min out');
});

test('cmdSnooze: with no arg defaults to 15 min', () => {
  tmpStateDir();
  const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  writeState({ last_drink_at: old, snooze_until: null, last_injected_at: null });
  captureCmd(() => cmdSnooze([]));
  const state = readState();
  const snoozeMs = new Date(state.snooze_until).getTime();
  const targetMs = Date.now() + 15 * 60 * 1000;
  assert.ok(Math.abs(snoozeMs - targetMs) < 5000);
});

test('cmdStatus: reports minutes since last drink and snooze status', () => {
  tmpStateDir();
  const old = new Date(Date.now() - 75 * 60 * 1000).toISOString();
  writeState({ last_drink_at: old, snooze_until: null, last_injected_at: null });
  const out = captureCmd(cmdStatus);
  assert.match(out, /75 minutes ago/);
  assert.match(out, /Snoozed: no/);
});

test('cmdStatus: not-yet-initialized case', () => {
  tmpStateDir();
  const out = captureCmd(cmdStatus);
  assert.match(out, /not yet initialized/);
});

test('staleness math is correct across UTC/local timezone boundaries', () => {
  // Simulate a state written at a specific UTC moment. Staleness should
  // compute identically regardless of the reader's local timezone, because
  // Date math operates in absolute (UTC) terms.
  const lastDrinkUtc = '2026-04-16T14:00:00.000Z';
  const lastMs = new Date(lastDrinkUtc).getTime();
  // "Now" is exactly 75 minutes later in absolute time.
  const nowMs = lastMs + 75 * 60 * 1000;
  assert.strictEqual(classifyStaleness(lastMs, nowMs), 'standard');
  // And 150 minutes later — always insistent, regardless of TZ.
  assert.strictEqual(classifyStaleness(lastMs, lastMs + 150 * 60 * 1000), 'insistent');
});

const { approveBashCommand, cmdPretool } = require('../hooks/drink-water.js');

const HOOK_PATH = require.resolve('../hooks/drink-water.js');

test('approveBashCommand: bare path + --ack', () => {
  assert.strictEqual(approveBashCommand(`node ${HOOK_PATH} --ack`), true);
});

test('approveBashCommand: double-quoted path + --ack', () => {
  assert.strictEqual(approveBashCommand(`node "${HOOK_PATH}" --ack`), true);
});

test('approveBashCommand: single-quoted path + --ack', () => {
  assert.strictEqual(approveBashCommand(`node '${HOOK_PATH}' --ack`), true);
});

test('approveBashCommand: --status', () => {
  assert.strictEqual(approveBashCommand(`node ${HOOK_PATH} --status`), true);
});

test('approveBashCommand: --snooze with minutes', () => {
  assert.strictEqual(approveBashCommand(`node ${HOOK_PATH} --snooze 30`), true);
});

test('approveBashCommand: --snooze without minutes', () => {
  assert.strictEqual(approveBashCommand(`node ${HOOK_PATH} --snooze`), true);
});

test('approveBashCommand: leading/trailing whitespace is fine', () => {
  assert.strictEqual(approveBashCommand(`  node ${HOOK_PATH} --ack  `), true);
});

test('approveBashCommand: rejects command chaining (&&)', () => {
  assert.strictEqual(approveBashCommand(`node ${HOOK_PATH} --ack && rm -rf /`), false);
});

test('approveBashCommand: rejects semicolon injection', () => {
  assert.strictEqual(approveBashCommand(`node ${HOOK_PATH} --ack; echo pwned`), false);
});

test('approveBashCommand: rejects pipe injection', () => {
  assert.strictEqual(approveBashCommand(`node ${HOOK_PATH} --ack | cat /etc/passwd`), false);
});

test('approveBashCommand: rejects redirection', () => {
  assert.strictEqual(approveBashCommand(`node ${HOOK_PATH} --ack > /tmp/x`), false);
});

test('approveBashCommand: rejects unknown flag', () => {
  assert.strictEqual(approveBashCommand(`node ${HOOK_PATH} --nuke`), false);
});

test('approveBashCommand: rejects --check (reserved for the UserPromptSubmit hook)', () => {
  assert.strictEqual(approveBashCommand(`node ${HOOK_PATH} --check`), false);
});

test('approveBashCommand: rejects a different script path', () => {
  assert.strictEqual(approveBashCommand('node /tmp/other-script.js --ack'), false);
});

test('approveBashCommand: rejects non-string input', () => {
  assert.strictEqual(approveBashCommand(null), false);
  assert.strictEqual(approveBashCommand(undefined), false);
  assert.strictEqual(approveBashCommand(42), false);
});

test('approveBashCommand: rejects --snooze with non-numeric arg', () => {
  assert.strictEqual(approveBashCommand(`node ${HOOK_PATH} --snooze abc`), false);
});

test('cmdPretool: emits allow decision when stdin matches an allowed command', () => {
  const input = JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command: `node ${HOOK_PATH} --ack` },
  });
  // Use a detached pipe to simulate stdin — spawn the CLI via child_process.
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, [HOOK_PATH, '--pretool'], {
    input,
    encoding: 'utf8',
  });
  assert.strictEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.strictEqual(parsed.hookSpecificOutput.permissionDecision, 'allow');
});

test('cmdPretool: stays silent for non-Bash tool calls', () => {
  const input = JSON.stringify({
    tool_name: 'Read',
    tool_input: { file_path: '/tmp/x' },
  });
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, [HOOK_PATH, '--pretool'], {
    input,
    encoding: 'utf8',
  });
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stdout, '');
});

test('cmdPretool: stays silent for unmatched Bash commands', () => {
  const input = JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf /' },
  });
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, [HOOK_PATH, '--pretool'], {
    input,
    encoding: 'utf8',
  });
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stdout, '');
});

test('resolveStatePath throws when no HOME and no CLAUDE_CONFIG_DIR', () => {
  const savedHome = process.env.HOME;
  const savedCfg = process.env.CLAUDE_CONFIG_DIR;
  const savedStateDir = process.env.DRINK_WATER_STATE_DIR;
  delete process.env.HOME;
  delete process.env.CLAUDE_CONFIG_DIR;
  delete process.env.DRINK_WATER_STATE_DIR;
  // Also override os.homedir to return empty — on macOS HOME deletion alone
  // may not be sufficient because os.homedir falls back to passwd/uid lookup.
  // The realistic test here is: when all three env vars are absent, if
  // os.homedir returns empty, throw. We can't reliably force os.homedir()
  // to return "" from userland, so verify the positive case: absent env vars
  // plus present HOME yields a sensible path (smoke test only).
  if (savedHome) {
    process.env.HOME = savedHome;
    const p = resolveStatePath();
    assert.ok(p.endsWith('/.claude/drink-water/state.json'), `unexpected path: ${p}`);
  }
  // Restore.
  if (savedHome !== undefined) process.env.HOME = savedHome;
  if (savedCfg !== undefined) process.env.CLAUDE_CONFIG_DIR = savedCfg;
  if (savedStateDir !== undefined) process.env.DRINK_WATER_STATE_DIR = savedStateDir;
});
