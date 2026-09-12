import { createHash } from 'node:crypto';
import { closeSync, openSync } from 'node:fs';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { loadPluginFromZip } from '../../src/bun/plugins/zipInstall';

const project = resolve(import.meta.dir, '../..');
const directory = await mkdtemp(join(tmpdir(), 'ghostboard-plugin-templates-'));

async function run(
  command: string[],
  name: string,
  cwd = project
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

async function listFiles(
  root: string,
  directoryPath = root
): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
    const path = join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, path)));
    } else if (entry.isFile()) {
      files.push(relative(root, path).split('\\').join('/'));
    }
  }
  return files.sort();
}

interface TemplateOptions {
  archive: string;
  expectedEntries: string[];
  flag?: '--combined' | '--importer' | '--react';
  id: string;
  name: string;
  react?: boolean;
}

async function verifyTemplate(options: TemplateOptions) {
  const root = join(directory, options.name);
  await run(
    [
      process.execPath,
      'run',
      'plugin:create',
      root,
      ...(options.flag ? [options.flag] : []),
    ],
    `create-${options.name}.log`
  );
  const agentInstructions = await readFile(join(root, 'AGENTS.md'), 'utf8');
  if (!agentInstructions.includes('sdk/AI_REFERENCE.md')) {
    throw new Error(
      `${options.name} template does not route agents to the SDK`
    );
  }
  await readFile(join(root, 'sdk', 'AI_REFERENCE.md'), 'utf8');
  await run(
    [process.execPath, 'install', '--ignore-scripts'],
    `install-${options.name}.log`,
    root
  );
  await run([process.execPath, 'test'], `test-${options.name}.log`, root);
  if (options.react) {
    await run(
      [process.execPath, 'run', 'type-check'],
      `type-${options.name}.log`,
      root
    );
  }
  await run(
    [process.execPath, 'run', 'package'],
    `package-${options.name}.log`,
    root
  );

  const archivePath = join(root, options.archive);
  const first = new Uint8Array(await readFile(archivePath));
  await run(
    [process.execPath, 'run', 'package'],
    `package-${options.name}-repeat.log`,
    root
  );
  const second = new Uint8Array(await readFile(archivePath));
  if (!Buffer.from(first).equals(Buffer.from(second))) {
    throw new Error(
      `${options.name} package is not byte-for-byte deterministic`
    );
  }

  const unpacked = await loadPluginFromZip(
    second,
    join(directory, `unpacked-${options.name}`)
  );
  if (unpacked.manifest.id !== options.id) {
    throw new Error(
      `${options.name} package has unexpected ID ${unpacked.manifest.id}`
    );
  }
  const entries = await listFiles(unpacked.directory);
  if (entries.join('\n') !== options.expectedEntries.sort().join('\n')) {
    throw new Error(
      `${options.name} package entries differ: ${entries.join(', ')}`
    );
  }
  return {
    archive: archivePath,
    bytes: second.length,
    entries,
    sha256: createHash('sha256').update(second).digest('hex'),
  };
}

const javascript = await verifyTemplate({
  archive: 'dist/example.hello-0.1.0.ghostboard-plugin',
  expectedEntries: ['app.js', 'manifest.json', 'ui.js'],
  id: 'example.hello',
  name: 'javascript',
});
const importer = await verifyTemplate({
  archive: 'dist/example.csv-importer-0.1.0.ghostboard-plugin',
  expectedEntries: ['app.js', 'csv.js', 'manifest.json'],
  flag: '--importer',
  id: 'example.csv-importer',
  name: 'importer',
});
const combined = await verifyTemplate({
  archive: 'dist/example.combined-0.1.0.ghostboard-plugin',
  expectedEntries: ['app.js', 'manifest.json'],
  flag: '--combined',
  id: 'example.combined',
  name: 'combined',
});
const react = await verifyTemplate({
  archive: 'release/example.react-hello-0.1.0.ghostboard-plugin',
  expectedEntries: ['app.js', 'app.js.map', 'manifest.json'],
  flag: '--react',
  id: 'example.react-hello',
  name: 'react',
  react: true,
});

console.log(
  JSON.stringify(
    {
      combined,
      evidenceDirectory: directory,
      importer,
      javascript,
      react,
      result: 'all author tests and deterministic installer validation passed',
    },
    null,
    2
  )
);
