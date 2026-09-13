---
title: "Panels"
description: "Side views rendered with plain DOM or with the host's shared React 19, styled with public theme variables."
section: guides
order: 20
---

A panel is a view the user opens from a command or the plugin menu. It is either a **DOM mount function** or a **React component**, never both.

## DOM panel (no build step)

```js
app.panels.register({
  id: 'summary',
  title: 'Summary',
  mount(element) {
    const section = document.createElement('section');
    section.style.color = 'var(--gb-foreground)';
    section.style.background = 'var(--gb-surface)';
    section.textContent = `Workspace: ${app.workspaceId}`;
    element.append(section);
    return () => section.remove();
  },
});
app.panels.open('summary');
```

The disposer returned from `mount` runs when the panel closes or the plugin retires. Keep every DOM and style change inside `element`; the rest of the page is host UI that may be re-rendered at any time.

## React panel

Scaffold with `bunx create-ghostboard-plugin my-panel --react`. The template uses Vite with `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`, `@ghostboard/sdk` and `@ghostboard/sdk/react` marked **external**, so your bundle uses the host's React 19.2 instance. Bundling your own React breaks hooks.

```tsx
import { useSelectionState } from '@ghostboard/sdk/react';

function SelectionPanel() {
  const selection = useSelectionState();
  if (selection.status === 'loading') return <p>Loading…</p>;
  if (selection.status === 'error') return <p>{selection.error?.message}</p>;
  return <p>{selection.items.length} selected Notes</p>;
}

app.panels.register({ id: 'selection', title: 'Selection', component: SelectionPanel });
```

The host creates and owns an independent React root per panel and wraps it in the SDK's selection provider, so `useSelection`, `useSelectionState` and `useSelectedPlacements` work without any context setup. An exception thrown by your component only breaks that panel's root; the host UI and your other contributions keep running.

For projects whose WebView lacks import-map support, the React template also ships `vite.shim.config.ts`, which rewrites the six shared modules to adapters over `globalThis.__ghostboardPluginRuntime`. The default build is the recommended path.

## Theming without host components

Host components are not part of the SDK. The templates vendor small `Button`, `Input` and `Surface` helpers (`ui.js` or `src/components/ui.tsx`) that you own and can edit. They use only the public CSS variables `--gb-background`, `--gb-surface`, `--gb-foreground`, `--gb-muted`, `--gb-muted-foreground`, `--gb-border`, `--gb-accent`, `--gb-accent-soft`, `--gb-accent-foreground`, `--gb-danger`, `--gb-focus-ring`, `--gb-radius`, `--gb-shadow`, `--gb-font-sans` and `--gb-font-mono`, so they follow light and dark mode automatically. That list is frozen for the current host major. Do not import host-private modules or copy private class names.

## Lifecycle details

- Closing a panel disposes that view only; the plugin's commands stay available.
- A successful reload closes old panels and publishes the new registrations. A failed reload keeps the open panel and its state.
- Long-lived work started from a panel should observe `app.signal` or use `app.tasks.schedule` so it stops when the workspace deactivates.
- Track any `Worker` you create with `app.workers.track(worker)` so retirement terminates it.

## Testing React panels

`@ghostboard/sdk/testing/react` exports `renderPanel(definition, { context })`, which renders a component panel with Testing Library and fake SDK hooks. Use it for component logic; use a packaged GhostBoard build for layout and real selection behavior.
