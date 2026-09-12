# Findings & Decisions

## Requirements
- Provide a normal author-facing command that produces an installable `.ghostboard-plugin` archive from a plugin runtime directory.
- Add a standalone importer template and keep a combined template covering command, panel, canvas type and importer.
- Publish a single-file AI reference so generated no-build JavaScript can target the supported public surface without depending on repository internals.
- Reuse manifest v2 and the existing ZIP installer limits; do not introduce signing or update semantics before T4.

## Research Findings
- `plugin:create` currently supports only default JavaScript and `--react`; it copies a complete SDK directory into the generated author project.
- Existing JavaScript and React templates cover only command + panel. Their verification installs dependencies, runs author tests, and additionally type-checks/builds React output.
- The T3 combined fixture already has the desired four contributions and author tests, but `verify-fixture.ts` assembles its final package manually with the system `zip` command and a hard-coded three-file allowlist.
- The runtime installer accepts manifest v2 at archive root or under one common wrapping directory, rejects unsafe/duplicate/encrypted/data-descriptor entries, and caps archives at 256 entries / 8 MiB uncompressed / 100x compression ratio.
- The public archive must contain runtime files only; local `sdk/`, `node_modules`, source tests, package metadata and author documentation are author-time inputs rather than final-user runtime dependencies.
- Addendum A6 requires one self-contained Markdown SDK reference, organized by extension point with signatures and minimal examples, plus an `AGENTS.md` in every generated template that points to the local copied reference and explains directory conventions.
- The manifest has a deliberately closed v2 schema and exactly one JavaScript app entry. Package validation checks that entry but runtime-relative modules and arbitrary static assets may also be needed, so the packaging input should be an explicit runtime directory rather than an inferred module graph.
- React already produces a clean `dist/`; no-build templates need a deterministic staging step or explicit include policy so author-only `sdk/`, tests and package files do not leak into the final archive.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Build on the current `plugin:create` workflow rather than add a second scaffold command. | Existing author setup, copied SDK types and template verifier already establish the public workflow. |
| Make the packer independent of the platform `zip` executable and validate its own output with the production ZIP loader. | A public tool should behave consistently on macOS, Windows and Linux and should prove it emits an archive the actual installer accepts. |
| Keep T4 signing out of the package format for this slice. | Current planning explicitly assigns author keys, TOFU and signed updates to T4; T3 packaging must state that its output is unsigned. |
| Package an explicit runtime directory in sorted path order using stored ZIP entries with zero DOS timestamps. | This supports relative modules/assets without executing or parsing code, avoids external `zip`, and makes identical inputs byte-for-byte reproducible. |
| Have each scaffold expose `bun run package`, staging its supported runtime files into a clean directory before calling the shared packer. | React can package `dist/`; no-build templates can copy only their declared runtime files while still teaching authors where to add assets. |
| Add `--importer` and `--combined` as mutually exclusive, backward-compatible `plugin:create` modes. | Existing default and `--react` callers continue to work while the two missing public author paths become explicit and discoverable. |
| Put the packer in the SDK package and copy it with every scaffold. | External author projects receive the same no-dependency command used by the repository; the package `files` list can publish the tool and AI reference together. |
| Verify each generated archive twice and open it with `loadPluginFromZip`. | This proves deterministic bytes, exact runtime-only contents, manifest identity, entry presence, and compatibility with the real installation parser. |
| Preserve only traversal/absolute/NUL/backslash path forms rather than all non-ASCII names. | The production loader supports UTF-8 asset names; the deterministic packer sets the ZIP UTF-8 flag and should not add an unrelated author restriction. |
| Replace the T3 fixture's system `zip` path with the public packer. | The existing packaged acceptance can now exercise the author-facing artifact path instead of a bespoke archive implementation. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|

## Resources
- `scripts/create-plugin.ts`
- `scripts/create-plugin/templates/`
- `scripts/create-plugin/verify-templates.ts`
- `scripts/trusted-plugin-t3/fixture/`
- `scripts/trusted-plugin-t3/verify-fixture.ts`
- `src/bun/plugins/zipInstall.ts`
