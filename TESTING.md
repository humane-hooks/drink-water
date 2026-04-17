# Testing

## Unit tests (automated)

```bash
node --test tests/drink-water.test.js
```

Unit tests cover:
- State file read/write/round-trip
- Staleness classification at each threshold boundary
- Snooze logic (active, expired, null)
- Anti-double-injection suppression
- Late-hours detection
- CLI subcommands (ack, snooze, status)
- Slash command and action token parsing
- Hook output format (valid JSON, correct structure)

These run in CI on every push and PR (Node 18/20/22).

## Integration tests (manual)

The hook's real value is in how the agent responds — tone, timing, context awareness. This can't be automated. To verify end-to-end:

1. Install the hook: `./install.sh`
2. Open Claude Code and send a prompt
3. Verify: first-run welcome message appears
4. Wait past the fresh threshold (or manually edit `last_event_at` in the state file to simulate staleness)
5. Send another prompt — verify reminder appears with correct staleness tier
6. Acknowledge naturally ("yes, just did") — verify timer resets
7. Test snooze: `/drink-water-snooze 5` — verify silence for 5 minutes
8. Test status: `/drink-water-status` — verify output
9. Uninstall: `./uninstall.sh` — verify clean removal
