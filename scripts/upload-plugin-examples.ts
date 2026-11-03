#!/usr/bin/env bun
/**
 * Builds, signs and publishes the four example plugin packages (the
 * create-ghostboard-plugin templates) plus their release documents to R2 so
 * the documentation site can link installable examples and the T5 probe can
 * exercise public-HTTPS install and signed update.
 *
 * Layout under the R2 key prefix (default `plugins/examples/`):
 *   <id>/<version>/<id>-<version>.ghostboard-plugin
 *   <id>/releases.json          (ghostboard-plugin-release/v2; bypass CDN cache)
 *   index.json                  (all archives with sha256 for the docs page)
 *
 * Usage: bun scripts/upload-plugin-examples.ts [--dry-run] [--base-url=<https url>]
 *   --dry-run   Build everything into build/plugin-examples/ without uploading.
 * Environment:
 *   GHOSTBOARD_EXAMPLE_SIGNING_KEY  Path to the example author's Ed25519 PKCS#8 PEM.
 *                                   Required unless --dry-run (an ephemeral key is
 *                                   generated and reported as such).
 *   GHOSTBOARD_PLUGIN_EXAMPLES_BASE_URL  Public HTTPS base (default
 *                                   https://ghostboard.21blog.com/plugins/examples).
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
 *   R2_EXAMPLES_KEY_PREFIX (default plugins/examples/)  as in upload-r2.ts.
 */
