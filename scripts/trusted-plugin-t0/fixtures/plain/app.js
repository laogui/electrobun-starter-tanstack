import { definePlugin, files, net } from '@ghostboard/sdk';
import { label } from './label.js';

export const definePluginIdentity = definePlugin;
export const documentIdentity = document;

export default definePlugin({
  label,
  run() {
    return 'command-ran';
  },
  async services(path, url) {
    await files.writeText(path, 'GhostBoard T0 file roundtrip ✓');
    const { text } = await files.readText(path);
    const network = await net.fetch(url);
    return { text, network };
  },
});
