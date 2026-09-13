---
title: "Safe mode and recovery"
description: "What happens when a plugin, package, update or migration goes wrong, and how users always keep control of plugin management and their data."
section: policy
order: 30
---

The design goal for failures is simple: a bad plugin, a bad package, a failed update or a broken migration must never take away the user's ability to manage plugins or recover data.

## Startup safe mode

GhostBoard writes a startup marker before publishing third-party plugin code and clears it only after every enabled plugin has finished its first activation. If the previous launch never reached that point, the next launch **skips all third-party code** and Settings → Plugins shows **Plugin safe mode is active** with the reason:

- the previous plugin startup did not finish;
- the saved startup state could not be trusted (the damaged file is preserved and GhostBoard fails closed);
- safe mode was requested explicitly with `--safe-mode` or `GHOSTBOARD_SAFE_MODE=1`.

In safe mode you can disable or remove plugins, roll back code and restore data. **Try enabled plugins on next launch** ends safe mode for the following start; the current session stays safe.

## Failed reload during development

A connected development directory reloads on change. If the new code fails to import or `setup` throws, the candidate is discarded: the previous activation keeps running with its commands, open panels and state, and the plugin menu shows the error pointing at your file. Successful reloads clean the old generation in reverse registration order exactly once before publishing the new one.

## Panel errors

An exception in a panel component or mount function breaks only that panel's root. The host UI and the plugin's other contributions keep working; the panel shows a diagnostic and can be reopened.

## Bad or tampered packages

- Archives are validated (paths, limits, manifest, entry, signature) before the review step and never executed during install.
- Installed trees are re-verified against their canonical digest before every activation; a modified or corrupted tree is disabled with "Package files no longer pass validation" until reinstalled.
- Unsigned in-place upgrades, signature mismatches, changed keys, changed update URLs, digest mismatches and non-advancing versions are all refused while the installed version stays intact.

## Failed or unwanted updates

Installing an update keeps the previous version's verified files. **Roll back code to …** re-verifies and reactivates them; the plugin remains disabled until the user reviews and enables it again. Journals from the newer version cannot overwrite the rolled-back state on restart.

## Data migration recovery

Before a custom canvas type migrates card state to a higher `dataVersion`, GhostBoard saves a preimage of the old state. If the backup fails, the migration does not run. **Restore pre-migration backup** in Settings → Plugins replaces migrated card data with the latest backup after saving a guard copy of the current data, and disables the plugin. Restoring and rolling back code are separate steps so users can choose either.

## What is not recoverable automatically

Side effects outside the SDK — DOM edits outside mount points, direct network calls, files written to user-selected directories — are not transactional. Plugin key-value storage has no versioned migration, so plugins must tolerate their own older values. When in doubt, GhostBoard prefers to disable a plugin and keep data rather than guess.
