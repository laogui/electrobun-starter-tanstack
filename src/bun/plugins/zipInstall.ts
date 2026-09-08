import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, posix, resolve, sep } from 'node:path';
import { inflateRawSync } from 'node:zlib';

import {
  type LoadedPluginDirectory,
  loadPluginDirectory,
} from './loadDirectory';

export const PLUGIN_ZIP_MAX_ENTRIES = 256;
export const PLUGIN_ZIP_MAX_UNCOMPRESSED = 8 * 1024 * 1024;
export const PLUGIN_ZIP_MAX_RATIO = 100;

const LOCAL_SIG = 0x04_03_4b_50;
const CENTRAL_SIG = 0x02_01_4b_50;
const EOCD_SIG = 0x06_05_4b_50;
const MANIFEST = 'ghostboard.plugin.json';
const IGNORED_PREFIXES = ['__macosx/', '.ds_store'];
const WIN_ABS_RE = /^[a-zA-Z]:/;

export class PluginZipError extends Error {
  code:
    | 'encrypted'
    | 'invalid-layout'
    | 'invalid-zip'
    | 'path-escape'
    | 'resource-limit';

  constructor(code: PluginZipError['code'], message: string) {
    super(message);
    this.name = 'PluginZipError';
    this.code = code;
  }
}

interface ZipEntry {
  compressed: Uint8Array;
  compression: number;
  name: string;
  uncompressedSize: number;
}

function readU16(bytes: Uint8Array, offset: number): number {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  ).getUint16(offset, true);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  ).getUint32(offset, true);
}

function hasBit(flags: number, bit: number): boolean {
  return Math.floor(flags / 2 ** bit) % 2 === 1;
}

function decodeName(bytes: Uint8Array): string {
  return new TextDecoder('utf8', { fatal: false }).decode(bytes);
}

function findEocd(bytes: Uint8Array): number {
  const min = Math.max(0, bytes.length - 22 - 65_535);
  for (let offset = bytes.length - 22; offset >= min; offset -= 1) {
    if (readU32(bytes, offset) === EOCD_SIG) {
      return offset;
    }
  }
  throw new PluginZipError(
    'invalid-zip',
    'zip end-of-central-directory missing'
  );
}

function isIgnoredName(name: string): boolean {
  const lower = name.toLowerCase();
  return IGNORED_PREFIXES.some(
    (prefix) => lower === prefix || lower.startsWith(prefix)
  );
}

function assertSafeZipPath(name: string): string {
  const normalized = name.replaceAll('\\', '/');
  if (
    normalized.length === 0 ||
    normalized.includes('\0') ||
    posix.isAbsolute(normalized) ||
    WIN_ABS_RE.test(normalized)
  ) {
    throw new PluginZipError(
      'path-escape',
      `zip entry path is not allowed: ${name}`
    );
  }
  const segments = normalized
    .split('/')
    .filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new PluginZipError(
      'path-escape',
      `zip entry path is not allowed: ${name}`
    );
  }
  return segments.join('/');
}

function parseZipEntries(bytes: Uint8Array): ZipEntry[] {
  if (bytes.length < 22) {
    throw new PluginZipError('invalid-zip', 'zip is too small');
  }
  const eocd = findEocd(bytes);
  const disk = readU16(bytes, eocd + 4);
  const cdDisk = readU16(bytes, eocd + 6);
  const entriesOnDisk = readU16(bytes, eocd + 8);
  const totalEntries = readU16(bytes, eocd + 10);
  const cdSize = readU32(bytes, eocd + 12);
  const cdOffset = readU32(bytes, eocd + 16);
  if (disk !== 0 || cdDisk !== 0 || entriesOnDisk !== totalEntries) {
    throw new PluginZipError(
      'invalid-zip',
      'split or zip64 archives are not supported'
    );
  }
  if (totalEntries > PLUGIN_ZIP_MAX_ENTRIES) {
    throw new PluginZipError(
      'resource-limit',
      `zip exceeds ${PLUGIN_ZIP_MAX_ENTRIES} entries`
    );
  }
  if (cdOffset + cdSize > bytes.length) {
    throw new PluginZipError(
      'invalid-zip',
      'zip central directory is truncated'
    );
  }

  const entries: ZipEntry[] = [];
  let cursor = cdOffset;
  const cdEnd = cdOffset + cdSize;
  while (cursor < cdEnd) {
    if (cursor + 46 > bytes.length || readU32(bytes, cursor) !== CENTRAL_SIG) {
      throw new PluginZipError(
        'invalid-zip',
        'zip central directory is corrupt'
      );
    }
    const flags = readU16(bytes, cursor + 8);
    const compression = readU16(bytes, cursor + 10);
    const compressedSize = readU32(bytes, cursor + 20);
    const uncompressedSize = readU32(bytes, cursor + 24);
    const nameLength = readU16(bytes, cursor + 28);
    const extraLength = readU16(bytes, cursor + 30);
    const commentLength = readU16(bytes, cursor + 32);
    const localOffset = readU32(bytes, cursor + 42);
    const nameStart = cursor + 46;
    const nameBytes = bytes.subarray(nameStart, nameStart + nameLength);
    cursor = nameStart + nameLength + extraLength + commentLength;
    const rawName = decodeName(nameBytes);
    if (rawName.endsWith('/') || isIgnoredName(rawName)) {
      continue;
    }
    if (hasBit(flags, 0)) {
      throw new PluginZipError(
        'encrypted',
        `zip entry is encrypted: ${rawName}`
      );
    }
    if (hasBit(flags, 3)) {
      throw new PluginZipError(
        'invalid-zip',
        `zip data descriptors are not supported: ${rawName}`
      );
    }
    if (compression !== 0 && compression !== 8) {
      throw new PluginZipError(
        'invalid-zip',
        `unsupported zip compression: ${rawName}`
      );
    }
    if (
      localOffset + 30 > bytes.length ||
      readU32(bytes, localOffset) !== LOCAL_SIG
    ) {
      throw new PluginZipError(
        'invalid-zip',
        `zip local header missing: ${rawName}`
      );
    }
    const localNameLength = readU16(bytes, localOffset + 26);
    const localExtraLength = readU16(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) {
      throw new PluginZipError(
        'invalid-zip',
        `zip entry data truncated: ${rawName}`
      );
    }
    entries.push({
      name: rawName,
      compression,
      uncompressedSize,
      compressed: bytes.subarray(dataStart, dataEnd),
    });
  }
  return entries;
}

