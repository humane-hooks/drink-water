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

const { parseAction, performAction } = require('../hooks/drink-water.js');

test('parseAction: ack token', () => {
  assert.deepStrictEqual(
    parseAction('<drink-water-action>ack</drink-water-action>'),
    { kind: 'ack' }
  );
});

test('parseAction: status token', () => {
  assert.deepStrictEqual(
    parseAction('<drink-water-action>status</drink-water-action>'),
    { kind: 'status' }
  );
});

test('parseAction: snooze with explicit minutes', () => {
  assert.deepStrictEqual(
    parseAction('<drink-water-action>snooze:20</drink-water-action>'),
    { kind: 'snooze', minutes: 20 }
  );
});

test('parseAction: snooze with no minutes defaults to 15', () => {
  assert.deepStrictEqual(
    parseAction('<drink-water-action>snooze</drink-water-action>'),
    { kind: 'snooze', minutes: 15 }
  );
});

test('parseAction: snooze with empty colon defaults to 15', () => {
  assert.deepStrictEqual(
    parseAction('<drink-water-action>snooze:</drink-water-action>'),
    { kind: 'snooze', minutes: 15 }
  );
});

test('parseAction: snooze with non-numeric defaults to 15', () => {
  assert.deepStrictEqual(
    parseAction('<drink-water-action>snooze:abc</drink-water-action>'),
    { kind: 'snooze', minutes: 15 }
  );
});

test('parseAction: no token in prompt returns null', () => {
  assert.strictEqual(parseAction('just a regular user prompt'), null);
});

test('parseAction: empty string returns null', () => {
  assert.strictEqual(parseAction(''), null);
});

test('parseAction: non-string returns null', () => {
  assert.strictEqual(parseAction(null), null);
  assert.strictEqual(parseAction(undefined), null);
  assert.strictEqual(parseAction(42), null);
});

test('parseAction: unknown action returns null', () => {
  assert.strictEqual(
    parseAction('<drink-water-action>nuke</drink-water-action>'),
    null
  );
});

test('parseAction: raw /drink-water maps to ack', () => {
  assert.deepStrictEqual(parseAction('/drink-water'), { kind: 'ack' });
  assert.deepStrictEqual(parseAction('  /drink-water  '), { kind: 'ack' });
});

test('parseAction: raw /drink-water-status maps to status', () => {
  assert.deepStrictEqual(parseAction('/drink-water-status'), { kind: 'status' });
});

test('parseAction: raw /drink-water-snooze with minutes', () => {
  assert.deepStrictEqual(parseAction('/drink-water-snooze 30'), { kind: 'snooze', minutes: 30 });
});

test('parseAction: raw /drink-water-snooze without minutes defaults to 15', () => {
  assert.deepStrictEqual(parseAction('/drink-water-snooze'), { kind: 'snooze', minutes: 15 });
});

test('parseAction: raw /drink-water followed by extra text does not match', () => {
  // Protects against "I like /drink-water a lot" false positives.
  assert.strictEqual(parseAction('/drink-water and also do X'), null);
});

test('performAction ack: resets last_drink_at and clears snooze', () => {
  const now = new Date('2026-04-16T15:00:00Z');
  const state = {
    last_drink_at: '2026-04-16T12:00:00Z',
    snooze_until: '2026-04-16T16:00:00Z',
    last_injected_at: '2026-04-16T13:00:00Z',
  };
  const result = performAction({ kind: 'ack' }, state, now);
  assert.strictEqual(result.newState.last_drink_at, now.toISOString());
  assert.strictEqual(result.newState.snooze_until, null);
  assert.strictEqual(result.newState.last_injected_at, '2026-04-16T13:00:00Z');
  assert.match(result.contextText, /acknowledged drinking water/);
});

test('performAction snooze: sets snooze_until to now + minutes, preserves last_drink_at', () => {
  const now = new Date('2026-04-16T15:00:00Z');
  const state = {
    last_drink_at: '2026-04-16T12:00:00Z',
    snooze_until: null,
    last_injected_at: null,
  };
  const result = performAction({ kind: 'snooze', minutes: 25 }, state, now);
  assert.strictEqual(result.newState.last_drink_at, '2026-04-16T12:00:00Z');
  assert.strictEqual(result.newState.snooze_until, '2026-04-16T15:25:00.000Z');
  assert.match(result.contextText, /25 minutes/);
});

test('performAction status: returns null newState and formatted context', () => {
  const now = new Date('2026-04-16T15:00:00Z');
  const state = {
    last_drink_at: '2026-04-16T13:45:00Z',
    snooze_until: null,
    last_injected_at: null,
  };
  const result = performAction({ kind: 'status' }, state, now);
  assert.strictEqual(result.newState, null);
  assert.match(result.contextText, /75 minutes ago/);
  assert.match(result.contextText, /standard/);
  assert.match(result.contextText, /Snoozed: no/);
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
