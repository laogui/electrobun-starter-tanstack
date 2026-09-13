---
title: "What a GhostBoard plugin is"
description: "High-trust JavaScript that you install and enable explicitly, with a host-provided SDK for notes, canvas, files and panels."
section: start
order: 5
---

GhostBoard is a local-first spatial canvas for notes and research material. A **plugin** extends it with ordinary JavaScript that runs inside the app's renderer with the same trust as the app itself. There is no sandbox, permission prompt list or marketplace review: you decide which plugins to install, and you enable each one per workspace after reading a high-trust notice.

## What a plugin can contribute

| Contribution | What the user sees | Template |
| --- | --- | --- |
| **Command** | An entry in the plugin menu with an optional shortcut | default |
| **Panel** | A side view rendered with DOM or with the host's shared React | default, `--react` |
| **Custom canvas type** | A new kind of card that persists its own state, migrates data and is searchable | `--combined` |
| **Importer** | A host-owned "select file → map fields → preview → confirm" workflow that creates Notes | `--importer`, `--combined` |

Every plugin can also read and update Notes in revision-checked transactions, subscribe to content and selection changes, keep JSON key-value storage per app or per workspace, schedule tasks while the workspace is active, and read or write user-selected files and directories through the host.

## What the host provides

- The runtime for `@ghostboard/sdk`, `@ghostboard/sdk/react`, `react`, `react-dom`, `react-dom/client` and `react/jsx-runtime` through an import map. A no-build plugin is a `manifest.json` plus JavaScript files; nothing is installed or compiled on the user's machine.
- Public theme variables (`--gb-*`) so your UI matches light and dark mode without importing host components.
- Automatic reload of a connected development directory, with failed reloads leaving the previous version running.
- Deterministic packaging, Ed25519 author signing, pinned update sources, code rollback, data-migration backups and a startup safe mode.

## What you need

- **GhostBoard 1.0.0 or later on macOS** (Apple Silicon has packaged evidence; Intel is pending verification). Windows and Linux do not support plugins yet. See [Supported platforms and limits](/docs/policy/support-and-limits/).
- **Bun 1.2+** for the author tooling: `bunx create-ghostboard-plugin`, author tests and `bun run package`. Node 20+ works for scaffolding; the generated scripts assume Bun.
- Basic web knowledge. React is optional; the default templates are plain JavaScript.

Continue with [Build your first plugin in 15 minutes](/docs/start/first-plugin/).
