import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createStoredZip,
  createZip,
  pluginFiles,
} from '../../test/pluginPackage';
import {
  crc32,
  loadPluginFromZip,
  PLUGIN_ZIP_MAX_UNCOMPRESSED,
  unpackPluginZip,
} from './zipInstall';

describe('plugin zip unpack', () => {
  it('rejects a valid local record embedded inside another entry payload', async () => {
    const innerZip = createStoredZip({ 'inner.js': 'export default 1' });
    const innerView = new DataView(innerZip.buffer);
    const innerEnd = innerView.getUint32(innerZip.length - 22 + 16, true);
    const zip = createZip([
      { name: 'outer.js', data: innerZip.slice(0, innerEnd) },
      { name: 'inner.js', data: 'export default 1' },
    ]);
    const view = new DataView(zip.buffer);
    const central = view.getUint32(zip.length - 22 + 16, true);
    const secondCentral = central + 46 + view.getUint16(central + 28, true);
    view.setUint32(secondCentral + 42, 30 + 'outer.js'.length, true);
    await expect(
      unpackPluginZip(zip, await mkdtemp(join(tmpdir(), 'plugin-overlap-')))
    ).rejects.toThrow('overlap');
  });
  it('rejects mismatched local filenames and flags', async () => {
    for (const offset of [6, 30]) {
      const zip = createStoredZip(pluginFiles());
      zip[offset] = zip[offset]! + 1;
      await expect(
        unpackPluginZip(zip, await mkdtemp(join(tmpdir(), 'plugin-header-')))
      ).rejects.toMatchObject({ code: 'invalid-zip' });
    }
  });
  it('rejects portable normalized filename aliases before extraction', async () => {
    for (const names of [
      ['main.js', 'MAIN.js'],
      ['é.js', 'e\u0301.js'],
      ['a/b.js', 'a\\b.js'],
    ]) {
      const entries = names.map((name) => ({
        name,
        data: 'export default 1;',
      }));
      await expect(
        unpackPluginZip(
          createZip(entries),
          await mkdtemp(join(tmpdir(), 'plugin-alias-'))
        )
      ).rejects.toMatchObject({ code: 'invalid-zip' });
    }
  });
  it('rejects overlapping local offsets, wrong entry counts and central bounds', async () => {
    const original = createStoredZip(pluginFiles());
    const eocd = original.length - 22;
    const view = new DataView(original.buffer);
    const central = view.getUint32(eocd + 16, true);
    const second = central + 46 + view.getUint16(central + 28, true);
    for (const mutate of [
      (v: DataView) => v.setUint32(second + 42, 0, true),
      (v: DataView) => {
        v.setUint16(eocd + 8, 1, true);
        v.setUint16(eocd + 10, 1, true);
      },
      (v: DataView) => v.setUint32(eocd + 12, eocd - central - 1, true),
    ]) {
      const zip = original.slice();
      mutate(new DataView(zip.buffer));
      await expect(
        unpackPluginZip(zip, await mkdtemp(join(tmpdir(), 'plugin-layout-')))
      ).rejects.toMatchObject({ code: 'invalid-zip' });
    }
  });
  it('inspects a root-level v2 package without executing its app', async () => {
    const dest = await mkdtemp(join(tmpdir(), 'plugin-zip-root-'));
    const loaded = await loadPluginFromZip(
      createStoredZip(pluginFiles()),
      dest
    );
    expect(loaded.manifest.id).toBe('community.example.app');
    expect(loaded.manifest.entrypoints.app).toBe('main.js');
  });
  it('accepts a single wrapping folder', async () => {
    const files = pluginFiles();
    const dest = await mkdtemp(join(tmpdir(), 'plugin-zip-wrap-'));
    const loaded = await loadPluginFromZip(
      createStoredZip({
        'title-tools/manifest.json': files['manifest.json']!,
        'title-tools/main.js': files['main.js']!,
      }),
      dest
    );
    expect(loaded.directory.endsWith('title-tools')).toBe(true);
    expect(loaded.manifest.id).toBe('community.example.app');
    expect(loaded.sources['main.js']).toBe(files['main.js']);
  });

  it('rejects path traversal', async () => {
    const dest = await mkdtemp(join(tmpdir(), 'plugin-zip-escape-'));
    await expect(
      loadPluginFromZip(
        createStoredZip({ '../evil.js': 'export default 1\n' }),
        dest
      )
    ).rejects.toMatchObject({ code: 'path-escape' });
  });

  it('rejects a zip with no plugin manifest', async () => {
    const dest = await mkdtemp(join(tmpdir(), 'plugin-zip-empty-'));
    await expect(
      loadPluginFromZip(createStoredZip({ 'readme.txt': 'hello' }), dest)
    ).rejects.toMatchObject({ code: 'invalid-layout' });
  });

  it('rejects multiple plugin manifests', async () => {
    const files = pluginFiles();
    const dest = await mkdtemp(join(tmpdir(), 'plugin-zip-dup-'));
    await expect(
      loadPluginFromZip(
        createStoredZip({
          'manifest.json': files['manifest.json']!,
          'other/manifest.json': files['manifest.json']!,
          'main.js': files['main.js']!,
        }),
        dest
      )
    ).rejects.toMatchObject({ code: 'invalid-layout' });
  });

  it('rejects encrypted entries', async () => {
    const dest = await mkdtemp(join(tmpdir(), 'plugin-zip-enc-'));
    await expect(
      loadPluginFromZip(
        createStoredZip({ 'manifest.json': '{}' }, { flags: 1 }),
        dest
      )
    ).rejects.toMatchObject({ code: 'encrypted' });
  });
});

