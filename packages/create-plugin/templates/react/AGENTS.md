# Plugin author instructions

Use `node_modules/@ghostboard/sdk/AI_REFERENCE.md` (installed by `bun install`)
as the self-contained GhostBoard SDK and packaging reference. The adjacent
`node_modules/@ghostboard/sdk/*.d.ts` declarations are the exact type source of
truth; the same reference is published at https://ghostboard.21blog.com/docs/reference/sdk/
and as `https://ghostboard.21blog.com/docs/llms-full.txt`. Do not import files from the
GhostBoard host repository or modify host UI outside a registered panel/card
mount point.

Editable source lives in `src/`; `manifest.json` is copied by the Vite build.
`dist/` is the complete runtime directory and `release/` contains installable
archives. Keep React, ReactDOM, and GhostBoard SDK imports external as configured
in `vite.config.ts`; never bundle another React instance.

Before delivery, run `bun test`, `bun run type-check`, and `bun run package`.
The package command builds first and creates an archive below `release/`. It is
unsigned until you generate an author key with `ghostboard-plugin --generate-key`
and pass `--sign` as documented in the SDK reference's Packaging section.
