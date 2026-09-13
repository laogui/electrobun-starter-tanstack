# create-ghostboard-plugin

Scaffolds an independent GhostBoard trusted plugin project outside the GhostBoard source tree.

```sh
bunx create-ghostboard-plugin my-plugin            # no-build JavaScript command + DOM panel
bunx create-ghostboard-plugin my-panel --react     # Vite + React panel on the host-shared React
bunx create-ghostboard-plugin my-importer --importer
bunx create-ghostboard-plugin my-suite --combined  # command, panel, canvas type and importer
```

`npx create-ghostboard-plugin ...` works as well; the generated projects use Bun for their author scripts.

Each project contains `manifest.json` (v2), the runtime entry, an `AGENTS.md` for coding agents, a `README.md`, and an author test that runs against `@ghostboard/sdk/testing` without launching GhostBoard. `bun install` in the new directory fetches `@ghostboard/sdk` from npm, which provides the TypeScript declarations, the single-file `AI_REFERENCE.md`, the fake host, and the `ghostboard-plugin` deterministic packer. End users never need Bun, Node or `node_modules`; they install the archive produced by `bun run package`.

The generated `manifest.json` declares `engines.ghostboard` for the GhostBoard versions the template was verified against. Read the compatibility policy in the SDK reference before widening the range.

## Options

- `--sdk <spec>` replaces the `@ghostboard/sdk` dependency spec written to `package.json`. GhostBoard's own repository uses it to verify templates against an unpublished SDK tarball (`--sdk file:../ghostboard-sdk-0.1.0.tgz`) or a local checkout. Normal authors do not need it.

## Versioning

`create-ghostboard-plugin` and `@ghostboard/sdk` are versioned independently. The templates pin `@ghostboard/sdk` with a caret range matching the SDK minor that they were generated for; new SDK minors add APIs without breaking existing templates, and a new SDK major ships with a new template major.
