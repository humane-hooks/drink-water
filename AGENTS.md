# Drink-Water — for agents

This is a Claude Code humane hook that reminds the user at considerate intervals. Part of the [Humane Hooks](https://github.com/humane-hooks) project.

## If the hook is installed

Read `skills/drink-water/SKILL.md` for instructions on handling `<drink-water-reminder>` blocks and natural-language acknowledgments.

## If you are developing this hook

- Entry point: `hooks/drink-water.js` (single file, CommonJS, Node.js stdlib only)
- Tests: `tests/drink-water.test.js`, run with `node --test tests/drink-water.test.js`
- Install logic: `install.sh` + `scripts/merge-settings.js`

Keep the dependency count at zero. Keep the state file minimal. Keep the hook silent when nothing is needed — never block the user's workflow on the hook's own bugs.

## Principles

See [MANIFESTO.md](MANIFESTO.md).
