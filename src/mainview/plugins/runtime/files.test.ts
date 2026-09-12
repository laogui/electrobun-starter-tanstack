import { describe, expect, it, vi } from 'vitest';
import type {
  PluginDirectoryHandleData,
  PluginDirectoryListResult,
  PluginFileHandleData,
  PluginFilePickResult,
  PluginFileReadResult,
} from '../../../shared/plugins/files';
import { createPluginFiles, type PluginFilesTransport } from './files';

const handle: PluginFileHandleData = {
  id: '33333333-3333-4333-8333-333333333333',
  kind: 'file',
  lastModified: 123,
  mimeType: 'text/csv',
  name: 'notes.csv',
  size: 12,
};

const directory: PluginDirectoryHandleData = {
  id: '44444444-4444-4444-8444-444444444444',
  kind: 'directory',
  name: 'Imports',
};

function setup() {
  const controller = new AbortController();
  const transport: PluginFilesTransport = {
    pick: vi.fn(
      async (): Promise<PluginFilePickResult> => ({
        success: true,
        files: [handle],
      })
    ),
    readText: vi.fn(
      async (): Promise<PluginFileReadResult> => ({
        success: true,
        text: 'title\nOne\n',
      })
    ),
    release: vi.fn(async () => ({ success: true })),
    list: vi.fn(
      async (): Promise<PluginDirectoryListResult> => ({
        entries: [{ handle, kind: 'file', name: handle.name }],
        nextCursor: null,
        success: true,
      })
    ),
  };
  const files = createPluginFiles(
    {
      activationId: '11111111-1111-4111-8111-111111111111',
      pluginId: 'example.csv-importer',
      workspaceId: 'workspace-a',
      signal: controller.signal,
    },
    transport
  );
  return { controller, files, transport };
}

describe('createPluginFiles', () => {
  it('normalizes filters, freezes returned handles and reads only issued handles', async () => {
    const { files, transport } = setup();
    const [selected] = await files.pick({
      accept: [
        { description: 'CSV', extensions: ['.CSV'] },
        { description: 'Tables', extensions: ['.csv', '.tsv'] },
      ],
    });

    expect(transport.pick).toHaveBeenCalledWith(
      expect.objectContaining({ extensions: ['.csv', '.tsv'] })
    );
    expect(Object.isFrozen(selected)).toBe(true);
    await expect(files.readText(selected!)).resolves.toBe('title\nOne\n');
    await expect(files.readText({ ...selected! })).rejects.toThrow(
      'does not belong'
    );
  });

  it.each([
    { accept: [{ description: '', extensions: ['.csv'] }] },
    { accept: [{ description: 'CSV', extensions: [] }] },
    { accept: [{ description: 'CSV', extensions: ['csv'] }] },
    { accept: [{ description: 'CSV', extensions: ['.*'] }] },
  ])('rejects invalid filters before opening the picker', async ({
    accept,
  }) => {
    const { files, transport } = setup();
    await expect(files.pick({ accept })).rejects.toThrow();
    expect(transport.pick).not.toHaveBeenCalled();
  });

  it('returns an empty list when the native picker is cancelled', async () => {
    const { files, transport } = setup();
    vi.mocked(transport.pick).mockResolvedValueOnce({
      success: false,
      cancelled: true,
    });
    await expect(
      files.pick({ accept: [{ description: 'CSV', extensions: ['.csv'] }] })
    ).resolves.toEqual([]);
  });

  it('selects a directory, lists frozen child handles and releases them explicitly', async () => {
    const { files, transport } = setup();
    vi.mocked(transport.pick).mockResolvedValueOnce({
      files: [directory],
      success: true,
    });
    const selected = await files.pickDirectory();
    expect(selected).toEqual(directory);
    expect(transport.pick).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'directory', multiple: false })
    );
    const page = await files.list(selected!, { limit: 10 });
    expect(Object.isFrozen(page)).toBe(true);
    expect(Object.isFrozen(page.entries[0]?.handle)).toBe(true);
    const child = page.entries[0]?.handle;
    expect(child?.kind).toBe('file');
    files.release(selected!, child!);
    expect(transport.release).toHaveBeenLastCalledWith(
      expect.objectContaining({ handleIds: [directory.id, handle.id] })
    );
  });

  it('invalidates and releases handles when the activation aborts', async () => {
    const { controller, files, transport } = setup();
    const [selected] = await files.pick({
      accept: [{ description: 'CSV', extensions: ['.csv'] }],
    });
    controller.abort();
    await Promise.resolve();

    await expect(files.readText(selected!)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(transport.release).toHaveBeenCalledWith(
      expect.objectContaining({ handleIds: [handle.id] })
    );
  });

  it('rejects promptly and releases a picker result that arrives after abort', async () => {
    let resolve!: (value: {
      success: true;
      files: PluginFileHandleData[];
    }) => void;
    const pending = new Promise<{
      success: true;
      files: PluginFileHandleData[];
    }>((done) => {
      resolve = done;
    });
    const { files, transport } = setup();
    vi.mocked(transport.pick).mockReturnValueOnce(pending);
    const controller = new AbortController();
    const selecting = files.pick({
      accept: [{ description: 'CSV', extensions: ['.csv'] }],
      signal: controller.signal,
    });
    controller.abort();
    await expect(selecting).rejects.toMatchObject({ name: 'AbortError' });
    resolve({ success: true, files: [handle] });
    await pending;
    await Promise.resolve();
    expect(transport.release).toHaveBeenCalledWith(
      expect.objectContaining({ handleIds: [handle.id] })
    );
  });

  it('rejects a directory picker promptly and releases its late result', async () => {
    let resolve!: (value: {
      success: true;
      files: PluginDirectoryHandleData[];
    }) => void;
    const pending = new Promise<{
      success: true;
      files: PluginDirectoryHandleData[];
    }>((done) => {
      resolve = done;
    });
    const { files, transport } = setup();
    vi.mocked(transport.pick).mockReturnValueOnce(pending);
    const controller = new AbortController();
    const selecting = files.pickDirectory({ signal: controller.signal });
    controller.abort();
    await expect(selecting).rejects.toMatchObject({ name: 'AbortError' });
    resolve({ success: true, files: [directory] });
    await pending;
    await Promise.resolve();
    expect(transport.release).toHaveBeenCalledWith(
      expect.objectContaining({ handleIds: [directory.id] })
    );
  });
});
