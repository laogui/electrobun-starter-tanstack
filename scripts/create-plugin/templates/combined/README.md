# Combined GhostBoard Example

This no-build template demonstrates all four public contribution types in one
independently installable plugin: a command, React panel, custom canvas type,
and mapped/segmented CSV importer.

Run it as a development plugin by connecting this directory in GhostBoard
Settings → Plugins. The host import map supplies React and the SDK, so final-user
runtime files are only `manifest.json` and `app.js`.

Author checks and packaging:

```sh
bun install
bun test
bun run package
```

Packaging writes `dist/example.combined-0.1.0.ghostboard-plugin`. Add another
`--include` to the package script for each new runtime module or asset. The
archive needs no Bun, `node_modules`, copied SDK, or source tests on the final
user's machine and is unsigned until T4.

Read `AGENTS.md` and `sdk/AI_REFERENCE.md` before extending the example. The
fake host checks registrations and pure behavior; it does not replace packaged
installation, real RPC/dialog/persistence, WebView, crash recovery, or platform
verification.
