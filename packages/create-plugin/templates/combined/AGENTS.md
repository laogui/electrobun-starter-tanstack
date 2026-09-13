# Plugin author instructions

Use `node_modules/@ghostboard/sdk/AI_REFERENCE.md` (installed by `bun install`)
as the self-contained GhostBoard SDK and packaging reference. The adjacent
`node_modules/@ghostboard/sdk/*.d.ts` files are the exact type source of truth;
the same reference is published at https://ghostboard.app/docs/reference/sdk/ and
as `https://ghostboard.app/docs/llms-full.txt`. Do not import host-private files,
bundle another React instance, modify DOM outside mount points, or write
workspace data during importer preview.

Runtime files are `manifest.json`, `app.js`, and any relative modules/assets you
add. Author-only files include this document, `README.md`, `package.json`, tests,
`node_modules/`, and `dist/`. Add an `--include` to the `package` script for each
additional runtime file or directory.

Before delivery, run `bun test` and `bun run package`. The archive below
`dist/` is unsigned until you generate an author key with
`ghostboard-plugin --generate-key` and pass `--sign` as documented in the SDK
reference's Packaging section.
