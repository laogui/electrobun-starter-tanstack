# Plugin author instructions

Use `node_modules/@ghostboard/sdk/AI_REFERENCE.md` (installed by `bun install`)
as the self-contained GhostBoard SDK and packaging reference. The adjacent
`node_modules/@ghostboard/sdk/*.d.ts` declarations are the exact type source of
truth; the same reference is published at https://ghostboard.21blog.com/docs/reference/sdk/
and as `https://ghostboard.21blog.com/docs/llms-full.txt`. Do not import files from the
GhostBoard host repository or modify host UI outside a registered panel/card
mount point.

Runtime files live at this project root: `manifest.json`, `app.js`, `ui.js`, and
any relative modules/assets you add. Author-only files include this document,
`README.md`, `package.json`, tests, `node_modules/`, and `dist/`. When you add a
runtime module or asset, add another `--include` to the `package` script.

Before delivery, run `bun test` and `bun run package`. The installable archive
is written below `dist/`; it is unsigned until you generate an author key with
`ghostboard-plugin --generate-key` and pass `--sign` as documented in the SDK
reference's Packaging section.
