#!/usr/bin/env bun
/**
 * Uploads the contents of the generated `artifacts/` folder to Cloudflare R2.
 *
 * `electrobun build --env=<channel>` regenerates `artifacts/` from scratch
 * containing only the current host platform's files
 * (`{channel}-{os}-{arch}-*`), so we simply upload everything found there.
 *
 * Usage: bun scripts/upload-r2.ts [--env=stable|canary]
 * Credentials are read from the environment (see .env.example).
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { S3Client } from 'bun';

const ARTIFACTS_DIR = join(process.cwd(), 'artifacts');

const CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.dmg': 'application/x-apple-diskimage',
  '.zip': 'application/zip',
  '.zst': 'application/zstd',
  '.gz': 'application/gzip',
  '.exe': 'application/vnd.microsoft.portable-executable',
  '.patch': 'application/octet-stream',
};

function contentTypeFor(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot === -1 ? '' : name.slice(dot).toLowerCase();
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
  return value;
}

function parseEnvFlag(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith('--env='));
  return arg?.slice('--env='.length);
}

async function main(): Promise<void> {
  const channel = parseEnvFlag();

  const accountId = requireEnv('R2_ACCOUNT_ID');
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');
  const bucket = requireEnv('R2_BUCKET');
  const keyPrefix = process.env.R2_KEY_PREFIX ?? '';

  let entries: string[];
  try {
    entries = readdirSync(ARTIFACTS_DIR);
  } catch {
    console.error(
      `No artifacts folder at ${ARTIFACTS_DIR}. Run the build first.`
    );
    process.exit(1);
  }

  const files = entries.filter((name) => {
    const full = join(ARTIFACTS_DIR, name);
    return statSync(full).isFile() && !name.startsWith('.');
  });

  if (files.length === 0) {
    console.error('artifacts/ is empty — nothing to upload.');
    process.exit(1);
  }

  if (channel) {
    const mismatched = files.filter((name) => !name.startsWith(`${channel}-`));
    if (mismatched.length > 0) {
      console.warn(
        `Warning: ${mismatched.length} file(s) do not match --env=${channel}: ${mismatched.join(', ')}`
      );
    }
  }

  const client = new S3Client({
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  });

  console.log(
    `Uploading ${files.length} file(s) to r2://${bucket}/${keyPrefix} ...`
  );

  for (const name of files) {
    const localPath = join(ARTIFACTS_DIR, name);
    const key = `${keyPrefix}${name}`;
    const type = contentTypeFor(name);
    const sizeMb = (statSync(localPath).size / 1_048_576).toFixed(1);

    process.stdout.write(`  → ${key} (${sizeMb} MB, ${type}) ... `);
    await client.file(key).write(Bun.file(localPath), { type });
    console.log('done');
  }

  console.log('Upload complete.');
  console.log(
    'Reminder: configure a Cloudflare Cache Rule so `*-update.json` bypasses ' +
      'the CDN cache (or uses a short TTL); R2 does not set Cache-Control.'
  );
}

main().catch((error) => {
  console.error('Upload failed:', error);
  process.exit(1);
});
