---
title: "Example packages"
description: "Four signed, installable example plugins built with the public toolchain, hosted over HTTPS for URL installs and update checks."
section: distribution
order: 40
---

The same four templates that `create-ghostboard-plugin` generates are also published as signed, installable archives. They are the packages GhostBoard's own release verification installs from a public HTTPS origin, so you can use them to try URL installation, update checks and rollback before publishing your own.

| Example | Contributes | Package URL |
| --- | --- | --- |
| Hello (JavaScript) | Command + DOM panel | `https://ghostboard.21blog.com/plugins/examples/example.hello/0.1.0/example.hello-0.1.0.ghostboard-plugin` |
| React Hello | Command + React panel | `https://ghostboard.21blog.com/plugins/examples/example.react-hello/0.1.0/example.react-hello-0.1.0.ghostboard-plugin` |
| CSV Importer | Mapped and segmented importer | `https://ghostboard.21blog.com/plugins/examples/example.csv-importer/0.1.0/example.csv-importer-0.1.0.ghostboard-plugin` |
| Combined | Command, panel, canvas type and importer | `https://ghostboard.21blog.com/plugins/examples/example.combined/0.1.0/example.combined-0.1.0.ghostboard-plugin` |

Each example's release document is at `https://ghostboard.21blog.com/plugins/examples/<id>/releases.json`, and the manifest `update.url` points there. `example.hello` publishes both `0.1.0` and `0.1.1` so that installing the first URL and checking for updates exercises a real signed update. The SHA-256 values in `https://ghostboard.21blog.com/plugins/examples/index.json` identify the exact published signed archives. Changes to author keys, manifest metadata or build inputs produce different package digests.

## Try the update flow

1. Paste a package URL into **Settings → Plugins → Package URL** and click **Inspect link**, then install and enable it.
2. Click **Check for update**. When a newer example release exists, GhostBoard verifies it against the pinned example key and offers it for review; otherwise it reports that the installed version is current.
3. After an update, **Roll back code to …** restores the previous example version.

The examples are signed with GhostBoard's example author key. That key only vouches for the example packages; do not reuse their plugin IDs for your own work.

If a URL above returns 404, the example packages for that version have not been published yet. The source of every example is the corresponding template in the `create-ghostboard-plugin` package.
