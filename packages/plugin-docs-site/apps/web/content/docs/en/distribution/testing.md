---
title: "Testing without GhostBoard"
description: "Use the in-memory fake host and the React test helper for author tests, and know what only a packaged app can verify."
section: distribution
order: 30
---

`@ghostboard/sdk/testing` runs your `setup` against an in-memory fake host so author tests need no GhostBoard installation. Every template ships one such test; run them with `bun test`.

```js
import { afterEach, expect, test } from 'bun:test';
import { createFakeHost } from '@ghostboard/sdk/testing';
import plugin from './app.js';

let fake;
afterEach(async () => {
  await fake?.harness.lifecycle.dispose();
  fake = undefined;
});

test('registers and runs the command', async () => {
  fake = createFakeHost({ pluginId: 'yourname.hello', workspaceId: 'test' });
  await plugin.setup(fake.app);

  expect(fake.harness.inspection.commands.map(({ id }) => id)).toEqual(['open-hello']);
  await fake.harness.behavior.runCommand('open-hello');
  expect(fake.harness.inspection.openPanels).toEqual(['hello']);
});
```

## Harness surface

| Area | Members |
| --- | --- |
| `inspection` | `commands`, `panels`, `canvasTypes`, `importers`, `tasks`, `openPanels`, `generation`, `signal`, `cleanupCount` |
| `behavior` | `runCommand`, `runTask`, `inspectImporterFields`, `parseImporter`, `emit`, `setSelection`, `abort` |
| `files` | `addText`, `addBytes`, `addDirectory`, `queuePick`, `queueDirectory` |
| `lifecycle` | `reload(factory)` (atomic reload semantics: failed candidates leave the old generation) and `dispose()` |

Storage, events and tasks are in-memory implementations of the same interfaces, so you can assert on `app.storage.workspace.get(...)` after running a command, emit `content.changed` and check the reaction, or advance an `at` task with `runTask`.

## React panels

```tsx
import { renderPanel } from '@ghostboard/sdk/testing/react';

const { getByText } = renderPanel(definition, { context: fake.app });
```

`renderPanel` renders a component panel with Testing Library and injects fake implementations of the SDK hooks, so `useSelectionState` reflects `harness.behavior.setSelection(...)`.

## What the fake does not do

The fake host does not reproduce GhostBoard layout or CSS, disk persistence, real RPC and native dialogs, multi-plugin arbitration, package installation and signature verification, WebView behavior or platform differences. Before release, install your packaged archive in GhostBoard and run through every contribution, disable the plugin, and restart the app.
