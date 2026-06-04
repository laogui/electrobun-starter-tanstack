import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electrobun/bun', () => ({
  Utils: { paths: { userData: '/mock-user-data' } },
}));

/**
 * Minimal Bun.file shim for the thumbnail helpers. The real Bun.file API
 * exposes `.size`, `.exists()` and `.slice(start, end).arrayBuffer()`. The
 * test fakes those by reading the file synchronously through node:fs so the
 * specs can run under Vitest's Node-backed runtime without dragging in Bun.
 */
function makeBunFile(filePath: string) {
  const exists = () => existsSync(filePath);
  const sizeOf = () => (exists() ? statSync(filePath).size : 0);

  const sliceFile = (start: number, end?: number) => {
    const sliceStart = Math.max(0, Math.floor(start));
    const total = sizeOf();
    const sliceEnd =
      end === undefined ? total : Math.min(total, Math.max(sliceStart, end));
    return {
      arrayBuffer: async () => {
        if (!exists()) {
          return new ArrayBuffer(0);
        }
        const buffer = readFileSync(filePath);
        const sliced = buffer.subarray(sliceStart, sliceEnd);
        const out = new ArrayBuffer(sliced.byteLength);
        new Uint8Array(out).set(sliced);
        return out;
      },
    };
  };

  return {
    arrayBuffer: async () => {
      if (!exists()) {
        return new ArrayBuffer(0);
      }
      const buffer = readFileSync(filePath);
      const out = new ArrayBuffer(buffer.byteLength);
      new Uint8Array(out).set(buffer);
      return out;
    },
    exists: async () => exists(),
    get size() {
      return sizeOf();
    },
    slice: sliceFile,
    text: async () => (exists() ? readFileSync(filePath, 'utf8') : ''),
  };
}

const setBunFile = () => {
  vi.stubGlobal('Bun', {
    file: vi.fn(makeBunFile),
    write: vi.fn(writeFile),
  });
};

const resetBun = () => {
  vi.unstubAllGlobals();
};

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'thumbnail-test-'));
  setBunFile();
});

afterEach(() => {
  resetBun();
  if (workspaceRoot && existsSync(workspaceRoot)) {
    rmSync(workspaceRoot, { force: true, recursive: true });
  }
});

async function importModule() {
  // Import after Bun has been stubbed so module-level usage of Bun (none in
  // this module today) cannot capture an unstubbed global by accident.
  return await import('./thumbnail');
}

// ---------------------------------------------------------------------------
// generateTextExcerpt
// ---------------------------------------------------------------------------

describe('generateTextExcerpt', () => {
  it('returns a normalized excerpt for plain text', async () => {
    const filePath = join(workspaceRoot, 'note.txt');
    await writeFile(
      filePath,
      'Hello   world!\n\n\n  This  is\ta   note.\n  Multiple   spaces.   ',
      'utf8'
    );
    const { generateTextExcerpt } = await importModule();

    const excerpt = await generateTextExcerpt(filePath);

    expect(excerpt).toBe('Hello world! This is a note. Multiple spaces.');
  });

  it('truncates excerpts longer than the cap on a word boundary', async () => {
    const filePath = join(workspaceRoot, 'long.txt');
    const word = 'word';
    const repeated = `${word} `.repeat(200);
    await writeFile(filePath, repeated, 'utf8');
    const { generateTextExcerpt } = await importModule();

    const excerpt = await generateTextExcerpt(filePath);

    expect(excerpt).toBeDefined();
    expect((excerpt ?? '').length).toBeLessThanOrEqual(500);
    expect(excerpt?.endsWith(' ')).toBe(false);
    // The truncation should land on a word boundary, not split a token.
    expect(excerpt?.split(' ').every((tok) => tok === word || tok === '')).toBe(
      true
    );
  });

  it('returns undefined for a non-existent file', async () => {
    const { generateTextExcerpt } = await importModule();
    const excerpt = await generateTextExcerpt(
      join(workspaceRoot, 'missing.txt')
    );
    expect(excerpt).toBeUndefined();
  });

  it('returns undefined for an empty file', async () => {
    const filePath = join(workspaceRoot, 'empty.txt');
    await writeFile(filePath, '', 'utf8');
    const { generateTextExcerpt } = await importModule();

    expect(await generateTextExcerpt(filePath)).toBeUndefined();
  });

  it('returns undefined when the file looks binary', async () => {
    // A buffer densely populated with control bytes. The decoder will fall
    // back to U+FFFD replacement characters which signal "not text".
    const filePath = join(workspaceRoot, 'binary.bin');
    const buffer = new Uint8Array(2048);
    for (let i = 0; i < buffer.length; i += 1) {
      buffer[i] = i % 0x20;
    }
    await writeFile(filePath, buffer);
    const { generateTextExcerpt } = await importModule();

    expect(await generateTextExcerpt(filePath)).toBeUndefined();
  });

  it('reads only the first chunk of large files', async () => {
    // The helper caps reads at 4 KiB; a 200 KiB file should still resolve.
    const filePath = join(workspaceRoot, 'big.txt');
    await writeFile(filePath, 'a'.repeat(200 * 1024), 'utf8');
    const { generateTextExcerpt } = await importModule();

    const excerpt = await generateTextExcerpt(filePath);
    expect(excerpt).toBeDefined();
    expect((excerpt ?? '').length).toBeLessThanOrEqual(500);
  });
});