describe('plugin zip resource limits', () => {
  it('computes the standard CRC-32 check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcb_f4_39_26);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it('accepts a deflated entry whose declared size is honest', async () => {
    const files = pluginFiles();
    const dest = await mkdtemp(join(tmpdir(), 'plugin-zip-deflate-'));
    const loaded = await loadPluginFromZip(
      createZip([
        { name: 'manifest.json', data: files['manifest.json']!, deflate: true },
        { name: 'main.js', data: files['main.js']!, deflate: true },
      ]),
      dest
    );
    expect(loaded.manifest.id).toBe('community.example.app');
    expect(loaded.sources['main.js']).toBe(files['main.js']);
  });

  it('stops at the budget when a header under-declares the real output', async () => {
    // Central directory claims 1 KiB; the deflate stream actually expands to
    // more than the whole-archive budget.
    const bomb = new Uint8Array(PLUGIN_ZIP_MAX_UNCOMPRESSED + 4096);
    const dest = await mkdtemp(join(tmpdir(), 'plugin-zip-bomb-'));
    await expect(
      unpackPluginZip(
        createZip([
          {
            name: 'manifest.json',
            data: bomb,
            deflate: true,
            uncompressedSize: 1024,
          },
        ]),
        dest
      )
    ).rejects.toMatchObject({ code: 'resource-limit' });
  });

  it('rejects a deflated entry that inflates past the whole-archive budget', async () => {
    const bomb = new Uint8Array(PLUGIN_ZIP_MAX_UNCOMPRESSED + 4096);
    const dest = await mkdtemp(join(tmpdir(), 'plugin-zip-bomb-honest-'));
    await expect(
      unpackPluginZip(
        createZip([{ name: 'manifest.json', data: bomb, deflate: true }]),
        dest
      )
    ).rejects.toMatchObject({ code: 'resource-limit' });
  });

  it('accumulates the budget across entries using actual output bytes', async () => {
    const half = new Uint8Array(PLUGIN_ZIP_MAX_UNCOMPRESSED / 2 + 1024);
    const dest = await mkdtemp(join(tmpdir(), 'plugin-zip-total-'));
    await expect(
      unpackPluginZip(
        createZip([
          { name: 'a.bin', data: half, deflate: true },
          { name: 'b.bin', data: half, deflate: true },
        ]),
        dest
      )
    ).rejects.toMatchObject({ code: 'resource-limit' });
  });

  it('rejects a checksum mismatch', async () => {
    const files = pluginFiles();
    const dest = await mkdtemp(join(tmpdir(), 'plugin-zip-crc-'));
    await expect(
      unpackPluginZip(
        createZip([
          { name: 'manifest.json', data: files['manifest.json']!, crc: 1 },
        ]),
        dest
      )
    ).rejects.toMatchObject({ code: 'invalid-zip' });
  });

  it('rejects duplicate entry paths', async () => {
    const files = pluginFiles();
    const dest = await mkdtemp(join(tmpdir(), 'plugin-zip-dupe-path-'));
    await expect(
      unpackPluginZip(
        createZip([
          { name: 'nested/manifest.json', data: files['manifest.json']! },
          { name: 'nested//manifest.json', data: 'overwrite' },
        ]),
        dest
      )
    ).rejects.toMatchObject({ code: 'invalid-zip' });
  });

  it('rejects local headers that disagree with the central directory', async () => {
    const files = pluginFiles();
    const dest = await mkdtemp(join(tmpdir(), 'plugin-zip-header-'));
    await expect(
      unpackPluginZip(
        createZip([
          {
            name: 'manifest.json',
            data: files['manifest.json']!,
            localCompression: 8,
          },
        ]),
        dest
      )
    ).rejects.toMatchObject({ code: 'invalid-zip' });
  });
});
