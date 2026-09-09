function writeU16(target: number[], value: number): void {
  target.push(value % 256, Math.floor(value / 256) % 256);
}

function writeU32(target: number[], value: number): void {
  writeU16(target, value % 65_536);
  writeU16(target, Math.floor(value / 65_536) % 65_536);
}

export function createStoredZip(
  files: Record<string, string>,
  options?: { flags?: number }
): Uint8Array {
  const localParts: number[] = [];
  const centralParts: number[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = new TextEncoder().encode(name);
    const data = new TextEncoder().encode(text);
    const checksum = 0;
    const localOffset = offset;
    writeU32(localParts, 0x04_03_4b_50);
    writeU16(localParts, 20);
    writeU16(localParts, options?.flags ?? 0);
    writeU16(localParts, 0);
    writeU16(localParts, 0);
    writeU16(localParts, 0);
    writeU32(localParts, checksum);
    writeU32(localParts, data.length);
    writeU32(localParts, data.length);
    writeU16(localParts, nameBytes.length);
    writeU16(localParts, 0);
    localParts.push(...nameBytes, ...data);
    offset += 30 + nameBytes.length + data.length;

    writeU32(centralParts, 0x02_01_4b_50);
    writeU16(centralParts, 20);
    writeU16(centralParts, 20);
    writeU16(centralParts, options?.flags ?? 0);
    writeU16(centralParts, 0);
    writeU16(centralParts, 0);
    writeU16(centralParts, 0);
    writeU32(centralParts, checksum);
    writeU32(centralParts, data.length);
    writeU32(centralParts, data.length);
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
  writeU16(eocd, Object.keys(files).length);
  writeU16(eocd, Object.keys(files).length);
  writeU32(eocd, centralParts.length);
  writeU32(eocd, localParts.length);
  writeU16(eocd, 0);
  return Uint8Array.from([...localParts, ...centralParts, ...eocd]);
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
