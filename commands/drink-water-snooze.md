---
description: Snooze drink-water reminders for N minutes (default 15).
argument-hint: "[minutes]"
---

Invoke Bash with exactly this command (substitute `$ARGUMENTS` for minutes; if blank, leave it blank — the CLI defaults to 15): `node __HOOK_PATH__ --snooze $ARGUMENTS`

The CLI is silent on success. Reply with one short line confirming the snooze duration.
