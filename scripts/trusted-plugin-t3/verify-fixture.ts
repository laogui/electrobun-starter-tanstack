import { createHash } from 'node:crypto';
import { closeSync, openSync } from 'node:fs';
import { cp, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { loadPluginFromZip } from '../../src/bun/plugins/zipInstall';

const project = resolve(import.meta.dir, '../..');
const directory = await mkdtemp(
  join(tmpdir(), 'ghostboard-plugin-t3-package-')
);
const source = join(directory, 'source');
const archive = join(directory, 't3-combined.ghostboard-plugin');

await cp(join(import.meta.dir, 'fixture'), source, { recursive: true });
await cp(join(project, 'packages/plugin-sdk'), join(source, 'sdk'), {
  recursive: true,
});

async function run(
  command: string[],
  name: string,
  cwd: string
): Promise<void> {
  const logPath = join(directory, name);
  const log = openSync(logPath, 'w');
  try {
    const child = Bun.spawn(command, {
      cwd,
      stderr: log,
      stdout: log,
    });
    if ((await child.exited) !== 0) {
      throw new Error(`${command.join(' ')} failed; see ${logPath}`);
    }
  } finally {
    closeSync(log);
  }
}

await run(
  [process.execPath, 'install', '--ignore-scripts'],
  'install.log',
  source
);
await run([process.execPath, 'test'], 'test.log', source);
await run(
  [
    process.execPath,
    join(source, 'sdk', 'package-plugin.js'),
    source,
    '--output',
    archive,
    '--include',
    'app.js',
    '--include',
    'csv.js',
    '--include',
    'manifest.json',
  ],
  'package.log',
  source
);
const archiveBytes = new Uint8Array(await readFile(archive));
const loaded = await loadPluginFromZip(
  archiveBytes,
  join(directory, 'unpacked')
);
const entries = (await readdir(loaded.directory)).sort();
if (entries.join(',') !== 'app.js,csv.js,manifest.json') {
  throw new Error(
    `Unexpected final-user package entries: ${entries.join(', ')}`
  );
}
if (
  loaded.manifest.manifestVersion !== 2 ||
  loaded.manifest.id !== 't3.combined'
) {
  throw new Error('Combined package manifest identity is invalid');
}

console.log(
  JSON.stringify(
    {
      archive,
      entries,
      packageBytes: archiveBytes.length,
      sha256: createHash('sha256').update(archiveBytes).digest('hex'),
      sourceTest: join(directory, 'test.log'),
    },
    null,
    2
  )
);
