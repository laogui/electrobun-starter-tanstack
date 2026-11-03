#!/usr/bin/env bun

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from 'node:crypto';
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import {
  canonicalTreeDigest,
  comparePluginPaths as comparePaths,
} from './canonicalDigest.js';

const MAX_ENTRIES = 256;
const MAX_UNCOMPRESSED_BYTES = 8 * 1024 * 1024;
const OUTPUT_EXTENSION_RE = /\.(ghostboard-plugin|zip)$/i;
const WINDOWS_ABSOLUTE_PATH_RE = /^[A-Za-z]:/;
const PUBLIC_KEY_PREFIX = 'ed25519-spki:';
const SIGNATURE_FILE = 'ghostboard-signature.json';
const SIGNATURE_SCHEMA = 'ghostboard-plugin-signature/v1';
const SIGNATURE_PAYLOAD_SCHEMA = 'ghostboard-plugin-signature-payload/v1';

function usage() {
  return [
    'Usage: ghostboard-plugin <runtime-directory> [options]',
    '',
    'Options:',
    '  --output <file>   Archive path. Defaults to <id>-<version>.ghostboard-plugin.',
    '  --include <path>  Include one file or directory relative to the runtime directory.',
    '                    Repeat this option to package a selected runtime file set.',
    '  --sign <file>     Sign with an Ed25519 PKCS#8 PEM private key.',
    '',
    'Key generation:',
    '  ghostboard-plugin --generate-key <private-key.pem>',
    '  Creates a new private key without overwriting an existing file and prints',
    '  the publicKey value to copy into manifest.json.',
  ].join('\n');
}

function parseArguments(args) {
  let source;
  let output;
  let privateKey;
  let generateKey;
  const includes = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--help' || value === '-h') {
      return { help: true, includes };
    }
    if (
      value === '--output' ||
      value === '--include' ||
      value === '--sign' ||
      value === '--generate-key'
    ) {
      const next = args[index + 1];
      if (!next || next.startsWith('--')) {
        throw new Error(`${value} requires a value`);
      }
      if (value === '--output') {
        if (output) {
          throw new Error('--output may only be provided once');
        }
        output = next;
      } else if (value === '--include') {
        includes.push(next);
      } else if (value === '--sign') {
        if (privateKey) {
          throw new Error('--sign may only be provided once');
        }
        privateKey = next;
      } else {
        if (generateKey) {
          throw new Error('--generate-key may only be provided once');
        }
        generateKey = next;
      }
      index += 1;
      continue;
    }
    if (value?.startsWith('-')) {
      throw new Error(`Unknown option: ${value}`);
    }
    if (source) {
      throw new Error(`Unexpected argument: ${value}`);
    }
    source = value;
  }
  if (generateKey) {
    if (source || output || privateKey || includes.length > 0) {
      throw new Error(
        '--generate-key cannot be combined with packaging options'
      );
    }
    return { generateKey, help: false, includes };
  }
  if (!source) {
    throw new Error(usage());
  }
  return { help: false, includes, output, privateKey, source };
}

function archivePath(root, absolute) {
  const path = relative(root, absolute).split(sep).join('/');
  if (
    !path ||
    path === '..' ||
    path.startsWith('../') ||
    path.startsWith('/') ||
    WINDOWS_ABSOLUTE_PATH_RE.test(path) ||
    path.includes('\\') ||
    path.includes('\0') ||
    isAbsolute(path) ||
    path
      .split('/')
      .some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`Runtime path cannot be packaged safely: ${absolute}`);
  }
  return path;
}

async function collectPath(root, absolute, files) {
  const metadata = await lstat(absolute);
  if (metadata.isSymbolicLink()) {
    throw new Error(
      `Symbolic links are not allowed in plugin packages: ${absolute}`
    );
  }
  if (metadata.isDirectory()) {
    const children = (await readdir(absolute)).sort(comparePaths);
    for (const child of children) {
      if (child === '.git') {
        continue;
      }
      await collectPath(root, resolve(absolute, child), files);
    }
    return;
  }
  if (!metadata.isFile()) {
    throw new Error(`Only regular files can be packaged: ${absolute}`);
  }
  const name = archivePath(root, absolute);
  if (files.has(name)) {
    return;
  }
  files.set(name, new Uint8Array(await readFile(absolute)));
}

async function collectFiles(source, includes) {
  const root = resolve(source);
  const rootMetadata = await lstat(root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new Error(`Runtime directory is not a regular directory: ${root}`);
  }
  const requested = includes.length > 0 ? includes : ['.'];
  const files = new Map();
  for (const item of requested) {
    const absolute = resolve(root, item);
    const local = relative(root, absolute);
    if (isAbsolute(local) || local === '..' || local.startsWith(`..${sep}`)) {
      throw new Error(`Included path escapes the runtime directory: ${item}`);
    }
    await collectPath(root, absolute, files);
  }
  return new Map(
    [...files.entries()].sort(([left], [right]) => comparePaths(left, right))
  );
}

