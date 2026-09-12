import { closeSync, openSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const project = resolve(import.meta.dir, '../..');
const directory = await mkdtemp(
  join(tmpdir(), 'ghostboard-plugin-t3-package-')
);
const source = join(directory, 'source');
const packageDirectory = join(directory, 'package');
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
await mkdir(packageDirectory);
for (const name of ['app.js', 'csv.js', 'manifest.json']) {
  await cp(join(source, name), join(packageDirectory, name));
}
await run(
  ['zip', '-X', '-q', archive, 'app.js', 'csv.js', 'manifest.json'],
  'zip.log',
  packageDirectory
);
const listing = await Bun.$`unzip -Z1 ${archive}`.text();
const entries = listing.trim().split('\n').sort();
if (entries.join(',') !== 'app.js,csv.js,manifest.json') {
  throw new Error(
    `Unexpected final-user package entries: ${entries.join(', ')}`
  );
}
const manifest = JSON.parse(
  await readFile(join(packageDirectory, 'manifest.json'), 'utf8')
) as { id?: unknown; manifestVersion?: unknown };
if (manifest.manifestVersion !== 2 || manifest.id !== 't3.combined') {
  throw new Error('Combined package manifest identity is invalid');
}

console.log(
  JSON.stringify(
    {
      archive,
      entries,
      packageBytes: (await Bun.file(archive).arrayBuffer()).byteLength,
      sourceTest: join(directory, 'test.log'),
    },
    null,
    2
  )
);
