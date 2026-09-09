import { definePlugin } from '@ghostboard/sdk';
import {
  useSelectedPlacements,
  useSelection,
  useSelectionState,
} from '@ghostboard/sdk/react';
import { createElement, useEffect } from 'react';

export default definePlugin({
  setup(app) {
    const probe = {
      app,
      hooks: null,
      notifications: 0,
      renders: 0,
      mounts: 0,
      unmounts: 0,
      captured: [],
      result: null,
      sharedHooks:
        globalThis.__ghostboardPluginRuntime.sdkReact.useSelection ===
        useSelection,
    };
    globalThis.__trustedPluginSelection = probe;
    app.selection.subscribe(() => {
      probe.notifications += 1;
    });
    function SelectionPanel() {
      const items = useSelection();
      const state = useSelectionState();
      const placements = useSelectedPlacements();
      probe.renders += 1;
      useEffect(() => {
        probe.hooks = { items, state, placements };
      }, [items, state, placements]);
      useEffect(() => {
        probe.mounts += 1;
        return () => {
          probe.unmounts += 1;
        };
      }, []);
      return createElement(
        'div',
        { 'data-selection-probe': true },
        createElement(
          'p',
          null,
          `${state.status}: ${items.length} notes / ${placements.items.length} placements`
        ),
        ...items.map((item) => createElement('p', { key: item.id }, item.title))
      );
    }
    app.panels.register({
      id: 'selection',
      title: 'Selection probe',
      component: SelectionPanel,
    });
    app.panels.open('selection');
    app.commands.register({
      id: 'normalize',
      title: 'Normalize selected note titles',
      async run() {
        const items = await app.selection.get();
        probe.captured = items;
        if (!items.length) {
          return;
        }
        probe.result = await app.content.updateMany(
          items.map((item) => ({
            id: item.id,
            expectedRevision: item.revision,
            changes: { title: item.title.trim().replace(/\s+/g, ' ') },
          })),
          {
            label: 'Normalize selected notes',
            operationId: 'selected-title-batch',
          }
        );
        await app.storage.workspace.set(
          'selection-batch',
          probe.result.operationId
        );
      },
    });
    app.commands.register({
      id: 'undo',
      title: 'Undo selected title batch',
      async run() {
        probe.result = await app.content.undo(
          await app.storage.workspace.get('selection-batch')
        );
      },
    });
  },
});
