'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  CUSTOMIZE — Adjust everything in this section for your hook.      ║
// ║  The engine below this block is reusable machinery you shouldn't   ║
// ║  need to touch.                                                    ║
// ╚══════════════════════════════════════════════════════════════════════╝

// --- Threshold constants ---
// These control when reminders fire and how urgent they feel.
const MINUTE_MS = 60 * 1000;
const FRESH_CEILING_MS      = 60  * MINUTE_MS;
const FIRMER_FLOOR_MS       = 90  * MINUTE_MS;
const INSISTENT_FLOOR_MS    = 120 * MINUTE_MS;
const WELCOME_BACK_FLOOR_MS = 240 * MINUTE_MS;

// Anti-double-injection window: suppress repeated reminders within this window
// for the "standard" staleness band. Increase if your hook's cadence is slower.
const ANTI_DOUBLE_INJECTION_MS = 10 * MINUTE_MS;

// Default snooze duration when the user doesn't specify minutes.
const DEFAULT_SNOOZE_MIN = 15;

// --- Instructions ---
// These are the actual words Claude sees when deciding how to remind the user.
const INSTRUCTIONS = {
  standard:
    "Before responding to the user's message, briefly check in about water. " +
    "Be thoughtful about tone — late hours call for care, not nagging. " +
    "If they acknowledge drinking, invoke /drink-water. If they want to snooze, invoke /drink-water-snooze. " +
    "If they don't mention it, you may proceed but do not drop the thread.",
  firmer:
    "This is a direct reminder — over 90 minutes have passed since the last cup. " +
    "Address the water check-in first, briefly but clearly, then proceed with the user's request.",
  insistent:
    "More than two hours have passed. Do not proceed with the user's request until you have gently " +
    "but clearly asked them about water. This is the point of the tool.",
  'welcome-back':
    "The user has been away for a while, or is starting a new day. Greet them warmly and ask if " +
    "they'd like to start with a cup of water. No guilt about the gap.",
};

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  END CUSTOMIZE — Everything below is the hook engine.              ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

function resolveStatePath() {
  if (process.env['DRINK_WATER_STATE_DIR']) {
    return path.join(process.env['DRINK_WATER_STATE_DIR'], 'state.json');
  }
  if (process.env.CLAUDE_CONFIG_DIR) {
    return path.join(process.env.CLAUDE_CONFIG_DIR, 'drink-water', 'state.json');
  }
  const home = os.homedir();
  if (!home) {
    // Containers without HOME set — avoid creating a relative .claude/ path
    // in whatever directory the hook happened to run from.
    throw new Error('Cannot resolve state path: no HOME and no CLAUDE_CONFIG_DIR set.');
  }
  return path.join(home, '.claude', 'drink-water', 'state.json');
}

function readState(statePath = resolveStatePath()) {
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.last_drink_at) throw new Error('missing last_drink_at');
    return {
      last_drink_at: parsed.last_drink_at,
      snooze_until: parsed.snooze_until ?? null,
      last_injected_at: parsed.last_injected_at ?? null,
      _humane_hook_marker: parsed._humane_hook_marker ?? null,
      _existed: true,
    };
  } catch (_err) {
    return {
      last_drink_at: new Date().toISOString(),
      snooze_until: null,
      last_injected_at: null,
      _humane_hook_marker: null,
      _existed: false,
    };
  }
}

function writeState(state, statePath = resolveStatePath()) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const tmp = statePath + '.tmp';
  const payload = JSON.stringify({
    last_drink_at: state.last_drink_at,
    snooze_until: state.snooze_until,
    last_injected_at: state.last_injected_at,
    _humane_hook_marker: 'drink-water',
  }, null, 2);
  fs.writeFileSync(tmp, payload);
  fs.renameSync(tmp, statePath);
}

// ---------------------------------------------------------------------------
// Staleness classification
// ---------------------------------------------------------------------------

function classifyStaleness(lastDrinkMs, nowMs) {
  const gap = nowMs - lastDrinkMs;
  if (gap < FRESH_CEILING_MS) return 'fresh';
  if (gap < FIRMER_FLOOR_MS) return 'standard';
  if (gap < INSISTENT_FLOOR_MS) return 'firmer';
  if (gap < WELCOME_BACK_FLOOR_MS) return 'insistent';
  return 'welcome-back';
}

