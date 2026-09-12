# Plugin author instructions

Use `sdk/AI_REFERENCE.md` as the self-contained GhostBoard SDK and packaging
reference. The adjacent `sdk/*.d.ts` declarations are the exact type source of
truth. Do not import files from the GhostBoard host repository or modify host UI
outside a registered panel/card mount point.

Runtime files live at this project root: `manifest.json`, `app.js`, `ui.js`, and
any relative modules/assets you add. Author-only files include this document,
`README.md`, `package.json`, tests, `sdk/`, `node_modules/`, and `dist/`. When you
add a runtime module or asset, add another `--include` to the `package` script.

Before delivery, run `bun test` and `bun run package`. The installable archive
is written below `dist/` and is unsigned until GhostBoard T4 signing support.
