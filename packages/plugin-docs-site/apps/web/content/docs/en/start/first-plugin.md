---
title: "Build your first plugin in 15 minutes"
description: "Scaffold a command + panel plugin, connect it as a development directory, edit with live reload, test without the app and package it."
section: start
order: 20
---

Goal: a working plugin with one command and one panel, running in GhostBoard, tested and packaged. Time checkpoints assume GhostBoard is already installed and you have Bun.

## 1. Scaffold (2 min)

```sh
bunx create-ghostboard-plugin hello-plugin
cd hello-plugin
bun install
```

`bun install` only fetches `@ghostboard/sdk`, which provides TypeScript declarations, the single-file `AI_REFERENCE.md`, a fake host for tests and the `ghostboard-plugin` packer. None of it ships to end users.

You now have:

```text
hello-plugin/
├── manifest.json   # id, version, engines.ghostboard, entry point
├── app.js          # definePlugin({ setup }) with a command and a panel
├── ui.js           # editable Button/Input/Surface helpers using --gb-* theme tokens
├── app.test.js     # runs against @ghostboard/sdk/testing
├── AGENTS.md       # points coding agents at the SDK reference
└── package.json    # bun test, bun run package
```

Open `manifest.json` and change `id` to something unique in reverse-DNS-ish form, for example `yourname.hello`. IDs starting with `ghostboard.` are reserved.

## 2. Run it in GhostBoard (3 min)

1. Open **Settings → Plugins → Connect development directory…** and choose `hello-plugin/`.
2. Review the directory identity and click **Connect directory**, then **Enable for workspace** and confirm the high-trust notice.
3. Open the plugin menu and run **Open Hello panel**. The panel appears with your workspace ID.

Connecting only registers the directory; code is loaded when you enable it.

## 3. Edit with live reload (3 min)

Change the panel text in `app.js`:

```js
import { definePlugin } from '@ghostboard/sdk';

export default definePlugin({
  setup(app) {
    app.commands.register({
      id: 'open-hello',
      title: 'Open Hello panel',
      shortcut: 'Mod+Shift+H',
      run: () => app.panels.open('hello'),
    });
    app.panels.register({
      id: 'hello',
      title: 'Hello',
      mount(element) {
        const heading = document.createElement('h2');
        heading.textContent = `Hello from ${app.pluginId} in ${app.workspaceId}`;
        element.append(heading);
        return () => heading.remove();
      },
    });
  },
});
```

Save. The enabled plugin reloads automatically: the old registrations are cleaned up and the new ones published. If your new code throws during import or `setup`, the previous version keeps running and the plugin menu shows the error with the file and line. Anything you registered is cleaned up in reverse order when the plugin reloads or is disabled; DOM you create outside the panel's mount element is not.

## 4. Test without GhostBoard (2 min)

```sh
bun test
```

`app.test.js` creates a fake host, runs `setup`, checks the registered command and panel IDs and triggers the command. The fake host does not reproduce layout, persistence, native dialogs or platform behavior; it is for logic.

## 5. Package (2 min)

```sh
bun run package
```

This writes `dist/<id>-<version>.ghostboard-plugin` containing only `manifest.json`, `app.js` and `ui.js` — the files listed as `--include` in the `package` script. The archive is deterministic (same bytes in, same hash out) and never executes your code. Install it through **Settings → Plugins → Choose package…** to see the end-user flow.

## 6. Next steps (3 min of reading)

- Add a React panel: [Panels](/docs/guides/panels/), or scaffold with `--react`.
- Read and change Notes: [Notes, storage and events](/docs/guides/content-and-storage/).
- Ship updates: [Signing and updates](/docs/distribution/signing-and-updates/).
- Let a coding agent continue: `AGENTS.md` in your project points it to `node_modules/@ghostboard/sdk/AI_REFERENCE.md`, the same text as the [SDK reference](/docs/reference/sdk/).
