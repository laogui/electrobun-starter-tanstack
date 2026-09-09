# React Hello GhostBoard

Author setup:

```sh
bun install
bun run type-check
bun run build
# Keep compiled output current while editing:
bun run dev
```

Use GhostBoard Settings → Plugins → Connect development directory to select **dist/**, then review and enable it with the high-trust confirmation. Open the command or panel from the plugin menu. Editing `src/app.tsx` while the watch build runs updates the external plugin, without changing the host repository.

Vite externalizes React, ReactDOM and `@ghostboard/sdk`. Do not bundle another React instance. The host supports React 19.2.x; the SDK's local copy provides author types, while the app's import map supplies the runtime implementation. `react/jsx-runtime` is also external. End users only need the built directory, not Bun, Node or npm dependencies.

The panel has its own React root. Closing it disposes that view, not the plugin command. Disabling or a **successful** reload removes old managed registrations and roots. A failed import or setup leaves the old activation, signal and open panel state intact; candidate registrations stay private until successful handoff. `app.generation` increases per attempt and `app.signal` aborts when its own activation retires or fails. Keep setup focused on registration, because direct DOM, file or network side effects are not rolled back. Keep DOM/CSS changes inside the provided mount point. Declare cleanup with `app.onCleanup()` and register owned workers with `app.workers.track()`.

## Theme and editable components (A1)

`src/components/ui.tsx` is **your source**, not a host component API. Edit, copy or replace its Button, Input and Surface components. They use only React and public `--gb-*` theme variables, so they follow GhostBoard's light/dark theme without importing private host modules. Styles stay inline inside the panel, with no global stylesheet or separate CSS asset to load. The frozen variable names and roles are listed in `sdk/README.md`.

## Optional global-runtime shim (A3)

The default `bun run build` keeps bare external imports and uses the host import map. This is the recommended path and the only supported path for no-build JavaScript plugins.

For a WebView with broken import-map support or a bundler integration that needs a global target, run:

```sh
bun run build:shim
# Equivalent: bunx vite build --config vite.shim.config.ts
```

`vite.shim.config.ts` is a complete optional config: it replaces the five shared modules with virtual ESM adapters to `globalThis.__ghostboardPluginRuntime`. It bundles neither React nor SDK code and imports no host-private paths. The host initializes the frozen object before executing your plugin. The adapters preserve each exported value's identity, including React's default export; the generated adapter's module namespace is not itself the native host namespace. Do not add React subpaths or SDK hooks that the current host does not expose. `runtime.version` is the shared SDK version, currently `0.1.0`.

T1 does not yet provide content/selection hooks, complete file services or signed updates. Native backends and permission sandboxes are not part of this model.