function inflateEntry(entry: ZipEntry): Uint8Array {
  if (entry.uncompressedSize > PLUGIN_ZIP_MAX_UNCOMPRESSED) {
    throw new PluginZipError(
      'resource-limit',
      `zip entry exceeds ${PLUGIN_ZIP_MAX_UNCOMPRESSED} bytes: ${entry.name}`
    );
  }
  if (
    entry.compressed.length > 0 &&
    entry.uncompressedSize / entry.compressed.length > PLUGIN_ZIP_MAX_RATIO
  ) {
    throw new PluginZipError(
      'resource-limit',
      `zip compression ratio exceeds ${PLUGIN_ZIP_MAX_RATIO}: ${entry.name}`
    );
  }
  if (entry.compression === 0) {
    if (entry.compressed.length !== entry.uncompressedSize) {
      throw new PluginZipError(
        'invalid-zip',
        `stored zip size mismatch: ${entry.name}`
      );
    }
    return entry.compressed;
  }
  try {
    const inflated = Uint8Array.from(inflateRawSync(entry.compressed));
    if (inflated.length !== entry.uncompressedSize) {
      throw new PluginZipError(
        'invalid-zip',
        `deflate size mismatch: ${entry.name}`
      );
    }
    return inflated;
  } catch (error) {
    if (error instanceof PluginZipError) {
      throw error;
    }
    throw new PluginZipError(
      'invalid-zip',
      `zip entry could not be inflated: ${entry.name}`
    );
  }
}

async function writeExtractedFile(
  destDir: string,
  relative: string,
  data: Uint8Array
): Promise<void> {
  const target = resolve(destDir, ...relative.split('/'));
  const root = resolve(destDir) + sep;
  if (target !== resolve(destDir) && !target.startsWith(root)) {
    throw new PluginZipError(
      'path-escape',
      `zip extract escaped destination: ${relative}`
    );
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
}

export async function unpackPluginZip(
  zipBytes: Uint8Array,
  destDir: string
): Promise<{ pluginRoot: string }> {
  const entries = parseZipEntries(zipBytes);
  let uncompressedTotal = 0;
  const written: string[] = [];
  for (const entry of entries) {
    const relative = assertSafeZipPath(entry.name);
    uncompressedTotal += entry.uncompressedSize;
    if (uncompressedTotal > PLUGIN_ZIP_MAX_UNCOMPRESSED) {
      throw new PluginZipError(
        'resource-limit',
        `zip uncompressed size exceeds ${PLUGIN_ZIP_MAX_UNCOMPRESSED} bytes`
      );
    }
    const data = inflateEntry(entry);
    await writeExtractedFile(destDir, relative, data);
    written.push(relative);
  }
  return { pluginRoot: resolvePluginRoot(destDir, written) };
}

function resolvePluginRoot(destDir: string, written: string[]): string {
  const manifests = [
    ...new Set(
      written.filter((relative) => {
        const parts = relative.split('/');
        return (
          parts.at(-1) === MANIFEST &&
          (parts.length === 1 || parts.length === 2)
        );
      })
    ),
  ];
  if (manifests.length === 0) {
    throw new PluginZipError(
      'invalid-layout',
      'zip does not contain ghostboard.plugin.json at the root or in one wrapping folder'
    );
  }
  if (manifests.length > 1) {
    throw new PluginZipError(
      'invalid-layout',
      `zip contains multiple plugin manifests: ${manifests.join(', ')}`
    );
  }
  const manifest = manifests[0]!;
  const slash = manifest.lastIndexOf('/');
  if (slash === -1) {
    return resolve(destDir);
  }
  return resolve(destDir, manifest.slice(0, slash));
}

export async function loadPluginFromZip(
  zipBytes: Uint8Array,
  destDir: string
): Promise<LoadedPluginDirectory> {
  const unpacked = await unpackPluginZip(zipBytes, destDir);
  return loadPluginDirectory(unpacked.pluginRoot);
}
