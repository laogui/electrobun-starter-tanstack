import { createHash } from 'node:crypto';
import { closeSync, openSync } from 'node:fs';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { loadPluginFromZip } from '../../src/bun/plugins/zipInstall';

const project = resolve(import.meta.dir, '../..');
const sdkPackage = join(project, 'packages', 'plugin-sdk');
const createPackage = join(project, 'packages', 'create-plugin');
const directory = await mkdtemp(join(tmpdir(), 'ghostboard-plugin-templates-'));
const REFERENCE_PATH = 'node_modules/@ghostboard/sdk/AI_REFERENCE.md';
const SCOPE_RE = /^@/;
const TARBALL_PREFIX_RE = /^package\//;

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

interface PackedPackage {
  entries: string[];
  name: string;
  tarball: string;
  version: string;
}

/**
 * Packs a workspace package exactly as `npm publish` / `bun publish` would,
 * so templates are verified against the publishable artifact rather than the
 * source checkout.
 */
async function packPackage(packageDirectory: string): Promise<PackedPackage> {
  const manifest = JSON.parse(
    await readFile(join(packageDirectory, 'package.json'), 'utf8')
  ) as { name: string; version: string };
  const destination = join(directory, 'tarballs');
  await run(
    [process.execPath, 'pm', 'pack', '--destination', destination],
    `pack-${manifest.name.replace(/[@/]/g, '_')}.log`,
    packageDirectory
  );
  const tarball = join(
    destination,
    `${manifest.name.replace(SCOPE_RE, '').replace('/', '-')}-${manifest.version}.tgz`
  );
  const list = Bun.spawn(['tar', '-tzf', tarball], { stdout: 'pipe' });
  const entries = (await new Response(list.stdout).text())
    .split('\n')
    .filter(Boolean)
    .map((entry) => entry.replace(TARBALL_PREFIX_RE, ''))
    .sort();
  if ((await list.exited) !== 0) {
    throw new Error(`Could not list ${tarball}`);
  }
  return { entries, name: manifest.name, tarball, version: manifest.version };
}

function requireEntries(pack: PackedPackage, required: string[]) {
  const missing = required.filter((entry) => !pack.entries.includes(entry));
  if (missing.length > 0) {
    throw new Error(
      `${pack.name} tarball is missing ${missing.join(', ')}; got ${pack.entries.join(', ')}`
    );
  }
}

const sdk = await packPackage(sdkPackage);
requireEntries(sdk, [
  'AI_REFERENCE.md',
  'README.md',
  'index.d.ts',
  'index.js',
  'package-plugin.js',
  'package.json',
  'react.d.ts',
  'react.js',
  'testing.d.ts',
  'testing.js',
  'testing/react.d.ts',
  'testing/react.js',
]);
const create = await packPackage(createPackage);
requireEntries(create, [
  'README.md',
  'index.js',
  'package.json',
  'templates/combined/manifest.json',
  'templates/importer/manifest.json',
  'templates/javascript/manifest.json',
  'templates/react/manifest.json',
  'templates/react/src/app.tsx',
]);
if (create.entries.some((entry) => entry.includes('node_modules/'))) {
  throw new Error(
    'create-ghostboard-plugin tarball must not include node_modules'
  );
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
      join(createPackage, 'index.js'),
      root,
      ...(options.flag ? [options.flag] : []),
      '--sdk',
      `file:${sdk.tarball}`,
    ],
    `create-${options.name}.log`
  );
  const agentInstructions = await readFile(join(root, 'AGENTS.md'), 'utf8');
  if (!agentInstructions.includes(REFERENCE_PATH)) {
    throw new Error(
      `${options.name} template does not route agents to the SDK`
    );
  }
  const templateManifest = JSON.parse(
    await readFile(join(root, 'package.json'), 'utf8')
  ) as Record<string, Record<string, string> | undefined>;
  const sdkSpec =
    templateManifest.dependencies?.['@ghostboard/sdk'] ??
    templateManifest.devDependencies?.['@ghostboard/sdk'];
  if (sdkSpec !== `file:${sdk.tarball}`) {
    throw new Error(`${options.name} template kept SDK spec ${sdkSpec}`);
  }
  await run(
    [process.execPath, 'install', '--ignore-scripts'],
    `install-${options.name}.log`,
    root
  );
  await readFile(join(root, REFERENCE_PATH), 'utf8');
  await readFile(join(root, 'node_modules', '.bin', 'ghostboard-plugin'));
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
      packages: {
        createPlugin: {
          entries: create.entries.length,
          name: create.name,
          version: create.version,
        },
        sdk: {
          entries: sdk.entries.length,
          name: sdk.name,
          version: sdk.version,
        },
      },
      react,
      result:
        'packed SDK and scaffold tarballs, author tests and deterministic installer validation passed',
    },
    null,
    2
  )
);