// ---------------------------------------------------------------------------
// generateArchiveSummary
// ---------------------------------------------------------------------------

function utf8(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Build a minimal ZIP archive with stored (uncompressed) entries. Just enough
 * to exercise the EOCD scan and central directory walk; the contents are
 * irrelevant to the helper because it never decompresses anything.
 */
function buildZip(
  entries: { name: string; content?: Uint8Array }[]
): Uint8Array {
  const localBlobs: Uint8Array[] = [];
  const cdBlobs: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = utf8(entry.name);
    const content = entry.content ?? new Uint8Array();
    const localHeader = new Uint8Array(30 + nameBytes.length + content.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04_03_4b_50, true); // local file header signature
    localView.setUint16(4, 20, true); // version needed
    localView.setUint16(6, 0, true); // flags
    localView.setUint16(8, 0, true); // method: stored
    localView.setUint16(10, 0, true); // mod time
    localView.setUint16(12, 0, true); // mod date
    localView.setUint32(14, 0, true); // crc32 (ignored by helper)
    localView.setUint32(18, content.length, true); // compressed size
    localView.setUint32(22, content.length, true); // uncompressed size
    localView.setUint16(26, nameBytes.length, true); // name length
    localView.setUint16(28, 0, true); // extra length
    localHeader.set(nameBytes, 30);
    if (content.length > 0) {
      localHeader.set(content, 30 + nameBytes.length);
    }
    localBlobs.push(localHeader);

    const cdEntry = new Uint8Array(46 + nameBytes.length);
    const cdView = new DataView(cdEntry.buffer);
    cdView.setUint32(0, 0x02_01_4b_50, true); // central file header signature
    cdView.setUint16(4, 20, true); // version made by
    cdView.setUint16(6, 20, true); // version needed
    cdView.setUint16(8, 0, true); // flags
    cdView.setUint16(10, 0, true); // method
    cdView.setUint16(12, 0, true); // mod time
    cdView.setUint16(14, 0, true); // mod date
    cdView.setUint32(16, 0, true); // crc32
    cdView.setUint32(20, content.length, true); // compressed size
    cdView.setUint32(24, content.length, true); // uncompressed size
    cdView.setUint16(28, nameBytes.length, true); // name length
    cdView.setUint16(30, 0, true); // extra length
    cdView.setUint16(32, 0, true); // comment length
    cdView.setUint16(34, 0, true); // disk number
    cdView.setUint16(36, 0, true); // internal attrs
    cdView.setUint32(38, 0, true); // external attrs
    cdView.setUint32(42, offset, true); // local header offset
    cdEntry.set(nameBytes, 46);
    cdBlobs.push(cdEntry);

    offset += localHeader.length;
  }

  const localTotal = localBlobs.reduce((sum, b) => sum + b.length, 0);
  const cdSize = cdBlobs.reduce((sum, b) => sum + b.length, 0);
  const cdOffset = localTotal;

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06_05_4b_50, true); // EOCD signature
  eocdView.setUint16(4, 0, true); // disk number
  eocdView.setUint16(6, 0, true); // disk with CD
  eocdView.setUint16(8, entries.length, true); // entries on this disk
  eocdView.setUint16(10, entries.length, true); // total entries
  eocdView.setUint32(12, cdSize, true); // CD size
  eocdView.setUint32(16, cdOffset, true); // CD offset
  eocdView.setUint16(20, 0, true); // comment length

  return concat([...localBlobs, ...cdBlobs, eocd]);
}