import { closeSync, openSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { S3Client } from 'bun';
import { createPlugin } from '../packages/create-plugin/index.js';
import {
  buildPluginPackage,
  generateSigningKey,
} from '../packages/plugin-sdk/package-plugin.js';

const project = resolve(import.meta.dir, '..');
const sdkPath = join(project, 'packages', 'plugin-sdk');
const outputRoot = join(project, 'build', 'plugin-examples');
const dryRun = process.argv.includes('--dry-run');
const baseUrlArgument = process.argv
  .find((argument) => argument.startsWith('--base-url='))
  ?.slice('--base-url='.length);
const baseUrl = (
  baseUrlArgument ??
  process.env.GHOSTBOARD_PLUGIN_EXAMPLES_BASE_URL ??
  'https://ghostboard.21blog.com/plugins/examples'
).replace(/\/+$/, '');
if (!baseUrl.startsWith('https://')) {
  throw new Error('Example base URL must be https://');
}

const HOST_RANGE = '>=1.0.0 <2.0.0';

interface ExampleSpec {
  flag?: '--combined' | '--importer' | '--react';
  id: string;
  /** Runtime files copied from the scaffolded project (no-build templates). */
  runtimeFiles?: string[];
  /** Versions to publish; the first is the template's own version. */
  versions: string[];
}

const examples: ExampleSpec[] = [
  {
    id: 'example.hello',
    runtimeFiles: ['manifest.json', 'app.js', 'ui.js'],
    versions: ['0.1.0', '0.1.1'],
  },
  { flag: '--react', id: 'example.react-hello', versions: ['0.1.0'] },
  {
    flag: '--importer',
    id: 'example.csv-importer',
    runtimeFiles: ['manifest.json', 'app.js', 'csv.js'],
    versions: ['0.1.0'],
  },
  {
    flag: '--combined',
    id: 'example.combined',
    runtimeFiles: ['manifest.json', 'app.js'],
    versions: ['0.1.0'],
  },
];

interface ReleaseRecord {
  ghostboard: string;
  notes?: string;
  sha256: string;
  url: string;
  version: string;
}

interface UploadItem {
  bypassCache: boolean;
  contentType: string;
  key: string;
  path: string;
}

await rm(outputRoot, { force: true, recursive: true });
await mkdir(outputRoot, { recursive: true });
const workDirectory = join(outputRoot, '.work');
await mkdir(workDirectory);

async function run(command: string[], name: string, cwd: string) {
  const logPath = join(outputRoot, `${name}.log`);
  const log = openSync(logPath, 'w');
  try {
    const child = Bun.spawn(command, { cwd, stderr: log, stdout: log });
    if ((await child.exited) !== 0) {
      throw new Error(`${command.join(' ')} failed; see ${logPath}`);
    }
  } finally {
    closeSync(log);
  }
}

let signingKey = process.env.GHOSTBOARD_EXAMPLE_SIGNING_KEY;
let ephemeralKey = false;
if (!signingKey) {
  if (!dryRun) {
    throw new Error(
      'GHOSTBOARD_EXAMPLE_SIGNING_KEY is required to publish signed examples'
    );
  }
  signingKey = (await generateSigningKey(join(workDirectory, 'ephemeral.pem')))
    .privateKey;
  ephemeralKey = true;
}
const { createPublicKey } = await import('node:crypto');
const publicKey = `ed25519-spki:${createPublicKey(
  await readFile(signingKey, 'utf8')
)
  .export({ format: 'der', type: 'spki' })
  .toString('base64')}`;

function releaseUrl(id: string) {
  return `${baseUrl}/${id}/releases.json`;
}

function archiveName(id: string, version: string) {
  return `${id}-${version}.ghostboard-plugin`;
}

async function stampManifest(
  runtimeDirectory: string,
  id: string,
  version: string
) {
  const path = join(runtimeDirectory, 'manifest.json');
  const manifest = JSON.parse(await readFile(path, 'utf8')) as Record<
    string,
    unknown
  >;
  if (manifest.id !== id) {
    throw new Error(`Template manifest id ${manifest.id} is not ${id}`);
  }
  manifest.version = version;
  manifest.engines = { ghostboard: HOST_RANGE };
  manifest.publicKey = publicKey;
  manifest.update = { url: releaseUrl(id) };
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

const uploads: UploadItem[] = [];
const index: Record<
  string,
  { releases: ReleaseRecord[]; releasesUrl: string }
> = {};

for (const example of examples) {
  const scaffold = join(workDirectory, example.id);
  await createPlugin([
    scaffold,
    ...(example.flag ? [example.flag] : []),
    '--sdk',
    `file:${sdkPath}`,
  ]);
  const releases: ReleaseRecord[] = [];
  for (const version of example.versions) {
    const runtime = join(workDirectory, `${example.id}-${version}-runtime`);
    await mkdir(runtime, { recursive: true });
    if (example.runtimeFiles) {
      for (const file of example.runtimeFiles) {
        await cp(join(scaffold, file), join(runtime, file));
      }
      await stampManifest(runtime, example.id, version);
    } else {
      await stampManifest(scaffold, example.id, version);
      await run(
        [process.execPath, 'install', '--ignore-scripts'],
        `${example.id}-install`,
        scaffold
      );
      await run(
        [process.execPath, 'run', 'build'],
        `${example.id}-${version}-build`,
        scaffold
      );
      await cp(join(scaffold, 'dist'), runtime, { recursive: true });
    }
    const archiveDirectory = join(outputRoot, example.id, version);
    await mkdir(archiveDirectory, { recursive: true });
    const archive = join(archiveDirectory, archiveName(example.id, version));
    const built = await buildPluginPackage({
      output: archive,
      privateKey: signingKey,
      source: runtime,
    });
    const url = `${baseUrl}/${example.id}/${version}/${archiveName(example.id, version)}`;
    releases.push({
      ghostboard: HOST_RANGE,
      notes: `Example package built from the create-ghostboard-plugin template (${version}).`,
      sha256: built.sha256,
      url,
      version,
    });
    uploads.push({
      bypassCache: false,
      contentType: 'application/zip',
      key: `${example.id}/${version}/${archiveName(example.id, version)}`,
      path: archive,
    });
    console.log(`built ${example.id}@${version} ${built.sha256}`);
  }
  const document = {
    channel: 'stable',
    pluginId: example.id,
    releases,
    schema: 'ghostboard-plugin-release/v2',
  };
  const descriptorPath = join(outputRoot, example.id, 'releases.json');
  await writeFile(descriptorPath, `${JSON.stringify(document, null, 2)}\n`);
  uploads.push({
    bypassCache: true,
    contentType: 'application/json',
    key: `${example.id}/releases.json`,
    path: descriptorPath,
  });
  index[example.id] = { releases, releasesUrl: releaseUrl(example.id) };
}

const indexPath = join(outputRoot, 'index.json');
await writeFile(
  indexPath,
  `${JSON.stringify(
    {
      baseUrl,
      ephemeralKey,
      generatedAt: new Date().toISOString(),
      hostRange: HOST_RANGE,
      packages: index,
      publicKey,
      sdkVersion: (
        JSON.parse(await readFile(join(sdkPath, 'package.json'), 'utf8')) as {
          version: string;
        }
      ).version,
    },
    null,
    2
  )}\n`
);
uploads.push({
  bypassCache: true,
  contentType: 'application/json',
  key: 'index.json',
  path: indexPath,
});

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        baseUrl,
        ephemeralKey,
        outputRoot,
        result: 'dry run; nothing uploaded',
        uploads: uploads.map((item) => item.key),
      },
      null,
      2
    )
  );
  process.exit(0);
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

const accountId = requireEnv('R2_ACCOUNT_ID');
const client = new S3Client({
  accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
  bucket: requireEnv('R2_BUCKET'),
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
});
const keyPrefix = process.env.R2_EXAMPLES_KEY_PREFIX ?? 'plugins/examples/';
for (const item of uploads) {
  const key = `${keyPrefix}${item.key}`;
  process.stdout.write(`  → ${key} (${item.contentType}) ... `);
  await client.file(key).write(Bun.file(item.path), { type: item.contentType });
  console.log('done');
}
console.log(
  `Uploaded ${uploads.length} object(s). Reminder: the Cloudflare Cache Rule must bypass or use a short TTL for ${keyPrefix}*/releases.json and ${keyPrefix}index.json so update checks see new versions.`
);
