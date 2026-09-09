# @ghostboard/sdk 0.1

The T1 SDK for trusted GhostBoard commands and panels. Plugins execute in the host renderer's JavaScript realm. This package is not a sandbox or a permission system.

## Runtime and types

A plugin imports `@ghostboard/sdk` normally. GhostBoard's initial HTML import map resolves it to the host's stable module, so a plain JavaScript plugin needs no build or dependency install. This package supplies the same ESM helper and standalone TypeScript declarations for author tooling. It contains no host store imports.

React panels use the host's **React / ReactDOM 19.2.x**. A bundler must externalize `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`, and `@ghostboard/sdk`; other dependencies belong in the plugin's build. The package has optional React peers so a DOM-only JavaScript author does not have to use React.

## Minimal plugin

`manifest.json`:

```json
{
  "manifestVersion": 2,
  "id": "example.hello",
  "name": "Hello",
  "version": "0.1.0",
  "engines": { "ghostboard": ">=1.0.0 <2.0.0" },
  "entrypoints": { "app": "app.js" },
  "capabilities": []
}
```

`app.js`:

```js
import { definePlugin } from '@ghostboard/sdk';

export default definePlugin({
  setup(app) {
    app.panels.register({
      id: 'hello',
      title: 'Hello',
      mount(element) {
        element.textContent = 'Hello GhostBoard';
        return () => element.replaceChildren();
      },
    });
    app.commands.register({
      id: 'hello',
      title: 'Open Hello',
      run: () => app.panels.open('hello'),
    });
  },
});
```

Connect the directory through GhostBoard Settings → Plugins, review it, and confirm that you trust it before enabling. While enabled, changes automatically replace the old module generation and registrations. The plugin menu opens commands and panels, reloads the entire relative module graph, and displays runtime errors with source locations. Old v1 packages are never implicitly upgraded.

## T1 API

See `index.d.ts` for signatures.

- `definePlugin({ setup(app) })`: `setup` may be async and may return a disposer. Prefer side effects inside setup, not module top level.
- `app.pluginId`, `app.workspaceId`: fixed identity for this activation. Workspace identity is not a file path or access boundary. GhostBoard currently changes workspaces across an app restart.
- `app.generation`: per-plugin numeric activation-attempt counter for this renderer lifetime, including failed candidates. It is distinct from the opaque module-URL generation.
- `app.signal`: aborts when this instance retires, fails, or is cancelled. An attempted reload does **not** abort the running instance unless the candidate setup succeeds.
- `app.commands.register({ id, title, shortcut?, enabled?, run })`: registration is scoped to this plugin. Menu and shortcut use the same command and recheck `enabled` before running. `Mod` means Command on macOS and Control elsewhere. Editing controls, composition, repeat events, and reserved host shortcuts take priority.
- `app.panels.register({ id, title, component })` for React, **or** `{ id, title, mount(element) }` for DOM. A DOM mount may return a disposer. Each React view gets its own root; host contexts are not inherited.
- `app.panels.open(id)` / `close(id)`: closing removes just that view. Reopening creates a new root; the command stays active.
- `app.onCleanup(disposer)`: register an owned timer, listener, connection, or other resource for cleanup. The returned disposer can also run it early, once.
- `app.workers.track(worker)`: track an already-created Web Worker for termination on disable/reload. Use normal browser rules when constructing workers; cross-origin module loading does not make arbitrary cross-origin Worker URLs valid.

Commands/panels return disposers and are also automatically cleaned on failed setup, disable, reload, and workspace exit. Late async setup cannot revive a disabled activation. Async cleanup has a bounded wait with diagnostics; arbitrary plugin side effects cannot all be reversed. Keep DOM/CSS changes inside the supplied panel mount point. A React error boundary does not stop infinite loops or protect against malicious code.

## Reload and cleanup (A2)

A reload first imports a fresh immutable module graph and runs candidate `setup`. Commands, shortcuts, panel registrations and panel open/close requests remain private until setup succeeds. The running instance keeps its original context, signal, commands and open views during preparation.

If import or setup fails, only the candidate is aborted and cleaned. The old instance is **not** aborted, unloaded or re-created: its existing React state stays intact and lazy relative imports still resolve to its old graph. Failed candidates are retried only after another source edit or manual reload, not on every poll.

