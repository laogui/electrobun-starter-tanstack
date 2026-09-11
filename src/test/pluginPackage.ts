import { deflateRawSync } from 'node:zlib';

import { crc32 } from '../bun/plugins/zipInstall';

function writeU16(target: number[], value: number): void {
  target.push(value % 256, Math.floor(value / 256) % 256);
}

function writeU32(target: number[], value: number): void {
  writeU16(target, value % 65_536);
  writeU16(target, Math.floor(value / 65_536) % 65_536);
}

export interface ZipTestEntry {
  /** Overrides the CRC written to both headers, to forge a corrupt archive. */
  crc?: number;
  data: Uint8Array | string;
  deflate?: boolean;
  flags?: number;
  /** Overrides the compressed size written to the local header only. */
  localCompressedSize?: number;
  /** Overrides the compression method written to the local header only. */
  localCompression?: number;
  name: string;
  /** Overrides the uncompressed size written to both headers. */
  uncompressedSize?: number;
}

function toBytes(data: Uint8Array | string): Uint8Array {
  return typeof data === 'string' ? new TextEncoder().encode(data) : data;
}

export function createZip(entries: ZipTestEntry[]): Uint8Array {
  const localParts: number[] = [];
  const centralParts: number[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const raw = toBytes(entry.data);
    const compression = entry.deflate ? 8 : 0;
    const payload = entry.deflate ? Uint8Array.from(deflateRawSync(raw)) : raw;
    const checksum = entry.crc ?? crc32(raw);
    const uncompressedSize = entry.uncompressedSize ?? raw.length;
    const flags = entry.flags ?? 0;
    const localOffset = offset;

    writeU32(localParts, 0x04_03_4b_50);
    writeU16(localParts, 20);
    writeU16(localParts, flags);
    writeU16(localParts, entry.localCompression ?? compression);
    writeU16(localParts, 0);
    writeU16(localParts, 0);
    writeU32(localParts, checksum);
    writeU32(localParts, entry.localCompressedSize ?? payload.length);
    writeU32(localParts, uncompressedSize);
    writeU16(localParts, nameBytes.length);
    writeU16(localParts, 0);
    localParts.push(...nameBytes, ...payload);
    offset += 30 + nameBytes.length + payload.length;

    writeU32(centralParts, 0x02_01_4b_50);
    writeU16(centralParts, 20);
    writeU16(centralParts, 20);
    writeU16(centralParts, flags);
    writeU16(centralParts, compression);
    writeU16(centralParts, 0);
    writeU16(centralParts, 0);
    writeU32(centralParts, checksum);
    writeU32(centralParts, payload.length);
    writeU32(centralParts, uncompressedSize);
    writeU16(centralParts, nameBytes.length);
    writeU16(centralParts, 0);
    writeU16(centralParts, 0);
    writeU16(centralParts, 0);
    writeU16(centralParts, 0);
    writeU32(centralParts, 0);
    writeU32(centralParts, localOffset);
    centralParts.push(...nameBytes);
  }
  const eocd: number[] = [];
  writeU32(eocd, 0x06_05_4b_50);
  writeU16(eocd, 0);
  writeU16(eocd, 0);
  writeU16(eocd, entries.length);
  writeU16(eocd, entries.length);
  writeU32(eocd, centralParts.length);
  writeU32(eocd, localParts.length);
  writeU16(eocd, 0);
  return Uint8Array.from([...localParts, ...centralParts, ...eocd]);
}

export function createStoredZip(
  files: Record<string, string>,
  options?: { flags?: number }
): Uint8Array {
  return createZip(
    Object.entries(files).map(([name, data]) => ({
      name,
      data,
      flags: options?.flags,
    }))
  );
}

export function pluginFiles(): Record<string, string> {
  return {
    'manifest.json': JSON.stringify({
      manifestVersion: 2,
      id: 'community.example.app',
      name: 'Example app',
      version: '1.0.0',
      engines: { ghostboard: '>=1.0.0 <2.0.0' },
      entrypoints: { app: 'main.js' },
      capabilities: ['files'],
    }),
    'main.js': 'throw new Error("package inspection must not execute code");',
  };
}
