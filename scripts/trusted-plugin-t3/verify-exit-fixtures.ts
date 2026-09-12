import { createHash } from 'node:crypto';
import { closeSync, openSync } from 'node:fs';
import { cp, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { loadPluginFromZip } from '../../src/bun/plugins/zipInstall';

const project = resolve(import.meta.dir, '../..');
const directory = await mkdtemp(
  join(tmpdir(), 'ghostboard-plugin-t3-exit-fixtures-')
);

interface Fixture {
  entries: string[];
  id: string;
  name: 'canvas' | 'command' | 'importer' | 'panel';
}

const fixtures: Fixture[] = [
  {
    entries: ['app.js', 'manifest.json'],
    id: 't3.exit.command',
    name: 'command',
  },
  {
    entries: ['app.js', 'manifest.json'],
    id: 't3.exit.panel',
    name: 'panel',
  },
  {
    entries: ['app.js', 'manifest.json'],
    id: 't3.exit.canvas',
    name: 'canvas',
  },
  {
    entries: ['app.js', 'csv.js', 'manifest.json'],
    id: 't3.exit.importer',
    name: 'importer',
  },
];

async function run(command: string[], name: string, cwd: string) {
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

async function verifyFixture(fixture: Fixture) {
  const source = join(directory, fixture.name);
  const archive = join(directory, `t3-exit-${fixture.name}.ghostboard-plugin`);
  await cp(join(import.meta.dir, 'exit-fixtures', fixture.name), source, {
    recursive: true,
  });
  await cp(join(project, 'packages/plugin-sdk'), join(source, 'sdk'), {
    recursive: true,
  });
  await run(
    [process.execPath, 'install', '--ignore-scripts'],
    `${fixture.name}-install.log`,
    source
  );
  await run([process.execPath, 'test'], `${fixture.name}-test.log`, source);
  const packageCommand = [
    process.execPath,
    join(source, 'sdk', 'package-plugin.js'),
    source,
    '--output',
    archive,
    ...fixture.entries.flatMap((entry) => ['--include', entry]),
  ];
  await run(packageCommand, `${fixture.name}-package.log`, source);
  const first = new Uint8Array(await readFile(archive));
  await run(packageCommand, `${fixture.name}-package-repeat.log`, source);
  const second = new Uint8Array(await readFile(archive));
  if (!Buffer.from(first).equals(Buffer.from(second))) {
    throw new Error(`${fixture.name} package is not deterministic`);
  }
  const loaded = await loadPluginFromZip(
    second,
    join(directory, `unpacked-${fixture.name}`)
  );
  const entries = (await readdir(loaded.directory)).sort();
  if (loaded.manifest.id !== fixture.id) {
    throw new Error(
      `${fixture.name} package has unexpected ID ${loaded.manifest.id}`
    );
  }
  if (entries.join(',') !== fixture.entries.sort().join(',')) {
    throw new Error(
      `${fixture.name} package has unexpected entries: ${entries.join(', ')}`
    );
  }
  return {
    archive,
    bytes: second.length,
    entries,
    id: fixture.id,
    sha256: createHash('sha256').update(second).digest('hex'),
  };
}

const results: Awaited<ReturnType<typeof verifyFixture>>[] = [];
for (const fixture of fixtures) {
  results.push(await verifyFixture(fixture));
}

console.log(
  JSON.stringify(
    {
      evidenceDirectory: directory,
      result:
        'four independent author tests and deterministic installer validations passed',
      results,
    },
    null,
    2
  )
);
