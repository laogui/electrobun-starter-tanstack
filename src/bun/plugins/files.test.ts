import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
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

function fileUrl(path: 'read' | 'write', params: Record<string, string>) {
  const url = new URL(`http://localhost/plugins/files/${path}`);
  for (const [key, value] of Object.entries({ ...context, ...params })) {
    url.searchParams.set(key, value);
  }
  return url;
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

  it('lists sorted directory pages without following symbolic links', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-directory-'));
    roots.push(root);
    await mkdir(join(root, 'nested'));
    await writeFile(join(root, 'a.txt'), 'A');
    await writeFile(join(root, 'b.bin'), Uint8Array.from([1, 2]));
    await symlink(join(root, 'a.txt'), join(root, 'linked'));
    const store = new PluginFileStore(context.workspaceId);
    const [directory] = await store.registerSelection(
      context,
      [root],
      'directory'
    );
    expect(directory?.kind).toBe('directory');

    const first = await store.listDirectory({
      ...context,
      handleId: directory!.id,
      limit: 2,
    });
    expect(first.entries.map(({ kind, name }) => ({ kind, name }))).toEqual([
      { kind: 'file', name: 'a.txt' },
      { kind: 'file', name: 'b.bin' },
    ]);
    expect(first.nextCursor).toBe('2');
    const second = await store.listDirectory({
      ...context,
      cursor: first.nextCursor!,
      handleId: directory!.id,
      limit: 2,
    });
    expect(
      second.entries.map(({ handle, kind, name }) => ({
        hasHandle: Boolean(handle),
        kind,
        name,
      }))
    ).toEqual([
      { hasHandle: false, kind: 'symlink', name: 'linked' },
      { hasHandle: true, kind: 'directory', name: 'nested' },
    ]);
  });

  it('rejects file and directory handles replaced by symbolic links', async () => {
    const selectedFile = await fixture('selected.txt', 'inside');
    const outsideFile = await fixture('outside.txt', 'outside');
    const selectedDirectory = await mkdtemp(join(tmpdir(), 'plugin-selected-'));
    const outsideDirectory = await mkdtemp(join(tmpdir(), 'plugin-outside-'));
    roots.push(selectedDirectory, outsideDirectory);
    const store = new PluginFileStore(context.workspaceId);
    const [fileHandle] = await store.registerSelection(context, [selectedFile]);
    const [directoryHandle] = await store.registerSelection(
      context,
      [selectedDirectory],
      'directory'
    );

    await rm(selectedFile);
    await symlink(outsideFile, selectedFile);
    await rm(selectedDirectory, { recursive: true });
    await symlink(outsideDirectory, selectedDirectory, 'dir');

    await expect(store.readText(context, fileHandle!.id)).rejects.toMatchObject(
      { code: 'not-file' }
    );
    await expect(
      store.listDirectory({
        ...context,
        handleId: directoryHandle!.id,
      })
    ).rejects.toMatchObject({ code: 'not-directory' });
    expect(
      (
        await store.handle(
          new Request(fileUrl('read', { handleId: fileHandle!.id }), {
            headers: { Range: 'bytes=0-1' },
          }),
          {}
        )
      )?.status
    ).toBe(400);
  });

  it('serves only bounded ranges for file handles', async () => {
    const path = await fixture('bytes.bin', Uint8Array.from([0, 1, 2, 3, 4]));
    const store = new PluginFileStore(context.workspaceId);
    const [handle] = await store.registerSelection(context, [path]);
    const response = await store.handle(
      new Request(fileUrl('read', { handleId: handle!.id }), {
        headers: { Range: 'bytes=1-3' },
      }),
      {}
    );
    expect(response?.status).toBe(206);
    expect(new Uint8Array(await response!.arrayBuffer())).toEqual(
      Uint8Array.from([1, 2, 3])
    );
    expect(
      (
        await store.handle(
          new Request(fileUrl('read', { handleId: handle!.id })),
          {}
        )
      )?.status
    ).toBe(400);
  });

  it('writes sequential chunks atomically below a selected directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-output-'));
    roots.push(root);
    const store = new PluginFileStore(context.workspaceId);
    const [directory] = await store.registerSelection(
      context,
      [root],
      'directory'
    );
    const begin = await store.handle(
      new Request(fileUrl('write', { action: 'begin' }), {
        body: JSON.stringify({
          directoryHandleId: directory!.id,
          relativePath: 'exports/result.bin',
        }),
        method: 'POST',
      }),
      {}
    );
    const { uploadId } = (await begin!.json()) as { uploadId: string };
    for (const [offset, bytes] of [
      [0, Uint8Array.from([1, 2])],
      [2, Uint8Array.from([3, 4])],
    ] as const) {
      const response = await store.handle(
        new Request(
          fileUrl('write', {
            action: 'chunk',
            offset: String(offset),
            uploadId,
          }),
          { body: bytes, method: 'POST' }
        ),
        {}
      );
      expect(response?.status).toBe(200);
    }
    const commit = await store.handle(
      new Request(fileUrl('write', { action: 'commit', uploadId }), {
        method: 'POST',
      }),
      {}
    );
    expect(commit?.status).toBe(200);
    expect(await readFile(join(root, 'exports/result.bin'))).toEqual(
      Buffer.from([1, 2, 3, 4])
    );
    expect((await readdir(join(root, 'exports'))).sort()).toEqual([
      'result.bin',
    ]);
  });

  it('cancels temporary writes and rejects path traversal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-output-'));
    roots.push(root);
    const store = new PluginFileStore(context.workspaceId);
    const [directory] = await store.registerSelection(
      context,
      [root],
      'directory'
    );
    const invalid = await store.handle(
      new Request(fileUrl('write', { action: 'begin' }), {
        body: JSON.stringify({
          directoryHandleId: directory!.id,
          relativePath: '../outside.txt',
        }),
        method: 'POST',
      }),
      {}
    );
    expect(invalid?.status).toBe(400);
    const begin = await store.handle(
      new Request(fileUrl('write', { action: 'begin' }), {
        body: JSON.stringify({
          directoryHandleId: directory!.id,
          relativePath: 'cancelled.txt',
        }),
        method: 'POST',
      }),
      {}
    );
    const { uploadId } = (await begin!.json()) as { uploadId: string };
    const cancelled = await store.handle(
      new Request(fileUrl('write', { action: 'cancel', uploadId }), {
        method: 'DELETE',
      }),
      {}
    );
    expect(cancelled?.status).toBe(200);
    expect(await readdir(root)).toEqual([]);
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
