import { definePlugin } from '@ghostboard/sdk';
export default definePlugin({
  setup(app) {
    app.commands.register({
      id: 'must-disappear',
      title: 'T1 leaked command',
      run() {},
    });
    throw new Error('t1-setup-error');
  },
});
