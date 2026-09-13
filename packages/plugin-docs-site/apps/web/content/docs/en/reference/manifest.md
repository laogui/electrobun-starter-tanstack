---
title: "manifest.json (v2)"
description: "Every field of the closed manifest v2 schema, with validation rules and what happens on rejection."
section: reference
order: 20
---

```json
{
  "manifestVersion": 2,
  "id": "yourname.notes",
  "name": "Example Notes",
  "version": "0.1.0",
  "engines": { "ghostboard": ">=1.0.0 <2.0.0" },
  "entrypoints": { "app": "app.js" },
  "capabilities": ["files"],
  "author": "Your Name",
  "description": "Imports notes from CSV files.",
  "publicKey": "ed25519-spki:MCowBQYDK2VwAyEA...",
  "update": { "url": "https://example.com/plugins/yourname.notes/releases.json" }
}
```

The schema is **closed**: unknown fields are rejected so typos surface immediately.

| Field | Required | Rules |
| --- | --- | --- |
| `manifestVersion` | yes | Must be `2`. `1` is the retired sandbox contract; such packages are refused with "Legacy contract; reinstall a v2 version" and their data is kept. |
| `id` | yes | Third-party plugin ID, lowercase segments separated by dots (for example `yourname.notes`). `ghostboard.*` is reserved. The ID also namespaces canvas types, storage and commands. |
| `name` | yes | User-visible name. |
| `version` | yes | Semver. Same-ID updates must increase it. |
| `engines.ghostboard` | yes | Exactly `>=a.b.c <x.y.z` (two bounds, lower < upper). No `^`, `~`, `*` or single bounds. A host outside the range reports `incompatible-host-api` and runs no code. `engines` may contain no other keys. |
| `entrypoints.app` | yes | Safe package-relative `.js`/`.mjs` path that default-exports `definePlugin(...)`. |
| `capabilities` | yes | Array of `network`, `files`, `clipboard`. Shown to users as claims; they are not enforced. Use `[]` when none apply. |
| `author`, `description` | no | Free text shown in the review step. |
| `publicKey` | no | Exact `ed25519-spki:...` string printed by `ghostboard-plugin --generate-key`. Requires packaging with `--sign`. |
| `update.url` | no | Public HTTPS URL of the release document. Pinned together with `publicKey` on first install. |

## Validation happens before code runs

GhostBoard parses and validates the manifest from the ZIP (or connected directory) before the review step, and again from the installed tree before every activation using a canonical digest of the installed files. A package that no longer passes validation is disabled with "Package files no longer pass validation".

## Package layout

The manifest sits at the archive root or inside one wrapping directory. Everything else is relative modules and static assets. Limits: 256 files, 8 MiB uncompressed, no symlinks, no encrypted or duplicated entries, no path escapes. The packer enforces the same limits.
