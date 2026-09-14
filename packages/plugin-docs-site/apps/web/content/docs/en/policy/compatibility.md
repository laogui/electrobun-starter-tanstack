---
title: "Compatibility policy"
description: "How host, manifest, SDK and scaffold versions relate, what stays stable within a host major, and how data and updates stay compatible."
section: policy
order: 10
---

This is the public mirror of GhostBoard's compatibility policy. When the two disagree, the repository document wins and this page is updated.

## Current versions

| Identity | Value | Role |
| --- | --- | --- |
| GhostBoard host | `1.0.0` | The value compared against `engines.ghostboard` |
| Manifest version | `2` | The only manifest contract that loads |
| `@ghostboard/sdk` | `0.1.1` | Author types, fake host, packer, single-file reference; also `runtime.version` |
| `create-ghostboard-plugin` | `0.1.0` | Templates |
| Template default `engines.ghostboard` | `>=1.0.0 <2.0.0` | Range new plugins declare |

## Host version range

`engines.ghostboard` must be exactly `>=a.b.c <x.y.z`. A host outside the range reports `incompatible-host-api`, executes nothing, and keeps the installed files, enablement preference, storage, canvas cards and imported Notes. Use `>=<first host you verified> <next host major>.0.0`; every current SDK API exists since host `1.0.0`, so templates declare `>=1.0.0 <2.0.0`. The host never widens or ignores your range.

## API promise

1. **Additive within a host major.** Everything in the [SDK reference](/docs/reference/sdk/) keeps its signature and semantics for host `1.x`. New fields, optional parameters and extension points may appear; existing plugins keep working.
2. **Breaking changes only with a new host major**, shipped together with a new SDK major, a new scaffold major, a new default `engines` range or manifest version, and "since host x.y" notes in the reference. Old plugins on a new major get `incompatible-host-api`, not a half-working load.
3. **Deprecation** is announced in the reference at least one host minor before removal in the next major, with a replacement.
4. **The host supplies the runtime.** `@ghostboard/sdk`, `@ghostboard/sdk/react` and React/ReactDOM 19.2.x come from the running GhostBoard through its import map. The npm package is author tooling only. If you use an API introduced in a newer host, raise your lower bound.
5. **React major upgrades are host breaking changes.** Never bundle your own React.

## SDK ↔ host table

| `@ghostboard/sdk` | Hosts | `create-ghostboard-plugin` | Notes |
| --- | --- | --- | --- |
| `0.1.x` | `>=1.0.0 <2.0.0` | `0.1.x` | Complete T1–T4 API; no Bun backend entry |

`0.1.1` is a documentation-only patch: it adds no API and records how the existing selection, command and canvas APIs behave next to host-owned core node types such as Topic. Templates pinning `^0.1.0` already accept it, so no manifest or `engines` change is needed.

SDK patch/minor releases fix types, the fake host or the reference, or add APIs in step with the host. SDK majors move with host majors. This documentation's reference page is generated from the pinned SDK version shown at its top.

## Data and update compatibility

- **Manifest v1 packages** are refused with a notice and their data is kept. There is no dual runtime.
- **Canvas card state**: migrated lazily when `dataVersion` increases, after a host-owned backup; downgrades, missing migrations and conflicts never overwrite data; users can restore the latest backup from Settings.
- **Storage**: no versioned migration API; version your own values.
- **Note transactions**: revisions, batch intents and receipts are host-owned; history file formats are host-managed and older hosts refuse newer history rather than partially restoring it.
- **Signed updates**: unsigned packages cannot update in place; signed updates must advance semver and keep the pinned key and URL. Release documents use `ghostboard-plugin-release/v2` with per-release `ghostboard` ranges and SHA-256; the host picks the newest compatible release.
- **Code rollback** keeps the current and one previous version and re-verifies before switching; rollback and data restore both leave the plugin disabled.
- **Uninstall** removes code only.

See [Supported platforms and limits](/docs/policy/support-and-limits/) for what is and is not verified.