function readManifest(files) {
  const bytes = files.get('manifest.json');
  if (!bytes) {
    throw new Error('Package requires manifest.json at the archive root');
  }
  let manifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('manifest.json is not valid JSON');
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('manifest.json must contain an object');
  }
  if (manifest.manifestVersion !== 2) {
    throw new Error('manifest.json must use manifestVersion 2');
  }
  if (
    typeof manifest.id !== 'string' ||
    !manifest.id ||
    typeof manifest.version !== 'string' ||
    !manifest.version
  ) {
    throw new Error('manifest.json requires id and version');
  }
  const entry = manifest.entrypoints?.app;
  if (typeof entry !== 'string' || !files.has(entry)) {
    throw new Error(`Package is missing its app entry: ${String(entry)}`);
  }
  return manifest;
}

function normalizedUpdateUrl(manifest) {
  if (manifest.update === undefined) {
    return;
  }
  if (
    !manifest.update ||
    typeof manifest.update !== 'object' ||
    Array.isArray(manifest.update) ||
    typeof manifest.update.url !== 'string'
  ) {
    throw new Error('manifest.json update.url must be HTTPS');
  }
  let url;
  try {
    url = new URL(manifest.update.url);
  } catch {
    throw new Error('manifest.json update.url must be HTTPS');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error(
      'manifest.json update.url must be HTTPS without credentials'
    );
  }
  return url.toString();
}

function authorPublicKey(key) {
  const publicKey = key.type === 'public' ? key : createPublicKey(key);
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('Signing key must be Ed25519');
  }
  return `${PUBLIC_KEY_PREFIX}${publicKey
    .export({ format: 'der', type: 'spki' })
    .toString('base64')}`;
}

function signingTreeDigest(files) {
  return canonicalTreeDigest(
    new Map([...files].filter(([name]) => name !== SIGNATURE_FILE))
  );
}

function signaturePayload(manifest, treeSha256) {
  return Buffer.from(
    `${JSON.stringify({
      schema: SIGNATURE_PAYLOAD_SCHEMA,
      pluginId: manifest.id,
      version: manifest.version,
      treeSha256,
      updateUrl: normalizedUpdateUrl(manifest) ?? null,
    })}\n`
  );
}

async function signFiles(files, manifest, privateKeyPath) {
  if (files.has(SIGNATURE_FILE)) {
    throw new Error(`${SIGNATURE_FILE} is reserved and must not be supplied`);
  }
  let privateKey;
  try {
    privateKey = createPrivateKey(await readFile(resolve(privateKeyPath)));
  } catch {
    throw new Error('Cannot read an Ed25519 PKCS#8 PEM signing key');
  }
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('Signing key must be Ed25519');
  }
  const publicKey = authorPublicKey(privateKey);
  if (manifest.publicKey !== publicKey) {
    throw new Error(
      'manifest.json publicKey does not match the selected signing key'
    );
  }
  const treeSha256 = signingTreeDigest(files);
  const signature = sign(
    null,
    signaturePayload(manifest, treeSha256),
    privateKey
  ).toString('base64');
  files.set(
    SIGNATURE_FILE,
    new TextEncoder().encode(
      `${JSON.stringify(
        {
          schema: SIGNATURE_SCHEMA,
          algorithm: 'ed25519',
          treeSha256,
          signature,
        },
        null,
        2
      )}\n`
    )
  );
  return { publicKey, treeSha256 };
}

export async function generateSigningKey(outputPath) {
  const output = resolve(outputPath);
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pem = privateKey.export({ format: 'pem', type: 'pkcs8' });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, pem, { flag: 'wx', mode: 0o600 });
  return { privateKey: output, publicKey: authorPublicKey(publicKey) };
}

function assertLimits(files) {
  if (files.size === 0) {
    throw new Error('Runtime directory contains no package files');
  }
  if (files.size > MAX_ENTRIES) {
    throw new Error(`Plugin package exceeds ${MAX_ENTRIES} files`);
  }
  let total = 0;
  for (const [name, bytes] of files) {
    if (new TextEncoder().encode(name).length > 65_535) {
      throw new Error(`Plugin package path is too long: ${name}`);
    }
    total += bytes.length;
  }
  if (total > MAX_UNCOMPRESSED_BYTES) {
    throw new Error(
      `Plugin package exceeds ${MAX_UNCOMPRESSED_BYTES} uncompressed bytes`
    );
  }
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      // biome-ignore lint/suspicious/noBitwiseOperators: CRC-32 polynomial division.
      value = (value & 1) === 1 ? 0xed_b8_83_20 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value;
  }
  return table;
})();

