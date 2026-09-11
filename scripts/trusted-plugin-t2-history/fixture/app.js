import { definePlugin } from '@ghostboard/sdk';

export default definePlugin({
  setup(app) {
    globalThis.__trustedPluginHistory = { app };
  },
});
