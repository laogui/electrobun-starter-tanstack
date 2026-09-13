---
title: "Install and enable a plugin"
description: "How end users install a package from a file or URL, review it, enable it per workspace, and remove it."
section: start
order: 10
---

This page is for people who *use* plugins. No developer tools are needed: a plugin package is a single `.ghostboard-plugin` (or `.zip`) archive.

## Install a package

1. Open **Settings → Plugins**.
2. Under **Install a package**, either **Choose package…** to pick a local archive, or paste a **Package URL** and click **Inspect link**. URLs must be public `https://` addresses; loopback, private-network and redirected-to-private targets, non-ZIP responses and oversized downloads are rejected.
3. GhostBoard checks the archive without executing any code and shows **Review package**: name, ID, version, author, declared capabilities, signature status, update source and the SHA-256 digest.
4. Click **Install package**. The package is installed for the whole application but **not enabled** anywhere yet.

Installing never runs `npm install`, build scripts or the plugin itself.

## Enable a plugin in a workspace

Plugins run per workspace. In **Installed plugins**, choose **Enable for workspace**, read the high-trust notice and confirm with **I trust this plugin, enable**. Enabled plugins run inside the GhostBoard window with full access to workspace data, local files, the network and the page. The **Declared capabilities** list is informational, not a restriction.

Switching to another workspace does not carry the enablement across; each workspace records its own choice, and a plugin's stored data is kept separately per workspace.

## Disable, update, roll back

- **Disable for workspace** removes the plugin's commands, panels, subscriptions and tasks in that workspace. Its stored data, canvas cards and imported Notes stay.
- **Check for update** is available for signed plugins that declared an update source. GhostBoard downloads the release document, picks the newest version compatible with your GhostBoard, verifies the SHA-256 and the author signature, then shows the same review step as a fresh install. An update signed with a different key or pointing at a different source is refused with "author key changed".
- **Roll back code to …** reinstalls the previous version's verified files. The plugin remains disabled until you review and enable it again.
- **Restore pre-migration backup** appears when a plugin's canvas card data was migrated to a newer `dataVersion`. Restoring replaces migrated card data with the backup and keeps the plugin disabled.

## Safe mode

If GhostBoard fails to finish starting with plugins enabled, the next launch skips third-party code automatically and shows **Plugin safe mode is active** in Settings → Plugins. You can also request it with the `--safe-mode` argument or `GHOSTBOARD_SAFE_MODE=1`. In safe mode you can still disable or remove plugins and restore data; choose **Try enabled plugins on next launch** when you are done.

## Uninstall

Removing a plugin deletes only its code. Cards created by a custom canvas type stay readable through their saved summaries, plugin key-value data stays, and Notes created by an importer are ordinary Notes. Permanent data deletion is a separate, explicit action that shows its scope.
