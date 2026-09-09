import { definePlugin } from '@ghostboard/sdk';
import { label } from './label.js';

const evidence = (globalThis.__trustedPluginTest ??= { events: [], ticks: 0 });
evidence.events.push(`plain:module:${label}`);
evidence.sdkDefinition = definePlugin;
export default definePlugin({
  setup(app) {
    evidence.events.push(`plain:setup:${label}`);
    const workerUrl = URL.createObjectURL(
      new Blob(['setInterval(() => postMessage("tick"), 40)'], {
        type: 'text/javascript',
      })
    );
    const worker = new Worker(workerUrl);
    worker.addEventListener('message', () => {
      evidence.ticks += 1;
    });
    app.workers.track(worker);
    app.onCleanup(() => {
      URL.revokeObjectURL(workerUrl);
      evidence.events.push(`plain:cleanup:${label}`);
    });
    app.panels.register({
      id: 'panel',
      title: 'T1 DOM panel',
      mount(element) {
        evidence.events.push(`plain:mount:${label}`);
        const button = document.createElement('button');
        button.dataset.t1Plain = 'true';
        button.textContent = `plain:${label}`;
        element.append(button);
        return () => {
          button.remove();
          evidence.events.push(`plain:unmount:${label}`);
        };
      },
    });
    app.commands.register({
      id: 'open',
      title: 'T1 open DOM',
      run: () => app.panels.open('panel'),
    });
    app.commands.register({
      id: 'record',
      title: 'T1 record command',
      shortcut: 'Alt+Shift+Y',
      run: () => {
        evidence.events.push(`plain:command:${label}`);
      },
    });
  },
});
