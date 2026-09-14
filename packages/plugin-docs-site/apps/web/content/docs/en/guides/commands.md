---
title: "Commands"
description: "Register menu entries with optional shortcuts, keep behavior in one function, and respect the activation lifecycle."
section: guides
order: 10
---

A command is the smallest plugin: a `manifest.json` and one JavaScript file.

```js
import { definePlugin } from '@ghostboard/sdk';

export default definePlugin({
  setup(app) {
    app.commands.register({
      id: 'tidy-titles',
      title: 'Tidy selected titles',
      shortcut: 'Mod+Shift+T',
      enabled: () => !app.signal.aborted,
      run: () => tidyTitles(app),
    });
  },
});
```

## Rules of thumb

- **IDs are plugin-local kebab-case.** The host namespaces them by plugin ID, so two plugins can both have `open-summary`.
- **Host shortcuts win.** Text editing and built-in shortcuts take priority over plugin shortcuts; treat shortcuts as a convenience, not the only entry point. IME composition, key repeat and keys the focused context already owns never reach your command. That includes canvas keys bound to a selected core node — `Tab`, `Enter` and `F2` act on a selected or in-edit Topic, for example — so prefer a `Mod`-based combination and always keep a menu entry.
- **One function per behavior.** Put the real work in a function and call it from the command, a panel button and tests.
- **Registration is staged.** Everything registered in `setup` is published only after `setup` succeeds. A failed reload leaves the old command working.
- **Clean up owned resources.** `app.commands.register` returns a disposer, and you can add arbitrary cleanup with `app.onCleanup`. Cleanup runs in reverse order, once, when the plugin reloads, is disabled or the workspace closes.
- **Respect `app.signal`.** Pass it to `fetch`, storage and content calls so long operations stop when the activation retires.

## A command that edits Notes

```js
async function tidyTitles(app) {
  const selected = await app.selection.get({ signal: app.signal });
  const updates = selected
    .filter((note) => note.revision !== null)
    .map((note) => ({
      id: note.id,
      expectedRevision: note.revision,
      changes: { title: note.title.trim().replace(/\s+/g, ' ') },
    }));
  if (updates.length === 0) return;
  await app.content.updateMany(updates, {
    label: 'Tidy titles',
    operationId: `tidy-${Date.now()}`,
    signal: app.signal,
  });
}
```

`app.selection.get()` returns only the Notes behind the selection, so a selection that also contains Topics, folders or images simply yields fewer items than the user selected. Use `getPlacements()` when you need to tell the user what was skipped.

Updates are compare-and-swap on `expectedRevision`: if the user edited a Note in between, that item fails visibly instead of overwriting. The batch is recorded in the workspace history, so the user can undo it with the normal Undo shortcut while the canvas view is active, and your plugin can call `app.content.undo(batchId)` later. See [Notes, storage and events](/docs/guides/content-and-storage/).

## Testing

```js
import { createFakeHost } from '@ghostboard/sdk/testing';
import plugin from './app.js';

const fake = createFakeHost({ pluginId: 'yourname.tidy', workspaceId: 'w1' });
await plugin.setup(fake.app);
await fake.harness.behavior.runCommand('tidy-titles');
await fake.harness.lifecycle.dispose();
```
