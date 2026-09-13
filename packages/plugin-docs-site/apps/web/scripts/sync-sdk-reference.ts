#!/usr/bin/env bun
/**
 * Generates `content/docs/en/reference/sdk.md` from the installed
 * `@ghostboard/sdk` package so the documentation site mirrors the exact
 * single-file reference that ships with the SDK version pinned in
 * `apps/web/package.json`. Run automatically by the `prebuild` script.
 *
 * Usage: bun scripts/sync-sdk-reference.ts [--check]
 *   --check  Exit non-zero if the generated file is missing or stale.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(import.meta.dir, '..');
const output = join(webRoot, 'content', 'docs', 'en', 'reference', 'sdk.md');
const check = process.argv.includes('--check');

// The SDK exports map declares only the `import` condition, so resolve as ESM.
const sdkEntry = fileURLToPath(import.meta.resolve('@ghostboard/sdk'));
const sdkRoot = dirname(sdkEntry);
const sdkPackage = JSON.parse(
  await readFile(join(sdkRoot, 'package.json'), 'utf8')
) as { name: string; version: string };
const reference = await readFile(join(sdkRoot, 'AI_REFERENCE.md'), 'utf8');

const H1_RE = /^# .*\n+/;
const body = reference.replace(H1_RE, '').trimEnd();

const generated = [
  '---',
  'title: "SDK reference"',
  'description: "The complete single-file @ghostboard/sdk reference, generated from the published package."',
  'section: reference',
  'order: 10',
  `sourceVersion: "${sdkPackage.name} ${sdkPackage.version}"`,
  '---',
  '',
  '<!-- GENERATED FILE. Do not edit: run `bun scripts/sync-sdk-reference.ts` in apps/web. -->',
  '',
  `> This page is a verbatim copy of \`AI_REFERENCE.md\` from \`${sdkPackage.name}\` ${sdkPackage.version}. The same text is installed with the package at \`node_modules/@ghostboard/sdk/AI_REFERENCE.md\` and included in [llms-full.txt](/docs/llms-full.txt).`,
  '',
  body,
  '',
].join('\n');

let current: string | null = null;
try {
  current = await readFile(output, 'utf8');
} catch {
  current = null;
}

if (check) {
  if (current !== generated) {
    console.error(
      `${output} is missing or stale for ${sdkPackage.name} ${sdkPackage.version}; run bun scripts/sync-sdk-reference.ts`
    );
    process.exit(1);
  }
  console.log(`SDK reference is current (${sdkPackage.version}).`);
} else if (current === generated) {
  console.log(`SDK reference already current (${sdkPackage.version}).`);
} else {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, generated);
  console.log(`Wrote ${output} from ${sdkPackage.name} ${sdkPackage.version}.`);
}
