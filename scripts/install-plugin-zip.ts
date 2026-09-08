import { mkdir, readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { PluginInstallStore } from '../src/bun/plugins/pluginInstall';

const zipPath = process.argv[2];
const pluginsRoot = process.argv[3];
if (!(zipPath && pluginsRoot)) {
  console.error(
    'usage: bun scripts/install-plugin-zip.ts <plugin.zip> <plugins-root>'
  );
  process.exit(1);
}

const root = resolve(pluginsRoot);
await mkdir(root, { recursive: true });
const store = new PluginInstallStore(root);
const zipBytes = new Uint8Array(await readFile(resolve(zipPath)));
const prepared = await store.prepareFromZip({
  zipBytes,
  source: { kind: 'file', name: basename(zipPath) },
});
const installed = await store.commit(prepared.transactionId);

console.log(
  JSON.stringify(
    {
      transactionId: prepared.transactionId,
      pluginId: installed.pluginId,
      version: installed.version,
      digest: installed.digest,
      directory: installed.directory,
      source: installed.source,
    },
    null,
    2
  )
);
