import { definePlugin } from '@ghostboard/sdk';

const evidence = (globalThis.__trustedPluginTest ??= { events: [], ticks: 0 });
export default definePlugin({
  async setup(app) {
    evidence.events.push('slow:setup');
    app.signal.addEventListener('abort', () =>
      evidence.events.push('slow:abort')
    );
    app.onCleanup(() => {
      evidence.events.push('slow:cleanup');
    });
    await new Promise((resolve) => setTimeout(resolve, 2500));
    app.commands.register({ id: 'late', title: 'T1 late command', run() {} });
  },
});
