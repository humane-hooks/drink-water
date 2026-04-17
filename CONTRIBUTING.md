# Contributing

The bar for what belongs in a humane hook is the [Manifesto](MANIFESTO.md). Read it first — every design decision flows from those principles, and the "Is it a Humane Hook?" checklist is the acceptance test for new ideas.

## Ground rules

- **Zero npm dependencies.** Node.js stdlib only.
- **Tests use `node:test`** (built-in). Run with `node --test tests/`.
- **Install/uninstall scripts are POSIX shell** (`#!/usr/bin/env sh`), not bash.
- **Do not modify `scripts/merge-settings.js` or `scripts/unmerge-settings.js`.** They're shared across every humane hook. If they don't fit your use case, open an issue on [humane-hooks/template](https://github.com/humane-hooks/template).

## Sending a patch

1. Open an issue first if the change is non-trivial.
2. Keep PRs focused — one concern per PR.
3. Include a test for any behavior change.
4. Verify the install/uninstall cycle manually in Claude Code before submitting.
