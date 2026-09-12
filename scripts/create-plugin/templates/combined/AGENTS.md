# Plugin author instructions

Use `sdk/AI_REFERENCE.md` as the self-contained GhostBoard SDK and packaging
reference. The adjacent `sdk/*.d.ts` files are the exact type source of truth.
Do not import host-private files, bundle another React instance, modify DOM
outside mount points, or write workspace data during importer preview.

Runtime files are `manifest.json`, `app.js`, and any relative modules/assets you
add. Author-only files include this document, `README.md`, `package.json`, tests,
`sdk/`, `node_modules/`, and `dist/`. Add an `--include` to the `package` script
for each additional runtime file or directory.

Before delivery, run `bun test` and `bun run package`. The archive below
`dist/` is unsigned until GhostBoard T4 signing support.
