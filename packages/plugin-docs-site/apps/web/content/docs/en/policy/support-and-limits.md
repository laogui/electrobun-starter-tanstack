---
title: "Supported platforms and limits"
description: "Which platforms and install sources are verified, and the behaviors GhostBoard explicitly does not promise for high-trust plugins."
section: policy
order: 20
---

GhostBoard only claims support for what has been exercised on a packaged build. Anything not listed here is unsupported.

## Platforms

| Platform | Plugin support | Evidence |
| --- | --- | --- |
| macOS, Apple Silicon (arm64) | **Supported.** Loading, import map, host services, install, update, rollback and safe mode verified on packaged builds. | Release verification T0–T4, T5 |
| macOS, Intel (x64) | **Pending verification.** Packaged builds exist; plugin verification will be published before support is claimed, stating whether it ran on Intel hardware or under Rosetta. | T5 platform record |
| Windows x64 | **Not supported for plugins.** The app builds for Windows, but plugin loading, install and recovery have not been verified there. | — |
| Linux | **Not supported.** No release matrix. | — |

## Install sources

- **Local archive**: `.ghostboard-plugin` or `.zip`, chosen with the native file dialog.
- **URL**: public `https://` only. Loopback and private-network addresses (including after DNS resolution or redirects), userinfo in URLs, non-ZIP responses, oversized downloads and HTML pages are refused.
- **Development directory**: connected through the native directory dialog; loads on enable and reloads on change.
- Native file and directory dialogs are macOS system dialogs; GhostBoard does not implement its own picker.

## Runtime and data limits

| Area | Limit |
| --- | --- |
| Package | 256 files, 8 MiB uncompressed, no symlinks |
| Content batches | 1–100 items per transaction; `getMany` up to 500 IDs |
| Importers | single batch 1–100 Notes; segmented 2–50 segments × 1–100 Notes (max 5,000); 100 unique inspectable fields |
| Files | `readText` default 1 MiB (max 16 MiB), `readBytes` 16 MiB, `stream` 256 MiB, writes 256 MiB, 8 concurrent writes, 16 files per pick, 100 entries per directory page |
| Release document | 1 MiB, 50 releases, 8 KiB notes |
| Storage | JSON values; no size guarantee beyond the workspace disk |

## What GhostBoard does not promise

- **No sandbox.** Plugins run in the app's renderer with full access. Declared capabilities are information for the user, not enforcement. Signatures prove continuity of authorship, not safety or identity.
- **No rollback of arbitrary side effects.** Registered commands, panels, subscriptions, tasks and tracked workers are cleaned up on disable or reload. DOM changes outside mount points, direct `fetch` calls, files written through the SDK, and any other external effect are not undone; GhostBoard may ask the user to reload the window.
- **Host DOM outside mount points is private** and may change on any render. Modifying it is unsupported.
- **The fake host is not the app.** Author tests do not verify layout, persistence, dialogs, installation, signature verification or platform behavior.
- **Old ES module closures** can remain in memory across repeated development reloads; reload the window if memory or duplicated behavior becomes a problem.
- **Mixed undo history** (native canvas changes interleaved with plugin batches) is per workspace and view and does not survive a restart; explicit `app.content.undo/redo` by batch ID does.
- **No API for host-owned canvas structure.** Core node types the host ships itself are not plugin-extensible. In particular there is no public way to read or write a Topic title, create a subtopic, reparent or reorder a branch, drive topic layout, or subscribe to topic structure changes; Topics surface only as `content: null` placements in [selection](/docs/guides/content-and-storage/#placements-without-content), and `app.content` stays [Notes-only](/docs/guides/content-and-storage/#note-snapshots). Reaching into host stores or DOM to work around this is unsupported and may break on any release. If that changes, it will ship as an additive API in a new SDK version with a "since host x.y" note in the [reference](/docs/reference/sdk/).
- **No Bun or native backend entry**, no per-capability approval UI, no in-app plugin guide and no marketplace in this version.
