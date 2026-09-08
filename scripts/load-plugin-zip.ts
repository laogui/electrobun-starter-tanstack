import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { loadPluginFromZip } from '../src/bun/plugins/zipInstall';

const zipPath = process.argv[2];
if (!zipPath) {
  console.error(
    'usage: bun scripts/load-plugin-zip.ts <plugin.zip|plugin.ghostboard-plugin>'
  );
  process.exit(1);
}

const dest = await mkdtemp(join(tmpdir(), 'ghostboard-plugin-zip-'));
await mkdir(dest, { recursive: true });
const loaded = await loadPluginFromZip(
  new Uint8Array(await readFile(resolve(zipPath))),
  dest
);

console.log(
  JSON.stringify(
    {
      zip: resolve(zipPath),
      unpacked: loaded.directory,
      id: loaded.manifest.id,
      name: loaded.manifest.name,
      version: loaded.manifest.version,
      commands: loaded.manifest.contributes.commands.map((command) => ({
        id: command.id,
        handler: command.handler,
      })),
      files: Object.keys(loaded.sources),
    },
    null,
    2
  )
);