describe('generateArchiveSummary', () => {
  it('lists the first few files in a zip archive', async () => {
    const filePath = join(workspaceRoot, 'pack.zip');
    const zip = buildZip([
      { name: 'README.md', content: utf8('# hi') },
      { name: 'src/index.ts' },
      { name: 'src/lib.ts' },
      { name: 'docs/intro.md' },
      { name: 'docs/guide.md' },
      { name: 'extra.bin' },
    ]);
    await writeFile(filePath, zip);
    const { generateArchiveSummary } = await importModule();

    const summary = await generateArchiveSummary(filePath);

    expect(summary).toBeDefined();
    expect(summary?.entryCount).toBe(6);
    expect(summary?.topFiles).toEqual([
      'README.md',
      'src/index.ts',
      'src/lib.ts',
      'docs/intro.md',
      'docs/guide.md',
    ]);
  });

  it('skips macOS metadata and directory entries when collecting top files', async () => {
    const filePath = join(workspaceRoot, 'mac.zip');
    const zip = buildZip([
      { name: '__MACOSX/._README.md' },
      { name: 'subdir/' },
      { name: '.DS_Store' },
      { name: 'README.md', content: utf8('# hi') },
    ]);
    await writeFile(filePath, zip);
    const { generateArchiveSummary } = await importModule();

    const summary = await generateArchiveSummary(filePath);

    expect(summary).toBeDefined();
    // Total entry count is unfiltered (4) but the visible list strips noise.
    expect(summary?.entryCount).toBe(4);
    expect(summary?.topFiles).toEqual(['README.md']);
  });

  it('returns undefined for files that are too small to be a zip', async () => {
    const filePath = join(workspaceRoot, 'tiny.zip');
    await writeFile(filePath, utf8('not a zip'));
    const { generateArchiveSummary } = await importModule();

    expect(await generateArchiveSummary(filePath)).toBeUndefined();
  });

  it('returns undefined when the EOCD signature cannot be located', async () => {
    const filePath = join(workspaceRoot, 'garbage.zip');
    await writeFile(filePath, new Uint8Array(2048).fill(0x5a));
    const { generateArchiveSummary } = await importModule();

    expect(await generateArchiveSummary(filePath)).toBeUndefined();
  });

  it('returns undefined for missing files', async () => {
    const { generateArchiveSummary } = await importModule();

    expect(
      await generateArchiveSummary(join(workspaceRoot, 'missing.zip'))
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// generateFileMetadata routing
// ---------------------------------------------------------------------------

describe('generateFileMetadata', () => {
  it('routes text/plain files to the excerpt generator', async () => {
    const filePath = join(workspaceRoot, 'doc.txt');
    await writeFile(filePath, 'A simple note.', 'utf8');
    const { generateFileMetadata } = await importModule();

    const metadata = await generateFileMetadata(filePath, 'text/plain');

    expect(metadata.previewExcerpt).toBe('A simple note.');
    expect(metadata.archiveSummary).toBeUndefined();
  });

  it('routes application/json files to the excerpt generator', async () => {
    const filePath = join(workspaceRoot, 'data.json');
    await writeFile(filePath, '{"hello":"world"}', 'utf8');
    const { generateFileMetadata } = await importModule();

    const metadata = await generateFileMetadata(filePath, 'application/json');

    expect(metadata.previewExcerpt).toContain('hello');
  });

  it('routes zip files to the archive summary generator', async () => {
    const filePath = join(workspaceRoot, 'pack.zip');
    const zip = buildZip([
      { name: 'a.txt', content: utf8('a') },
      { name: 'b.txt', content: utf8('b') },
    ]);
    await writeFile(filePath, zip);
    const { generateFileMetadata } = await importModule();

    const metadata = await generateFileMetadata(filePath, 'application/zip');

    expect(metadata.archiveSummary).toEqual({
      entryCount: 2,
      topFiles: ['a.txt', 'b.txt'],
    });
    expect(metadata.previewExcerpt).toBeUndefined();
  });

  it('also recognizes the legacy x-zip-compressed mime', async () => {
    const filePath = join(workspaceRoot, 'legacy.zip');
    await writeFile(filePath, buildZip([{ name: 'only.txt' }]));
    const { generateFileMetadata } = await importModule();

    const metadata = await generateFileMetadata(
      filePath,
      'application/x-zip-compressed'
    );

    expect(metadata.archiveSummary?.entryCount).toBe(1);
  });

  it('returns an empty object for image / video / audio mimes', async () => {
    const filePath = join(workspaceRoot, 'photo.png');
    await writeFile(filePath, new Uint8Array(8));
    const { generateFileMetadata } = await importModule();

    expect(await generateFileMetadata(filePath, 'image/png')).toEqual({});
    expect(await generateFileMetadata(filePath, 'video/mp4')).toEqual({});
    expect(await generateFileMetadata(filePath, 'audio/mpeg')).toEqual({});
  });

  it('returns an empty object when no path is provided', async () => {
    const { generateFileMetadata } = await importModule();
    expect(await generateFileMetadata('', 'text/plain')).toEqual({});
  });
});
