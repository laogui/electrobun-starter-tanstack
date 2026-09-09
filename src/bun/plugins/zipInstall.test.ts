import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createStoredZip, pluginFiles } from '../../test/pluginPackage';
import { loadPluginFromZip } from './zipInstall';

describe('plugin zip unpack', () => {
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