function crc32(bytes) {
  let checksum = 0xff_ff_ff_ff;
  for (const byte of bytes) {
    // biome-ignore lint/suspicious/noBitwiseOperators: CRC-32 lookup update.
    checksum = CRC32_TABLE[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: CRC-32 final XOR and unsigned coercion.
  return (checksum ^ 0xff_ff_ff_ff) >>> 0;
}

function writeU16(target, value) {
  target.push(value % 256, Math.floor(value / 256) % 256);
}

function writeU32(target, value) {
  writeU16(target, value % 65_536);
  writeU16(target, Math.floor(value / 65_536) % 65_536);
}

function createArchive(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, bytes] of files) {
    const nameBytes = new TextEncoder().encode(name);
    const checksum = crc32(bytes);

    writeU32(local, 0x04_03_4b_50);
    writeU16(local, 20);
    writeU16(local, 0x08_00);
    writeU16(local, 0);
    writeU16(local, 0);
    writeU16(local, 0);
    writeU32(local, checksum);
    writeU32(local, bytes.length);
    writeU32(local, bytes.length);
    writeU16(local, nameBytes.length);
    writeU16(local, 0);
    local.push(...nameBytes, ...bytes);

    writeU32(central, 0x02_01_4b_50);
    writeU16(central, 20);
    writeU16(central, 20);
    writeU16(central, 0x08_00);
    writeU16(central, 0);
    writeU16(central, 0);
    writeU16(central, 0);
    writeU32(central, checksum);
    writeU32(central, bytes.length);
    writeU32(central, bytes.length);
    writeU16(central, nameBytes.length);
    writeU16(central, 0);
    writeU16(central, 0);
    writeU16(central, 0);
    writeU16(central, 0);
    writeU32(central, 0);
    writeU32(central, offset);
    central.push(...nameBytes);
    offset += 30 + nameBytes.length + bytes.length;
  }

  const end = [];
  writeU32(end, 0x06_05_4b_50);
  writeU16(end, 0);
  writeU16(end, 0);
  writeU16(end, files.size);
  writeU16(end, files.size);
  writeU32(end, central.length);
  writeU32(end, local.length);
  writeU16(end, 0);
  return Uint8Array.from([...local, ...central, ...end]);
}

export async function buildPluginPackage(options) {
  if (options.privateKey) {
    const root = resolve(options.source);
    const keyPath = resolve(options.privateKey);
    const keyLocal = relative(root, keyPath);
    if (
      keyLocal === '' ||
      (!isAbsolute(keyLocal) &&
        keyLocal !== '..' &&
        !keyLocal.startsWith(`..${sep}`))
    ) {
      throw new Error(
        'Signing private key must be outside the runtime directory'
      );
    }
  }
  const files = await collectFiles(options.source, options.includes ?? []);
  const manifest = readManifest(files);
  let signature;
  if (options.privateKey) {
    signature = await signFiles(files, manifest, options.privateKey);
  } else {
    if (files.has(SIGNATURE_FILE)) {
      throw new Error(`${SIGNATURE_FILE} is reserved and must not be supplied`);
    }
    if (manifest.publicKey !== undefined) {
      throw new Error('manifest.json publicKey requires --sign');
    }
  }
  const orderedFiles = new Map(
    [...files.entries()].sort(([left], [right]) => comparePaths(left, right))
  );
  assertLimits(orderedFiles);
  const output = resolve(
    options.output ?? `${manifest.id}-${manifest.version}.ghostboard-plugin`
  );
  if (!OUTPUT_EXTENSION_RE.test(output)) {
    throw new Error('Output must end in .ghostboard-plugin or .zip');
  }
  if ((options.includes ?? []).length === 0) {
    const root = resolve(options.source);
    const localOutput = relative(root, output);
    if (
      localOutput === '' ||
      (!isAbsolute(localOutput) &&
        localOutput !== '..' &&
        !localOutput.startsWith(`..${sep}`))
    ) {
      throw new Error(
        'Output cannot be inside the packaged runtime directory unless --include is used'
      );
    }
  }
  const archive = createArchive(orderedFiles);
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, archive);
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
  return {
    archive: output,
    bytes: archive.length,
    entries: [...orderedFiles.keys()],
    pluginId: manifest.id,
    sha256: createHash('sha256').update(archive).digest('hex'),
    signatureStatus: signature ? 'signed' : 'unsigned',
    ...(signature ? { signingTreeSha256: signature.treeSha256 } : {}),
    version: manifest.version,
  };
}

if (import.meta.main) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
    } else if (options.generateKey) {
      console.log(
        JSON.stringify(await generateSigningKey(options.generateKey), null, 2)
      );
    } else {
      console.log(
        JSON.stringify(
          await buildPluginPackage({
            includes: options.includes,
            output: options.output,
            privateKey: options.privateKey,
            source: options.source,
          }),
          null,
          2
        )
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
