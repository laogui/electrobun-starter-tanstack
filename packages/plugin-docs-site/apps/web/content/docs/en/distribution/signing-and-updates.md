---
title: "Signing and updates"
description: "Create an author key, sign packages, publish a release document over HTTPS, and understand what trust-on-first-use pinning does and does not promise."
section: distribution
order: 20
---

GhostBoard updates are **trust on first use**: the first install of a signed plugin pins the author's public key and the update URL. Every later update of that plugin ID must be signed with the same key, come from the same URL, and have a higher version. Nothing else — no account, domain purchase, certificate authority or review — is required.

## 1. Create an author key

```sh
ghostboard-plugin --generate-key ../plugin-keys/yourname.notes.pem
```

Keep the key outside the runtime directory and out of source control. The command prints an `ed25519-spki:...` value; put it in `manifest.json`:

```json
"publicKey": "ed25519-spki:MCowBQYDK2VwAyEA...",
"update": { "url": "https://example.com/plugins/yourname.notes/releases.json" }
```

Declare `update.url` before your first signed release. Both values are pinned on install; changing either later means users must uninstall and install a new plugin ID.

## 2. Sign while packaging

```sh
ghostboard-plugin dist \
  --sign ../plugin-keys/yourname.notes.pem \
  --output release/yourname.notes-0.1.0.ghostboard-plugin
```

The archive gains `ghostboard-signature.json` (schema v1). Its Ed25519 payload binds the plugin ID, version, normalized update URL and a sorted SHA-256 tree of every other file. GhostBoard verifies it before showing the review step. Tampering with any file, replacing the key, or removing the signature from a previously signed ID all fail closed.

## 3. Publish the release document

Host the archive and a JSON release document at the pinned `update.url`, both on public HTTPS:

```json
{
  "schema": "ghostboard-plugin-release/v2",
  "pluginId": "yourname.notes",
  "channel": "stable",
  "releases": [
    {
      "version": "0.1.1",
      "ghostboard": ">=1.0.0 <2.0.0",
      "url": "https://example.com/plugins/yourname.notes/yourname.notes-0.1.1.ghostboard-plugin",
      "sha256": "9abca983b696e39fc0977f8dcfccaa7b1df093e81f400280fb7842b49d8bc8bf",
      "notes": "Fix CSV quoting."
    },
    {
      "version": "0.1.0",
      "ghostboard": ">=1.0.0 <2.0.0",
      "url": "https://example.com/plugins/yourname.notes/yourname.notes-0.1.0.ghostboard-plugin",
      "sha256": "605aa4482daa0c68ef094132936a5efe665addb7c054aab60ebb25b44b73b34f"
    }
  ]
}
```

Rules: `schema` exactly as shown; `channel` lowercase identifier; 1–50 releases with unique semver `version`s; each `ghostboard` is a `>=a.b.c <x.y.z` range; each `url` is HTTPS without userinfo; `sha256` is the lowercase hex digest of the archive (print it with `shasum -a 256`); optional `notes` up to 8 KiB; document up to 1 MiB and must be JSON, not an HTML page. Serve the document with no or short caching so users see new versions promptly.

## 4. What the user sees

**Check for update** downloads the document, selects the newest release whose `ghostboard` range includes the user's version, downloads that archive with the same URL-install checks, verifies the `sha256`, the manifest and the signature, and shows **Verified update x.y.z is ready for review**. Installing keeps the previous version's files: **Roll back code to …** restores them after re-verifying, and any `dataVersion` migration writes a backup first. Rolled-back plugins stay disabled until re-enabled.

If the document is signed with a different key, points at a different URL, lists a version that is not higher, or has a digest mismatch, GhostBoard refuses with "author key changed" or the specific validation error and keeps the installed version.

## What signing does not mean

- It does not prove who you are; it proves the update comes from whoever holds the first key.
- It does not make the code safe. Plugins run with high trust regardless of signature.
- There is no key rotation. A lost or compromised key means a new plugin ID.
