import { definePlugin } from '@ghostboard/sdk';

export default definePlugin({
  setup(app) {
    const probe = { app, events: [], result: null };
    globalThis.__trustedPluginContent = probe;
    app.events.on('content.changed', (event) => probe.events.push(event));
    app.commands.register({
      id: 'normalize',
      title: 'Normalize probe note titles',
      async run() {
        const { items } = await app.content.query({ text: 'T2 Content probe' });
        probe.result = await app.content.updateMany(
          items.map((item) => ({
            id: item.id,
            expectedRevision: item.revision,
            changes: {
              title: item.title.trim().replace(/\s+/g, ' '),
              color: 'blue',
            },
          })),
          { label: 'Normalize two notes', operationId: 'original-batch' }
        );
        await app.storage.workspace.set('batch-id', probe.result.operationId);
      },
    });
    for (const action of ['undo', 'redo']) {
      app.commands.register({
        id: action,
        title: `${action} probe note batch`,
        async run() {
          const batchId = await app.storage.workspace.get('batch-id');
          probe.result = await app.content[action](batchId);
        },
      });
    }
  },
});
