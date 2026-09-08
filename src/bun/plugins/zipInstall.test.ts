import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createOperationContext,
  createPluginSession,
} from '../../shared/plugins/session';
import { ContentBatchStore } from './contentBatch';
import { loadPluginDirectory } from './loadDirectory';
import { runPluginCommand } from './logicRuntime';
import { requireGhostboardPluginSamplesRoot } from './outOfRepoSamples';
import { createContentBatchProbeHost } from './probeHost';
import { loadPluginFromZip } from './zipInstall';

function writeU16(target: number[], value: number): void {
  target.push(value % 256, Math.floor(value / 256) % 256);
}

function writeU32(target: number[], value: number): void {
  writeU16(target, value % 65_536);
  writeU16(target, Math.floor(value / 65_536) % 65_536);
}

function createStoredZip(
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

const SAMPLES_ROOT = requireGhostboardPluginSamplesRoot();
const TITLE_TOOLS_DIR = join(SAMPLES_ROOT, 'title-tools');

async function titleToolsFiles(): Promise<Record<string, string>> {
  return {
    'ghostboard.plugin.json': await readFile(
      join(TITLE_TOOLS_DIR, 'ghostboard.plugin.json'),
      'utf8'
    ),
    'main.js': await readFile(join(TITLE_TOOLS_DIR, 'main.js'), 'utf8'),
  };
}

describe('plugin zip unpack', () => {
  it('loads a root-level title-tools zip and runs normalize-titles', async () => {
    const dest = await mkdtemp(join(tmpdir(), 'plugin-zip-root-'));
    const loaded = await loadPluginFromZip(
      createStoredZip(await titleToolsFiles()),
      dest
    );
    expect(loaded.manifest.id).toBe('community.example.title-tools');
    const store = new ContentBatchStore();
    store.seed([
      { entityId: 'note_a', title: '  Hello   world ', revision: 3 },
    ]);
    const session = createPluginSession({
      manifest: loaded.manifest,
      workspaceId: 'ws_zip',
      context: createOperationContext(),
      grantedPermissions: ['content.selection.read', 'content.selection.write'],
    });
    const operationId =
      session.context.kind === 'operation' ? session.context.operationId : '';
    await store.freezeSelection({ operationId, entityIds: ['note_a'] });
    const result = await runPluginCommand({
      session,
      commandId: 'normalize-titles',
      source: loaded.sources['main.js'] ?? '',
      probe: createContentBatchProbeHost(store, operationId, 'ws_zip'),
    });
    expect(result.preview?.[0]?.title).toBe('Hello world');
    expect((await store.get('note_a'))?.title).toBe('Hello world');
  });

  it('accepts a single wrapping folder', async () => {
    const files = await titleToolsFiles();
    const dest = await mkdtemp(join(tmpdir(), 'plugin-zip-wrap-'));
    const loaded = await loadPluginFromZip(
      createStoredZip({
        'title-tools/ghostboard.plugin.json': files['ghostboard.plugin.json']!,
        'title-tools/main.js': files['main.js']!,
      }),
      dest
    );
    expect(loaded.directory.endsWith('title-tools')).toBe(true);
    expect(loaded.manifest.id).toBe('community.example.title-tools');
    const fromDir = await loadPluginDirectory(TITLE_TOOLS_DIR);
    expect(loaded.sources['main.js']).toBe(fromDir.sources['main.js']);
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
    const files = await titleToolsFiles();
    const dest = await mkdtemp(join(tmpdir(), 'plugin-zip-dup-'));
    await expect(
      loadPluginFromZip(
        createStoredZip({
          'ghostboard.plugin.json': files['ghostboard.plugin.json']!,
          'other/ghostboard.plugin.json': files['ghostboard.plugin.json']!,
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
        createStoredZip({ 'ghostboard.plugin.json': '{}' }, { flags: 1 }),
        dest
      )
    ).rejects.toMatchObject({ code: 'encrypted' });
  });
});
