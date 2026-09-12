import { definePlugin } from '@ghostboard/sdk';
import { createElement } from 'react';

const evidence = (globalThis.__ghostboardT3Exit ??= {
  apps: {},
  commandRuns: 0,
});

function CounterCard({ context, state, updateState }) {
  return createElement(
    'button',
    {
      'data-t3-exit-canvas': true,
      disabled: context.readOnly,
      onClick: () => updateState({ count: state.count + 1 }),
      type: 'button',
    },
    `Independent count: ${state.count}`
  );
}

export default definePlugin({
  setup(app) {
    evidence.apps.canvas = app;
    app.canvas.registerType({
      component: CounterCard,
      createInitialState: () => ({ count: 0 }),
      dataVersion: 1,
      id: 'counter',
      summarize: (state) => ({
        plainText: `Independent count ${state.count}`,
        title: `Independent count: ${state.count}`,
      }),
      title: 'Independent counter',
      validateState: (state) =>
        Boolean(
          state &&
            typeof state === 'object' &&
            !Array.isArray(state) &&
            typeof state.count === 'number'
        ),
    });
  },
});
