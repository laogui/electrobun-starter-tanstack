---
title: "Custom canvas types"
description: "Register a new kind of card with validated, versioned state, a summary for search and export, and migrations with host backups."
section: guides
order: 30
---

A custom canvas type is a card the user can place on the canvas. Your plugin owns the component and the state shape; GhostBoard owns persistence, revisions, search indexing, preview and the missing-plugin fallback.

## Registered types and core node types

`registerType` always creates an **extension** node. It is not a way to define, replace or impersonate a core node type that GhostBoard ships itself — cards, stickies, images, folders, groups and Topics are host-owned.

The distinction matters most for **Topic**, GhostBoard's lightweight mind-map node. A Topic keeps its title inline in the canvas manifest, and its parent/child hierarchy lives entirely on host-managed tree edges that the host also lays out. There is no SDK call to read a Topic title, create a subtopic, reparent a branch or influence its layout, and no event that reports topic structure changes. Use `registerType` for your own versioned instance state; if you need hierarchy inside your card, model it in your own state, not on host trees.

## Minimal counter card

```js
import { createElement } from 'react';

function CounterCard({ context, state, updateState }) {
  return createElement(
    'button',
    {
      type: 'button',
      disabled: context.readOnly,
      onClick: () => updateState({ count: state.count + 1 }),
    },
    `Count: ${state.count}`
  );
}

app.canvas.registerType({
  id: 'counter',
  title: 'Counter',
  dataVersion: 1,
  component: CounterCard,
  createInitialState: () => ({ count: 0 }),
  validateState: (state) =>
    Boolean(state && typeof state === 'object' && !Array.isArray(state) &&
      typeof state.count === 'number'),
  summarize: (state) => ({
    title: `Counter: ${state.count}`,
    plainText: `Counter value ${state.count}`,
  }),
});
```

The persisted type name is `<pluginId>/<id>`. `createElement` avoids a build step; the `--react` and `--combined` templates show JSX and a richer scorecard.

## Contract

| Member | Purpose |
| --- | --- |
| `dataVersion` | Integer version of your state shape. Increase it when the shape changes. |
| `createInitialState()` | State for a newly placed card. |
| `validateState(state)` | Type guard. Persisted state is untrusted input; reject anything unexpected. |
| `migrateState(state, fromVersion)` | Converts old state to the current shape. Required when you raise `dataVersion`. |
| `summarize(state)` | `title` and `plainText` used for search, accessibility, preview, export and when the plugin is missing or disabled. |
| `component` / `previewComponent` | Rendered inside the card and (optionally) in compact previews. |
| `surface` | Default, minimum and maximum size, `resizable`, and `openBehavior: 'detail'` to get a focused view. |

`updateState(next)` commits a new revision and returns it. Pass `{ history: 'ephemeral' }` only for transient interaction frames (dragging a slider) and finish with a recorded update so undo has a sensible step.

## What happens when the plugin is missing

Cards keep their state, summary and search text when the plugin is disabled or uninstalled. Users see the summary placeholder; nothing is deleted. Re-enabling the plugin restores the live component.

## Migrations and recovery

When a card with an older `dataVersion` is loaded, GhostBoard first writes a **preimage** (a host-owned backup of the old state), then calls `migrateState` and saves the result with a new revision. If the backup cannot be written, the migration does not run. Downgrading the plugin never overwrites data with an older shape, and a migration that hits a revision conflict leaves live data untouched.

Users can restore the most recent preimage from Settings → Plugins (**Restore pre-migration backup**). Restoring disables the plugin and keeps a guard copy of the current data. Design migrations to be pure functions of the old state and keep `validateState` strict so a bad migration fails loudly instead of persisting garbage.

Only canvas card state has this backup contract. Plugin key-value storage does not; version your own values there.

## Testing

`createFakeHost` exposes registered types through `harness.inspection.canvasTypes`. Unit-test `validateState`, `migrateState` and `summarize` directly; verify rendering and persistence in a packaged GhostBoard build.
