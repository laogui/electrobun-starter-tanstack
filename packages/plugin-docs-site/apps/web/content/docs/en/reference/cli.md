---
title: "CLI: create-ghostboard-plugin and ghostboard-plugin"
description: "The scaffold command and the deterministic packer/signer that ship on npm."
section: reference
order: 30
---

## `create-ghostboard-plugin`

```sh
bunx create-ghostboard-plugin <new-directory> [--react|--importer|--combined] [--sdk <spec>]
```

| Option | Template |
| --- | --- |
| *(none)* | No-build JavaScript command + DOM panel (`manifest.json`, `app.js`, `ui.js`) |
| `--react` | Vite + React panel; externalizes React and the SDK, includes an optional global-runtime shim config |
| `--importer` | No-build mapped and segmented CSV importer |
| `--combined` | Command, React panel, custom canvas type and CSV importer in one no-build package |

The command refuses to overwrite an existing directory, copies the template, and prints the next steps. `--sdk <spec>` rewrites the `@ghostboard/sdk` dependency written to `package.json` (for example `--sdk file:../ghostboard-sdk-0.1.0.tgz`); it exists for verifying templates against an unpublished SDK and is not needed by authors.

Every generated project has `bun test` (fake-host author tests) and `bun run package`. The React template adds `bun run build`, `bun run dev` (watch build) and `bun run type-check`.

## `ghostboard-plugin`

Installed with `@ghostboard/sdk`; the generated `package` scripts call it, or run `bunx ghostboard-plugin`.

```text
ghostboard-plugin <runtime-directory> [options]

  --output <file>   Archive path. Defaults to <id>-<version>.ghostboard-plugin.
  --include <path>  Include one file or directory relative to the runtime directory.
                    Repeat to package a selected set of runtime files.
  --sign <file>     Sign with an Ed25519 PKCS#8 PEM private key.

ghostboard-plugin --generate-key <private-key.pem>
```

- Without `--include`, every regular file below the runtime directory is packaged (the React template packages `dist/`). With `--include`, only the listed files are packaged (the no-build templates list `manifest.json`, `app.js` and friends so tests and `node_modules` stay out).
- The output must be outside the runtime directory and end with `.ghostboard-plugin` or `.zip`.
- The archive is a stored ZIP written in sorted path order, so identical inputs produce an identical SHA-256. Symlinks, unsafe paths, more than 256 files or 8 MiB uncompressed are refused.
- The packer validates manifest v2 and checks that the app entry is inside the archive. It never executes plugin code or lifecycle scripts.
- `--generate-key` creates a private key with owner-only permissions, refuses to overwrite, and prints the `ed25519-spki:...` value for `publicKey`. Keep the key outside the runtime directory and out of source control; `--sign` refuses a key inside the runtime directory.
- `--sign` requires `publicKey` in the manifest to match the key, and `publicKey` without `--sign` is refused, so a signed manifest can never ship unsigned by accident.

See [Signing and updates](/docs/distribution/signing-and-updates/) for the release document that turns a signed package into an updatable one.
