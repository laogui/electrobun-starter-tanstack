# CSV Notes Importer

This no-build template registers one host-owned CSV import workflow. Connect
this directory in GhostBoard Settings → Plugins, review the high-trust and
`files` capability notice, enable it, then choose **Import Notes from CSV** in
the Plugin Workbench.

The host chooses the file, displays field mapping and an immutable preview, and
owns confirmation, destination, retry, rollback, and source-handle cleanup.
`inspectFields` and `parse` only read the selected opaque handle; they do not
write workspace data. Up to 100 Notes use one batch. The example returns
explicit 100-item segments for 101–5,000 Notes.

Author checks and packaging:

```sh
bun install
bun test
bun run package
```

`bun install` fetches `@ghostboard/sdk` from npm for tests and the packer. Packaging writes
`dist/example.csv-importer-0.1.0.ghostboard-plugin` with only `manifest.json`,
`app.js`, and `csv.js`. Add `--include` entries to the package script for new
runtime modules/assets. The final-user archive needs no Bun or `node_modules`
and remains unsigned until you configure the author key and `--sign` flow in
the SDK reference.

Read `AGENTS.md` and `node_modules/@ghostboard/sdk/AI_REFERENCE.md` before
extending the template. The
fake host validates author logic, not real dialogs, persistence, installation,
layout, platform behavior, or crash recovery.
