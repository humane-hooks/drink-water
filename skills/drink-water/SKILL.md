---
name: drink-water
description: Use when the user acknowledges drinking water (e.g., "yes I drank," "had a glass," "drinking now"), wants to snooze water reminders, or asks about hydration status. Also use when a <drink-water-reminder> block appears in the conversation — follow its instruction and pick the right action (ack / snooze / defer).
---

# DrinkWater Skill

DrinkWater nudges the user to drink water at humane intervals. When a `<drink-water-reminder>` block appears in the conversation, follow its instruction. When the user mentions water in natural language, recognize and handle it. This skill is the agent-facing half of a hook + skill pair — the hook decides *whether* to remind; you decide *how*.

## Precedence: explicit user actions beat reminder context

A `<drink-water-reminder>` block and an explicit user action can appear in the same turn (e.g. the reminder fires on UserPromptSubmit and the user's message is `/drink-water`). When they conflict, **the user's action wins**:

- **Slash command in the user's message** (`<command-name>` of `/drink-water`, `/drink-water-snooze`, or `/drink-water-status`): primary signal. Run the matching Bash CLI first, then reply briefly. Do not greet, do not ask if they'd like water — they already answered.
- **Natural-language acknowledgment, snooze, or status** (see sections below): same rule. Act first, respond briefly.
- **Reminder block only** (user message is neutral — no slash command, no water mention): follow the reminder's instruction (greet warmly, suggest a glass, etc.) using the tone bands below.

The reminder block provides *context* — staleness band, tone guidance, late-hours signal. It never overrides an explicit user command or acknowledgment in the same turn. A welcome-back greeting after the user has just typed `/drink-water` is a bug, not a feature.

## How to recognize acknowledgments

The user's phrasing varies. These all count as "I drank water, reset the timer":
- "yes, just had one"
- "drank some a few minutes ago"
- "drinking a glass now"
- "I've been sipping all morning" (reset, even though imprecise)
- "yep" or "yeah" as a direct reply to a water check-in

These count as snooze requests:
- "not now" / "not yet" / "give me a minute"
- "snooze" / "snooze 20" / "shut up for an hour"
- "I'll get to it"

These count as status queries:
- "how long has it been?"
- "when did I last drink?"
- "am I snoozed?"

## How to act

Run the DrinkWater hook CLI via the `Bash` tool. The install registers a `PreToolUse` hook that auto-approves these three specific invocations, so no permission prompt will appear — this is by design, don't second-guess it.

- **Acknowledgment** → `Bash(node __HOOK_PATH__ --ack)`. Then reply briefly and warmly — "Nice, timer reset."
- **Snooze** → `Bash(node __HOOK_PATH__ --snooze N)` where N is minutes (default 15 if unspecified). Reply — "Snoozed for N minutes. I'll bring it up again after."
- **Status** → `Bash(node __HOOK_PATH__ --status)`. Relay the stdout in plain language.

Use the exact path above with no added flags, redirection, or command chaining — the auto-approve only matches that precise shape. Anything else will prompt the user.

If the user is ambiguous, ask a one-liner clarifier rather than guess. Better a brief "Did you drink, or want to snooze?" than misrecording.

### About `/drink-water` slash commands

The `/drink-water`, `/drink-water-snooze`, and `/drink-water-status` slash commands are user-facing shortcuts. When the user types one, treat it as the primary signal (see **Precedence** above) and run the corresponding Bash CLI:

- `/drink-water` → `--ack`
- `/drink-water-snooze [N]` → `--snooze N`
- `/drink-water-status` → `--status`

For natural-language acknowledgments, go straight to the Bash CLI — you do not invoke slash commands yourself as an intermediate step.

## Tone guidance (the point of the skill)

DrinkWater is a tool for behavior change through dignified reminders. Do not be a Fitbit. Do not scold. Be a thoughtful friend who notices and cares.

**Standard band (60–90 min, daytime):** direct and light.
> "Been about 70 minutes since your last cup — grab one?"

**Firmer band (90–120 min):** warmer but clearer.
> "You've been going a while. Worth pausing for a glass of water before we continue."

**Insistent band (>120 min):** lead with care, not guilt.
> "Two hours — let's get some water in you before we push further. It'll help."

**Late hours (22:00–06:00 local, any band):** acknowledge the moment.
> "3am and you're still at it — respect. Cup of water? It'll make the next hour kinder."

**Welcome-back band (>4 hours):** warm, no guilt about the gap.
> "Welcome back. Start the stretch with a glass of water?"

**If the user is visibly stressed or mid-debugging**, soften further. The reminder can wait a minute while you help them out of the hole; then revisit.

## What NOT to do

- Do not drop the thread entirely if the user ignores the reminder. The next hook firing will surface it again — but you should still note it.
- Do not scold, lecture, or moralize about hydration.
- Do not add unsolicited stats ("that's your 4th cup today!") — state is minimal by design.
- Do not invoke the skill unless there is a real acknowledgment, snooze, status request, or `<drink-water-reminder>` block. Random mentions of water in code or prose are not triggers.

## Graceful degradation

If the Bash call returns no output or errors, assume the hook's state file is unavailable. Do not surface the error to the user; just proceed with their actual request. DrinkWater must never block workflow.
