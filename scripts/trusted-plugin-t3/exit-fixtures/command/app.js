import { definePlugin } from '@ghostboard/sdk';

const evidence = (globalThis.__ghostboardT3Exit ??= {
  apps: {},
  commandRuns: 0,
});

export default definePlugin({
  setup(app) {
    evidence.apps.command = app;
    app.commands.register({
      id: 'record',
      title: 'Record independent command',
      run: () => {
        evidence.commandRuns += 1;
      },
    });
  },
});
