---
title: "Packaging"
description: "Produce a deterministic, installable archive that contains only runtime files and needs no tools on the user's machine."
section: distribution
order: 10
---

## What goes in the archive

Only what GhostBoard needs at runtime: `manifest.json`, the app entry, relative modules and static assets. Author files (`package.json`, tests, `node_modules`, `AGENTS.md`, `README.md`, source `.ts`/`.tsx`) stay out. The generated `package` script already lists the right files:

```jsonc
// no-build templates
"package": "ghostboard-plugin . --output dist/yourname.hello-0.1.0.ghostboard-plugin --include manifest.json --include app.js --include ui.js"

// React template: package the complete Vite output
"package": "bun run build && ghostboard-plugin dist --output release/yourname.panel-0.1.0.ghostboard-plugin"
```

When you add a runtime module or asset to a no-build project, add another `--include`. When you bump `version` in `manifest.json`, rename the `--output` to match.

## Run it

```sh
bun run package
```

The packer validates the manifest, checks the entry exists, sorts paths, writes a stored ZIP and replaces the output atomically. Running it twice on the same files yields byte-identical archives, so the SHA-256 shown in GhostBoard's review step is reproducible by anyone with your source.

## Install it like a user

Open **Settings → Plugins → Choose package…**, select the archive, compare the digest with your build, install, enable and exercise every contribution. Then **Disable for workspace** and confirm nothing of yours lingers. This is the same path end users take and the only way to verify layout, persistence, native dialogs and reload behavior; author tests do not cover those.

## Distribute

- **File**: share the `.ghostboard-plugin` archive. Users install it with **Choose package…**.
- **URL**: host the archive on a public HTTPS origin and share the direct link. Users paste it into **Package URL** and click **Inspect link**. GhostBoard downloads with redirect, private-network, size and content-type checks and shows the same review step.

Unsigned archives are fine for local use and sharing, but they **cannot be updated in place**: installing a newer unsigned archive with the same ID is treated as a new plugin. To publish updates, continue with [Signing and updates](/docs/distribution/signing-and-updates/).
