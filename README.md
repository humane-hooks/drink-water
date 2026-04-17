# Drink-Water

A [Humane Hook](MANIFESTO.md) that nudges you to drink water while you work with Claude Code. The agent checks in at natural seams in the conversation — never mid-response, never mid-tool-call.

> The goal isn't productivity. The goal is that you finish the session feeling as good as when you started.

## How it works

A `UserPromptSubmit` hook fires on every prompt you send. It reads a tiny state file, classifies how long it's been since your last cup, and — if you're overdue — injects a short reminder into the agent's context. The agent has the conversation, the time of day, and your register; it decides how to bring it up. You acknowledge, snooze, or ignore. That's the whole loop.

### Staleness tiers

| Band           | Gap since last cup | What Claude does |
|----------------|--------------------|------------------|
| `fresh`        | < 60 min           | Silent. No reminder. |
| `standard`     | 60–90 min          | Brief check-in before responding. |
| `firmer`       | 90–120 min         | Addresses water first, then the request. |
| `insistent`    | 2–4 hours          | Will not proceed until you engage. |
| `welcome-back` | > 4 hours          | Warm greeting, no guilt about the gap. |

Late hours (22:00–06:00) shift the tone toward care rather than prompting.

## Install

```bash
./install.sh            # interactive: global or project
./install.sh --global   # installs into ~/.claude/settings.json
./install.sh --project  # installs into ./.claude/settings.json
```

The installer merges two hook entries into `settings.json` (idempotent — safe to re-run), copies the skill to `skills/drink-water/SKILL.md`, and drops three slash commands into your `commands/` directory. You'll see a confirmation on your next prompt.

## Slash commands

| Command                      | Effect |
|------------------------------|--------|
| `/drink-water`               | Acknowledge a cup. Resets the timer and clears any snooze. |
| `/drink-water-snooze [min]`  | Snooze reminders (default 15 minutes). |
| `/drink-water-status`        | Show time since last cup and snooze state. |

You can also just tell Claude in plain language ("had a glass", "snooze for an hour") — the skill will pick the right command.

## Configuration

Tune thresholds and tone by editing the top of `hooks/drink-water.js` — everything customizable lives above the `END CUSTOMIZE` banner.

| Env var                  | Purpose |
|--------------------------|---------|
| `DRINK_WATER_DISABLED=1` | Suppress the hook entirely (useful while hacking on it). |
| `DRINK_WATER_STATE_DIR`  | Override where state is stored. |
| `CLAUDE_CONFIG_DIR`      | Standard Claude Code override; state goes under `$CLAUDE_CONFIG_DIR/drink-water/`. |

State is a single JSON file (`state.json`) — five fields, safe to delete; the hook recreates it.

## Uninstall

```bash
./uninstall.sh
```

Removes the hook entries from `settings.json`, the installed skill, and the slash commands. Leaves `state.json` in place so reinstalling doesn't reset your clock.

## Development

```bash
node --test tests/
```

Zero dependencies, Node stdlib only. See [TESTING.md](TESTING.md) for what's covered and [CONTRIBUTING.md](CONTRIBUTING.md) if you want to send a patch.

## Read first

- [Manifesto](MANIFESTO.md) — the design principles this hook follows
- [AGENTS.md](AGENTS.md) — notes for agents working in this repo

## License

MIT