On success, the host aborts the old signal, removes old registrations, waits for their cleanup, then publishes the candidate and opens its requested panels. Disposers are awaited in reverse registration order, at most once per registration, including those returned by setup. Early disposal is not repeated. Each async disposer has a two-second wait limit by default; errors and timeouts produce diagnostics without stopping other cleanup. A timeout cannot forcibly stop arbitrary JavaScript.

Both generations' JavaScript can run during preparation. Only managed registrations are staged: direct DOM/global mutation, networking, file writes, or workers you create yourself are not transactional. Keep setup focused on registration, register cleanup for resources, and pass `app.signal` to cancellable browser APIs. Disabling, workspace exit or superseding a pending candidate aborts it and prevents late setup results from publishing.

## Theme and component ownership (A1)

The stable shared surface is React, `@ghostboard/sdk` (and hooks when their stage ships), and these **frozen SDK 0.1 CSS variable names and roles**. Values are not frozen: they follow the host theme, including `.dark`, and may improve with host releases.

| Variable | Role |
| --- | --- |
| `--gb-background` | Recessed page/input background |
| `--gb-foreground` | Primary text |
| `--gb-surface` | Raised panel background |
| `--gb-muted` | Muted controls and surfaces |
| `--gb-muted-foreground` | Secondary text |
| `--gb-border` | Control and panel boundaries |
| `--gb-accent` | Primary action fill |
| `--gb-accent-foreground` | Text on the primary action fill |
| `--gb-accent-soft` | Subtle accent background |
| `--gb-danger` | Destructive/error text |
| `--gb-focus-ring` | Keyboard-focus outline color |
| `--gb-radius` | Control/panel corner radius |
| `--gb-font-sans` | UI font stack |
| `--gb-font-mono` | Code font stack |
| `--gb-shadow` | Raised surface shadow |

Use complete CSS values, for example `color: var(--gb-foreground)` and `border: 1px solid var(--gb-border)`. These variables are inherited by plugin panels. Host tokens without the `--gb-` prefix are private.

Buttons, inputs, menus and dialogs are **not** exported through the SDK or import map. Both author templates vendor editable Button, Input and Surface source (`ui.js` or `src/components/ui.tsx`), using these tokens and no host component imports. The author owns this code; copying or changing it does not create a dependency on the host's component props. No experimental host component is exposed in T1.

## Bundler-global fallback (A3)

The initial HTML import map remains the recommended shared-dependency mechanism and the **only supported no-build JavaScript path**. For built plugins, GhostBoard also initializes this shallow-frozen object before any plugin module executes:

```ts
globalThis.__ghostboardPluginRuntime = Object.freeze({
  react,          // import-map module namespace: react
  reactDom,       // react-dom
  reactDomClient, // react-dom/client
  jsxRuntime,     // react/jsx-runtime
  sdk,            // @ghostboard/sdk
  version,        // shared SDK package version, currently "0.1.0"
});
```

This is a **bundler shim target**, not an additional SDK. Only these six fields are public; React internals, host stores and private components are not. The module fields are the exact import-map facade namespaces, including their default/named export identities. The container is frozen, not React itself or every object React exports. `version` is the SDK version, not the React version or a lifecycle generation.

The React author template defaults to bare externals. Its optional `vite.shim.config.ts` is a complete buildable example, selected with `bun run build:shim`: virtual ESM modules read the five namespaces from the global object, preserving each exported value without bundling another React or SDK implementation. Generated adapter namespaces are distinct from the native host namespaces; the exported functions/default objects retain identity. Neither config imports host-private files. A shim build is useful when import-map support is unreliable; it still requires the GhostBoard host and is not a standalone browser app. It exposes no T2 hooks.

## Stage boundaries

T1 covers this command/panel lifecycle only. Content, selection subscriptions and `@ghostboard/sdk/react` business hooks are T2; complete file workflows are T3. The earlier T0 `files`/`net` experiment is not a public API here. Signed updates and startup safe mode remain T4. There is no Bun backend entry, per-capability approval, or dual v1 runtime.

The source package can be copied, packed, and installed locally without the GhostBoard repository. No npm publication is implied by its presence in the repository.