function isSnoozed(snoozeUntilIso, now) {
  if (!snoozeUntilIso) return false;
  return new Date(snoozeUntilIso).getTime() > now.getTime();
}

function shouldSuppressStandardRefire(lastInjectedAtIso, now) {
  if (!lastInjectedAtIso) return false;
  const lastMs = new Date(lastInjectedAtIso).getTime();
  return (now.getTime() - lastMs) < ANTI_DOUBLE_INJECTION_MS;
}

function isLateHours(now) {
  const h = now.getHours();
  return h >= 22 || h < 6;
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function buildReminderText({ gapMinutes, localTime, lateSuffix, staleness }) {
  return (
    '<drink-water-reminder>\n' +
    'last_drink: ' + gapMinutes + ' minutes ago\n' +
    'local_time: ' + localTime + lateSuffix + '\n' +
    'staleness: ' + staleness + '\n' +
    'instruction: ' + (INSTRUCTIONS[staleness] ?? '') + '\n' +
    '</drink-water-reminder>\n'
  );
}

function formatHookOutput(additionalContext) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext,
    },
  }) + '\n';
}

// ---------------------------------------------------------------------------
// Hook input (stdin from Claude Code)
// ---------------------------------------------------------------------------

function readHookInput() {
  try {
    if (process.stdin.isTTY) return null;
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_err) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CLI commands
// ---------------------------------------------------------------------------

// Handle /drink-water[-status|-snooze N] inline. Returns true if the prompt
// was a recognized slash command (caller should return without further work).
function handleSlashCommand(promptText, now) {
  const trimmed = (promptText || '').trim();
  // Check the longer prefixes first — `/drink-water` is a prefix of the others.
  if (trimmed === '/drink-water-status' || trimmed.startsWith('/drink-water-status ')) {
    emitStatusContext(now);
    return true;
  }
  if (trimmed === '/drink-water-snooze' || trimmed.startsWith('/drink-water-snooze ')) {
    const rest = trimmed.slice('/drink-water-snooze'.length).trim();
    const parsed = parseInt(rest, 10);
    const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SNOOZE_MIN;
    cmdSnooze([String(minutes)], now);
    process.stdout.write(formatHookOutput(
      '<drink-water-action-result>\n' +
      'event: snooze\n' +
      'minutes: ' + minutes + '\n' +
      'instruction: Reply with one short line confirming the snooze duration.\n' +
      '</drink-water-action-result>\n'
    ));
    return true;
  }
  if (trimmed === '/drink-water' || trimmed.startsWith('/drink-water ')) {
    cmdAck(now);
    process.stdout.write(formatHookOutput(
      '<drink-water-action-result>\n' +
      'event: ack\n' +
      'result: Timer reset.\n' +
      'instruction: Reply with one short warm line and move on. Do not invoke any tools.\n' +
      '</drink-water-action-result>\n'
    ));
    return true;
  }
  return false;
}

function emitStatusContext(now) {
  try {
    const statePath = resolveStatePath();
    const state = readState(statePath);
    if (!state._existed) {
      process.stdout.write(formatHookOutput(
        '<drink-water-action-result>\n' +
        'event: status\n' +
        'result: not-initialized\n' +
        'instruction: Tell the user DrinkWater is not yet initialized; the next prompt will set it up.\n' +
        '</drink-water-action-result>\n'
      ));
      return;
    }
    const lastMs = new Date(state.last_drink_at).getTime();
    const gapMin = Math.round((now.getTime() - lastMs) / MINUTE_MS);
    const staleness = classifyStaleness(lastMs, now.getTime());
    const snoozed = isSnoozed(state.snooze_until, now);
    process.stdout.write(formatHookOutput(
      '<drink-water-action-result>\n' +
      'event: status\n' +
      'last_drink_min_ago: ' + gapMin + '\n' +
      'staleness: ' + staleness + '\n' +
      'snoozed: ' + (snoozed ? ('yes, until ' + state.snooze_until) : 'no') + '\n' +
      'instruction: Relay this status in one plain-language sentence.\n' +
      '</drink-water-action-result>\n'
    ));
  } catch (_err) {}
}

function cmdCheck(now = new Date()) {
  try {
    if (process.env['DRINK_WATER_DISABLED'] === '1') return;

    // Slash-command dispatch: handle /drink-water[-status|-snooze N] directly
    // in the hook. This avoids any Bash tool call (and the permission prompt
    // that comes with it). Natural-language acknowledgment ("I drank water")
    // still flows through the Skill→Bash path.
    const input = readHookInput();
    if (input && typeof input.prompt === 'string') {
      const handled = handleSlashCommand(input.prompt, now);
      if (handled) return;
    }

    const statePath = resolveStatePath();
    const state = readState(statePath);

    // First run: create state, emit welcome, return.
    if (!state._existed) {
      writeState(
        {
          last_drink_at: now.toISOString(),
          snooze_until: null,
          last_injected_at: null,
        },
        statePath
      );
      const welcome =
        '<drink-water-reminder>\n' +
        'DrinkWater is now enabled and tracking hydration from this moment.\n' +
        'Mention this to the user so they know install succeeded.\n' +
        '</drink-water-reminder>\n';
      process.stdout.write(formatHookOutput(welcome));
      return;
    }

    if (isSnoozed(state.snooze_until, now)) return;

    const lastMs = new Date(state.last_drink_at).getTime();
    const staleness = classifyStaleness(lastMs, now.getTime());
    if (staleness === 'fresh') return;

    // Anti-double-injection: only in the standard band.
    if (staleness === 'standard' && shouldSuppressStandardRefire(state.last_injected_at, now)) {
      return;
    }

    const gapMinutes = Math.round((now.getTime() - lastMs) / MINUTE_MS);
    const localTime = now.toLocaleTimeString('en-US', {
      hour12: false, hour: '2-digit', minute: '2-digit',
    });
    const lateSuffix = isLateHours(now) ? ' (late)' : '';

    const reminderText = buildReminderText({ gapMinutes, localTime, lateSuffix, staleness });
    process.stdout.write(formatHookOutput(reminderText));

    // Record injection so anti-double-fire can reference it.
    writeState({ ...state, last_injected_at: now.toISOString() }, statePath);
  } catch (_err) {
    // Never block the user's workflow on this hook's own bugs.
  }
}

// Silent on success: the slash-command / skill instructs the agent to
// provide a single warm reply. Anything printed here would duplicate that.
function cmdAck(now = new Date()) {
  try {
    const statePath = resolveStatePath();
    const state = readState(statePath);
    writeState(
      {
        last_drink_at: now.toISOString(),
        snooze_until: null,
        last_injected_at: state.last_injected_at,
      },
      statePath
    );
  } catch (_err) {}
}

function cmdSnooze(args = [], now = new Date()) {
  try {
    const parsed = parseInt(args[0], 10);
    const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SNOOZE_MIN;
    const statePath = resolveStatePath();
    const state = readState(statePath);
    const snoozeUntil = new Date(now.getTime() + minutes * MINUTE_MS).toISOString();
    writeState(
      {
        last_drink_at: state.last_drink_at,
        snooze_until: snoozeUntil,
        last_injected_at: state.last_injected_at,
      },
      statePath
    );
  } catch (_err) {}
}

function cmdStatus(now = new Date()) {
  try {
    const statePath = resolveStatePath();
    const state = readState(statePath);
    if (!state._existed) {
      process.stdout.write('DrinkWater not yet initialized. You will see a confirmation on your next prompt.\n');
      return;
    }
    const lastMs = new Date(state.last_drink_at).getTime();
    const gapMin = Math.round((now.getTime() - lastMs) / MINUTE_MS);
    const staleness = classifyStaleness(lastMs, now.getTime());
    const snoozed = isSnoozed(state.snooze_until, now);
    const snoozeLine = snoozed ? 'yes, until ' + state.snooze_until : 'no';
    process.stdout.write(
      'Last cup: ' + gapMin + ' minutes ago (' + staleness + ')\n' +
      'Snoozed: ' + snoozeLine + '\n'
    );
  } catch (_err) {}
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main(argv = process.argv) {
  const cmd = argv[2];
  if (cmd === '--check') cmdCheck();
  else if (cmd === '--ack') cmdAck();
  else if (cmd === '--snooze') cmdSnooze(argv.slice(3));
  else if (cmd === '--status') cmdStatus();
  else process.stdout.write('Usage: drink-water.js --check | --ack | --snooze [minutes] | --status\n');
}

if (require.main === module) main(process.argv);

module.exports = {
  resolveStatePath, readState, writeState,
  classifyStaleness, isSnoozed, shouldSuppressStandardRefire, isLateHours,
  buildReminderText, formatHookOutput, cmdCheck,
  cmdAck, cmdSnooze, cmdStatus, main,
};
