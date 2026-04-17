# Humane Hook Template

Scaffold for building [Humane Hooks](https://github.com/humane-hooks) — Claude Code extensions that respect the human behind the keyboard.

## Quick start

1. Click "Use this template" on GitHub (or clone manually)
2. Run the setup script:

```bash
./setup.sh your-hook-name
```

3. Customize your hook:
   - `hooks/your-hook-name.js` — thresholds and agent instructions
   - `skills/your-hook-name/SKILL.md` — tone guidance for the agent
4. Run tests: `node --test tests/your-hook-name.test.js`
5. Install: `./install.sh`

## What you get

- Hook script with full lifecycle pre-wired (state, staleness, I/O, CLI)
- Install/uninstall scripts with atomic settings.json merging
- Skill file teaching the agent how to respond
- Slash commands for explicit control
- Test suite with `node:test` (zero deps)
- CI workflow (GitHub Actions, Node 18/20/22)

## What you customize

- **Thresholds** — how long before each reminder tier kicks in
- **Instructions** — what the agent should say at each tier
- **Tone** — hook-specific examples in the SKILL.md

Everything else works out of the box.

## Read first

- [Manifesto](MANIFESTO.md) — the design principles
- [Contributing](CONTRIBUTING.md) — how to build and share hooks

## License

MIT
