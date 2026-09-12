# T3 combined importer acceptance

`fixture/` is an independently installable manifest-v2 package that registers a command, React panel, canvas type and bounded CSV note importer. Its importer exposes bounded source-field inspection, accepts the host-reviewed `title` / `text` / `color` mapping, and supports the existing single or explicit segmented preview result. The final-user package contains `manifest.json`, `app.js` and `csv.js`; it does not contain the SDK copy, dependencies, tests or package scripts.

The author test uses the copied standalone `@ghostboard/sdk/testing` fake host. It checks field inspection, mapped parsing, parser limits and contribution registration without launching GhostBoard. This does not replace the packaged macOS arm64 local-package/loopback-download acceptance probe, real native file picker, persistence, transaction recovery, host layout or platform checks. The packaged local phase also verifies host-owned mapping and current-canvas grid placement. Public-HTTPS evidence remains later T3 work.

Run `bun run test:plugin-t3` on macOS arm64 for the full packaged acceptance.
It builds a canary application and launches it three times to cover local ZIP
installation, restart-persistent undo/redo, and loopback-download installation
of the exact same archive. The automated file selection seam exists only while
`GHOSTBOARD_PLUGIN_T3_DIR` is explicitly set by this evidence runner; ordinary
application launches continue to use the native system picker.
