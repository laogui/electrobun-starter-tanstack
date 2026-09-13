import { resolve } from 'node:path';

import { createPlugin } from '../packages/create-plugin/index.js';

// In-repository wrapper around the published `create-ghostboard-plugin` bin.
// Unless the caller passes `--sdk`, the generated project depends on this
// checkout's SDK so host developers can iterate without an npm release.
const args = process.argv.slice(2);
if (!args.includes('--sdk')) {
  args.push(
    '--sdk',
    `file:${resolve(import.meta.dir, '..', 'packages', 'plugin-sdk')}`
  );
}

try {
  const result = await createPlugin(args);
  console.log(result.message);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
