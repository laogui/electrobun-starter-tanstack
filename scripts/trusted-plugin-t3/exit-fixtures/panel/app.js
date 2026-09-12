import { definePlugin } from '@ghostboard/sdk';

const evidence = (globalThis.__ghostboardT3Exit ??= {
  apps: {},
  commandRuns: 0,
});

export default definePlugin({
  setup(app) {
    evidence.apps.panel = app;
    app.panels.register({
      id: 'status',
      title: 'Independent package panel',
      mount(element) {
        const output = document.createElement('output');
        output.dataset.t3ExitPanel = 'true';
        output.textContent = 'Independent panel is running';
        element.append(output);
        return () => output.remove();
      },
    });
  },
});
