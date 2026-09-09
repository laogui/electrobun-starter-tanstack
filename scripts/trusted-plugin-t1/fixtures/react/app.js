import * as sdk from '@ghostboard/sdk';
import { definePlugin } from '@ghostboard/sdk';
import * as react from 'react';
import { useEffect, useState } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { jsx } from 'react/jsx-runtime';
import * as reactDom from 'react-dom';
import * as reactDomClient from 'react-dom/client';

const evidence = (globalThis.__trustedPluginTest ??= { events: [], ticks: 0 });
const shared = globalThis.__ghostboardPluginRuntime;
evidence.sharedRuntimeIdentity =
  Object.isFrozen(shared) &&
  shared.react === react &&
  shared.reactDom === reactDom &&
  shared.reactDomClient === reactDomClient &&
  shared.jsxRuntime === jsxRuntime &&
  shared.sdk === sdk &&
  shared.react.default === react.default &&
  shared.react.useState === react.useState &&
  shared.reactDom.createPortal === reactDom.createPortal &&
  shared.reactDomClient.createRoot === reactDomClient.createRoot &&
  shared.jsxRuntime.jsx === jsxRuntime.jsx &&
  shared.sdk.definePlugin === sdk.definePlugin &&
  typeof shared.version === 'string';
function Panel() {
  const [count, setCount] = useState(0);
  useEffect(
    () => () => {
      evidence.events.push('react:unmount');
    },
    []
  );
  if (count === 2) {
    throw new Error('t1-panel-error');
  }
  return jsx('button', {
    'data-t1-react': true,
    onClick: () => setCount((value) => value + 1),
    children: `react:${count}`,
  });
}
export default definePlugin({
  setup(app) {
    evidence.events.push('react:setup');
    (evidence.reactContexts ??= []).push(app);
    app.signal.addEventListener('abort', () =>
      evidence.events.push(`react:abort:${app.generation}`)
    );
    app.onCleanup(() =>
      evidence.events.push(`react:cleanup:first:${app.generation}`)
    );
    app.onCleanup(async () => {
      evidence.events.push(`react:cleanup:second-start:${app.generation}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      evidence.events.push(`react:cleanup:second-end:${app.generation}`);
    });
    app.commands.register({
      id: 'lazy',
      title: 'T1 lazy import',
      async run() {
        const { label } = await import('./lazy.js');
        evidence.events.push(`react:lazy:${label}`);
      },
    });
    app.onCleanup(() => {
      evidence.events.push('react:cleanup');
    });
    app.panels.register({
      id: 'panel',
      title: 'T1 React panel',
      component: Panel,
    });
    app.commands.register({
      id: 'open',
      title: 'T1 open React',
      run: () => app.panels.open('panel'),
    });
  },
});
