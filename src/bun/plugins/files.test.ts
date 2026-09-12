import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import type { PluginFileContext } from '../../shared/plugins/files';
import { PLUGIN_TEXT_FILE_MAX_BYTES } from '../../shared/plugins/files';
import {
  PluginFileError,
  PluginFileStore,
  pluginPickerFileTypes,
} from './files';

const roots: string[] = [];
const context: PluginFileContext = {
  activationId: '11111111-1111-4111-8111-111111111111',
  pluginId: 'example.csv-importer',
  workspaceId: 'workspace-a',
};

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true }))
  );
});

async function fixture(name: string, bytes: string | Uint8Array) {
  const root = await mkdtemp(join(tmpdir(), 'plugin-files-'));
  roots.push(root);
  const path = join(root, name);
  await writeFile(path, bytes);
  return path;
}

describe('PluginFileStore', () => {
  it('returns opaque metadata and reads strict UTF-8 for the owning context', async () => {
    const path = await fixture('notes.csv', 'title,text\nOne,Body\n');
    const store = new PluginFileStore(context.workspaceId);
    const [handle] = await store.registerSelection(context, [path]);

    expect(handle).toMatchObject({
      name: 'notes.csv',
      size: Buffer.byteLength('title,text\nOne,Body\n'),
    });
    expect(JSON.stringify(handle)).not.toContain(path);
    await expect(store.readText(context, handle!.id)).resolves.toBe(
      'title,text\nOne,Body\n'
    );
  });

  it('rejects cross-plugin, cross-activation and cross-workspace handles', async () => {
    const path = await fixture('notes.csv', 'title\nOne\n');
    const store = new PluginFileStore(context.workspaceId);
    const [handle] = await store.registerSelection(context, [path]);

    for (const changed of [
      { ...context, pluginId: 'example.other' },
      {
        ...context,
        activationId: '22222222-2222-4222-8222-222222222222',
      },
      { ...context, workspaceId: 'workspace-b' },
    ]) {
      await expect(store.readText(changed, handle!.id)).rejects.toBeInstanceOf(
        PluginFileError
      );
    }
  });

  it('releases only handles owned by the matching activation', async () => {
    const path = await fixture('notes.csv', 'title\nOne\n');
    const store = new PluginFileStore(context.workspaceId);
    const [handle] = await store.registerSelection(context, [path]);

    store.release({ ...context, pluginId: 'example.other' }, [handle!.id]);
    await expect(store.readText(context, handle!.id)).resolves.toContain('One');
    store.release(context, [handle!.id]);
    await expect(store.readText(context, handle!.id)).rejects.toMatchObject({
      code: 'invalid-handle',
    });
  });

  it('checks the current byte size and rejects invalid UTF-8', async () => {
    const oversized = await fixture('large.csv', 'small');
    const invalid = await fixture('invalid.csv', new Uint8Array([0xc3, 0x28]));
    const store = new PluginFileStore(context.workspaceId);
    const [largeHandle] = await store.registerSelection(context, [oversized]);
    const [invalidHandle] = await store.registerSelection(context, [invalid]);
    await writeFile(oversized, new Uint8Array(PLUGIN_TEXT_FILE_MAX_BYTES + 1));

    await expect(
      store.readText(context, largeHandle!.id)
    ).rejects.toMatchObject({ code: 'resource-limit' });
    await expect(
      store.readText(context, invalidHandle!.id)
    ).rejects.toMatchObject({ code: 'invalid-encoding' });
  });
});

describe('pluginPickerFileTypes', () => {
  it('converts validated public extensions to Electrobun picker syntax', () => {
    expect(pluginPickerFileTypes(['.csv', '.tsv'])).toBe('csv,tsv');
  });

  it.each([
    [[]],
    [['csv']],
    [['.CSV']],
    [['.*']],
    [['.csv', '.csv']],
  ])('rejects unsafe or ambiguous filters: %j', (extensions) => {
    expect(() => pluginPickerFileTypes(extensions)).toThrow(PluginFileError);
  });
});
