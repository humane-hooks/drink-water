# The Humane Hooks Manifesto

Humane Hooks are Claude Code extensions that ground human-agent interaction back in real human needs. They respect the person behind the keyboard — reminding them to drink water, stretch, eat, take breaks — not because the agent is in charge, but because it's easy to forget yourself when the work is flowing. The goal isn't productivity. The goal is that you finish the session feeling as good as when you started.

## Principles

### 1. Interrupt at seams, not mid-flow
Hooks fire on `UserPromptSubmit` — the natural pause between your thoughts. Never during agent work, never mid-generation. The interruption happens where the human already is, not where the code is.

### 2. The reminder is the product
No dashboards, no streaks, no gamification, no stats. A gentle check-in, then back to work. If you're tempted to add a feature, ask whether it serves the human or just looks good in a README.

### 3. Tone over telemetry
The agent has full conversation context — time of day, session length, emotional register. Use it. A dumb timer can't say "it's late, take care of yourself." An agent can.

### 4. Respect autonomy
Snooze is always available. Dismissal is always valid. The human is in charge. Never guilt, never shame, never withhold work as leverage.

### 5. Silent on failure
A humane hook must never surface its own errors to the user. If the state file is corrupt, if the hook throws, swallow it. Your bug is not their problem.

### 6. Zero dependencies
Node.js stdlib only. No npm install, no build step, no package manager. Clone it, run the installer, done.

### 7. Minimal state
If you can't describe your state in under 5 fields, your hook is doing too much. State should be deleteable — the hook recreates it on next run.

## Is it a Humane Hook?

Before building, check the idea against these. If you can answer yes to all five, build it.

- Does it address a real human need that's easy to forget during deep work?
- Does it check in at the natural seam between prompts, never mid-flow?
- Does it adapt tone to context — time of day, session length, the user's register?
- Does it respect the user's autonomy — snooze, dismiss, and ignore all valid?
- Does it work with zero dependencies on any machine with Node.js 18+?

## Anti-patterns

These look like features. They aren't.

- **Gamification** — streaks, scores, badges, leaderboards. The reminder is the product, not a game.
- **Surveillance** — tracking patterns, logging history, analytics dashboards. State stays minimal and deleteable.
- **Guilt** — shame language, passive-aggressive tone, withholding work as leverage. Respect is non-negotiable.
- **Scope creep** — settings UIs, companion apps, integrations with other tools. One hook, one reminder, one loop.
