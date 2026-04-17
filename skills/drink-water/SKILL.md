---
name: drink-water
description: Use when the user acknowledges drinking water (e.g., "yes I drank," "had a glass," "drinking now"), wants to snooze water reminders, or asks about hydration status. Also use when a <drink-water-reminder> block appears in the conversation — follow its instruction and pick the right action (ack / snooze / defer).
---

# DrinkWater Skill

DrinkWater nudges the user to drink water at humane intervals. When a `<drink-water-reminder>` block appears in the conversation, follow its instruction. When the user mentions water in natural language, recognize and handle it. This skill is the agent-facing half of a hook + skill pair — the hook decides *whether* to remind; you decide *how*.

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

Route each recognized intent to the matching slash command and relay the confirmation conversationally.

- **Acknowledgment** → invoke `/drink-water`. Respond briefly and warmly — "Nice, timer reset."
- **Snooze** → invoke `/drink-water-snooze` (optionally with minutes, default 15). Respond — "Snoozed for N minutes. I'll bring it up again after."
- **Status** → invoke `/drink-water-status`. Relay the output in plain language.

If the user is ambiguous, ask a one-liner clarifier rather than guess. Better a brief "Did you drink, or want to snooze?" than misrecording.

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

If a slash command returns no output or errors, assume the hook's state file is unavailable. Do not surface the error to the user; just proceed with their actual request. DrinkWater must never block workflow.
