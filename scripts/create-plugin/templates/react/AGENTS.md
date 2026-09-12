# Plugin author instructions

Use `sdk/AI_REFERENCE.md` as the self-contained GhostBoard SDK and packaging
reference. The adjacent `sdk/*.d.ts` declarations are the exact type source of
truth. Do not import files from the GhostBoard host repository or modify host UI
outside a registered panel/card mount point.

Editable source lives in `src/`; `manifest.json` is copied by the Vite build.
`dist/` is the complete runtime directory and `release/` contains installable
archives. Keep React, ReactDOM, and GhostBoard SDK imports external as configured
in `vite.config.ts`; never bundle another React instance.

Before delivery, run `bun test`, `bun run type-check`, and `bun run package`.
The package command builds first and creates an unsigned archive below
`release/`. Signing remains a GhostBoard T4 capability.
