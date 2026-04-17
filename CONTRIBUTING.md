# Contributing to Humane Hooks

## Before you start

Read the [Manifesto](MANIFESTO.md). Every design decision flows from those principles. If your hook conflicts with them, the hook needs to change, not the manifesto.

## Creating a new hook

1. Use this template: click "Use this template" on GitHub, or clone and run `./setup.sh your-hook-name`
2. Customize the thresholds, instructions, and state fields for your use case
3. Write tests for your custom logic
4. Test the install/uninstall cycle manually in Claude Code
5. Open a PR or publish your own repo and let us know

## Naming convention

- Repo names: lowercase kebab-case, verb-noun (`drink-water`, `stretch-break`, `meal-reminder`)
- All internal identifiers derive from the repo name: `your-hook.js`, `/your-hook`, `skills/your-hook/SKILL.md`, `~/.claude/your-hook/state.json`

## What makes a good humane hook

- It addresses a real human need that's easy to forget during deep work
- It checks in at the natural seam between prompts, never mid-flow
- It adapts tone to context (time of day, how long it's been, session mood)
- It respects the user's autonomy (snooze, dismiss, ignore are all valid)
- It has zero dependencies and works on any machine with Node.js 18+

## What to avoid

- Gamification (streaks, scores, badges, leaderboards)
- Surveillance (tracking patterns, logging history, analytics)
- Guilt (shame language, passive-aggressive tone, withholding work)
- Scope creep (dashboards, settings UIs, integrations with other tools)

## Code standards

- Zero npm dependencies — Node.js stdlib only
- Tests use `node:test` runner (built-in, no install)
- Install/uninstall scripts are POSIX shell (`#!/usr/bin/env sh`)
- Do not modify `scripts/merge-settings.js` or `scripts/unmerge-settings.js` — these are battle-tested and shared across all hooks. If they don't fit your use case, open an issue on `humane-hooks/template`.

## Reporting issues

Open an issue on the specific hook's repo for hook-specific bugs. Open an issue on `humane-hooks/template` for scaffold/tooling issues.
