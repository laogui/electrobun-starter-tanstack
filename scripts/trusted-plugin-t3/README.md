# T3 importer and independent-package acceptance

`fixture/` is an independently installable manifest-v2 package that registers a command, React panel, canvas type and bounded CSV note importer. Its importer exposes bounded source-field inspection, accepts the host-reviewed `title` / `text` / `color` mapping, and supports the existing single or explicit segmented preview result. The final-user package contains `manifest.json`, `app.js` and `csv.js`; it does not contain the SDK copy, dependencies, tests or package scripts.

The author test uses the copied standalone `@ghostboard/sdk/testing` fake host. It checks field inspection, mapped parsing, parser limits and contribution registration without launching GhostBoard. `exit-fixtures/` adds four one-contribution packages for command, panel, canvas type and CSV importer; `verify-exit-fixtures.ts` runs each author test, packages twice through the public packer, and parses the exact runtime-only archive with the production loader.

Run `bun run test:plugin-t3` on macOS arm64 for the full packaged acceptance.
It builds a canary application and launches it three times to cover local ZIP
installation, restart-persistent undo/redo, and loopback-download installation.
It exercises all four independent packages and retains the combined importer's
configuration, segmentation, retry and rollback regression. The automated file selection seam exists only while
`GHOSTBOARD_PLUGIN_T3_DIR` is explicitly set by this evidence runner; ordinary
application launches continue to use the native system picker. Loopback HTTP is
also evidence-only; normal URL installation remains restricted to public HTTPS.
See `docs/features/In Progress/trusted-plugin-t3-exit-evidence.md` for exact
hashes, checks, and the unverified public-HTTPS / platform boundaries.
