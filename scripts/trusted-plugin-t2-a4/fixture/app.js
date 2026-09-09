import { definePlugin } from '@ghostboard/sdk';

export default definePlugin({
  async setup(app) {
    const probe = {
      app,
      ticks: 0,
      pastTicks: 0,
      content: [],
      selection: [],
      activated: 0,
      previousWorkspace: await app.storage.workspace.get('persist'),
      previousApp: await app.storage.app.get('persist'),
    };
    globalThis.__trustedPluginA4 = probe;
    app.events.on('content.changed', (event) => probe.content.push(event));
    app.events.on('selection.changed', (event) => probe.selection.push(event));
    app.events.on('workspace.activated', () => {
      probe.activated += 1;
    });
    app.tasks.schedule('tick', { every: 50 }, () => {
      probe.ticks += 1;
    });
    app.tasks.schedule('past', { at: new Date(0) }, () => {
      probe.pastTicks += 1;
    });
    app.commands.register({
      id: 'persist',
      title: 'Persist A4 probe',
      async run() {
        await app.storage.workspace.set('persist', {
          owner: app.workspaceId,
          count: 7,
        });
        await app.storage.app.set('persist', 'application-value');
      },
    });
  },
});
