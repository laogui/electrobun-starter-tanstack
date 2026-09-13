#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATES = Object.freeze({
  '--combined': 'combined',
  '--importer': 'importer',
  '--react': 'react',
});
const SDK_PACKAGE = '@ghostboard/sdk';
const packageRoot = dirname(fileURLToPath(import.meta.url));

function usage() {
  return [
    'Usage: create-ghostboard-plugin <new-directory> [--react|--importer|--combined] [--sdk <dependency-spec>]',
    '',
    'Templates:',
    '  (default)    No-build JavaScript command + DOM panel',
    '  --react      Vite + React panel using the host-shared React runtime',
    '  --importer   No-build mapped and segmented CSV importer',
    '  --combined   Command, panel, custom canvas type and importer in one package',
    '',
    'Options:',
    `  --sdk <spec> Replace the ${SDK_PACKAGE} dependency spec written to package.json.`,
    '               Intended for host-repository verification against an unpublished',
    '               tarball, for example --sdk file:../ghostboard-sdk-0.1.0.tgz.',
  ].join('\n');
}

function parseArguments(args) {
  let target;
  let template = 'javascript';
  let templateFlags = 0;
  let sdk;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--help' || value === '-h') {
      return { help: true };
    }
    if (value === '--sdk') {
      sdk = args[index + 1];
      if (!sdk || sdk.startsWith('--')) {
        throw new Error('--sdk requires a dependency spec');
      }
      index += 1;
      continue;
    }
    if (Object.hasOwn(TEMPLATES, value)) {
      template = TEMPLATES[value];
      templateFlags += 1;
      continue;
    }
    if (value.startsWith('--')) {
      throw new Error(`Unknown option ${value}\n\n${usage()}`);
    }
    if (target !== undefined) {
      throw new Error(`Unexpected argument ${value}\n\n${usage()}`);
    }
    target = value;
  }
  if (!target || templateFlags > 1) {
    throw new Error(usage());
  }
  return { sdk, target, template };
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function rewriteSdkDependency(directory, spec) {
  const path = join(directory, 'package.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  let replaced = false;
  for (const field of ['dependencies', 'devDependencies']) {
    const block = manifest[field];
    if (block && Object.hasOwn(block, SDK_PACKAGE)) {
      block[SDK_PACKAGE] = spec;
      replaced = true;
    }
  }
  if (!replaced) {
    throw new Error(`Template package.json does not depend on ${SDK_PACKAGE}`);
  }
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function createPlugin(args) {
  const parsed = parseArguments(args);
  if (parsed.help) {
    return { help: true, message: usage() };
  }
  const directory = resolve(parsed.target);
  if (await exists(directory)) {
    throw new Error(
      `Refusing to overwrite an existing directory: ${directory}`
    );
  }
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory);
  await cp(join(packageRoot, 'templates', parsed.template), directory, {
    recursive: true,
  });
  if (parsed.sdk) {
    await rewriteSdkDependency(directory, parsed.sdk);
  }
  const nextSteps =
    parsed.template === 'react'
      ? 'Run bun install, bun run build, then connect its dist/ directory in GhostBoard Settings → Plugins. Run bun run package to create an installable archive.'
      : 'Connect this directory in GhostBoard Settings → Plugins; no build is needed. Run bun install once to get author tests and the packer, then bun run package to create an installable archive.';
  return {
    directory,
    message: `Created ${parsed.template} plugin in ${directory}\n${nextSteps}`,
    template: parsed.template,
  };
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  try {
    const result = await createPlugin(process.argv.slice(2));
    console.log(result.message);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
