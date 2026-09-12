// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  Disposer,
  ImporterParseResult,
  PluginContext,
} from '../../../../packages/plugin-sdk';
import type {
  PluginFileHandleData,
  PluginFilePickResult,
  PluginFileReadResult,
} from '../../../shared/plugins/files';
import type { PluginRuntimeSnapshot } from '../../../shared/plugins/runtime';
import type { PluginFilesTransport } from './files';
import { validateImporterParseResult } from './importers';
import { PluginRuntime } from './PluginRuntime';

const handle: PluginFileHandleData = {
  id: '33333333-3333-4333-8333-333333333333',
  kind: 'file',
  lastModified: 123,
  mimeType: 'text/csv',
  name: 'notes.csv',
  size: 48,
};
const IMPORT_OPERATION_ID_RE = /^plgimport_[a-f0-9]{32}$/;
const endpoint = {
  aiEnabled: false,
  baseUrl: 'http://127.0.0.1:1234',
  token: 'secret',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function snapshot(
  generation = 'one',
  workspaceId = 'workspace-a'
): PluginRuntimeSnapshot {
  return {
    diagnostics: [],
    plugins: [
      {
        development: true,
        entryUrl: `http://localhost/plugins/example.csv/${generation}/app.js`,
        generation,
        name: 'CSV importer',
        pluginId: 'example.csv',
        version: '1.0.0',
      },
    ],
    workspaceId,
  };
}

const runtimes: PluginRuntime[] = [];

function setupRuntime(
  parse: (
    file: PluginFileHandleData,
    options: { signal?: AbortSignal }
  ) => Promise<ImporterParseResult>
) {
  const contentFetch = vi.fn<typeof fetch>();
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
        text: '',
      })
    ),
    release: vi.fn(async () => ({ success: true })),
  };
  let disposeImporter!: Disposer;
  const runtime = new PluginRuntime({
    contentTransport: {
      fetch: contentFetch,
      getEndpoint: async () => endpoint,
    },
    filesTransport: transport,
    importer: async () => ({
      default: {
        setup(app: PluginContext) {
          disposeImporter = app.importers.register({
            accept: [{ description: 'CSV files', extensions: ['.csv'] }],
            id: 'notes-csv',
            parse,
            title: 'Import notes',
          });
        },
      },
    }),
  });
  runtimes.push(runtime);
  return {
    contentFetch,
    disposeImporter: () => disposeImporter(),
    runtime,
    transport,
  };
}

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
});

describe('host-owned importer sessions', () => {
  it('selects, parses and exposes a validated preview without writing', async () => {
    const gate = deferred<ImporterParseResult>();
    const parse = vi.fn(() => gate.promise);
    const { contentFetch, runtime, transport } = setupRuntime(parse);
    const statuses: Array<string | null> = [];
    runtime.subscribe(() =>
      statuses.push(runtime.getSnapshot().importSession?.status ?? null)
    );
    await runtime.sync(snapshot());

    const starting = runtime.startImporterSession('example.csv', 'notes-csv');
    await vi.waitFor(() => expect(parse).toHaveBeenCalledOnce());
    const parsing = runtime.getSnapshot().importSession;

    expect(parsing).toMatchObject({
      canCancel: true,
      canConfirm: false,
      file: handle,
      status: 'parsing',
      workspaceId: 'workspace-a',
    });
    expect(parsing?.operationId).toMatch(IMPORT_OPERATION_ID_RE);
    expect(transport.pick).toHaveBeenCalledWith(
      expect.objectContaining({
        activationId: expect.any(String),
        extensions: ['.csv'],
        pluginId: 'example.csv',
        workspaceId: 'workspace-a',
      })
    );
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({ id: handle.id, name: 'notes.csv' }),
      { signal: expect.any(AbortSignal) }
    );
    gate.resolve({
      notes: [{ title: 'One', text: 'Line 1\r\nLine 2' }],
      warnings: ['Skipped one empty row'],
    });
    await starting;

    expect(runtime.getSnapshot().importSession).toMatchObject({
      canCancel: true,
      canConfirm: true,
      error: null,
      notes: [{ color: '', text: 'Line 1\nLine 2', title: 'One' }],
      operationId: parsing?.operationId,
      status: 'preview',
      warnings: ['Skipped one empty row'],
    });
    expect(statuses).toEqual(
      expect.arrayContaining(['selecting', 'parsing', 'preview'])
    );
    expect(contentFetch).not.toHaveBeenCalled();
  });

  it('commits the preview once with its stable operation identity', async () => {
    const { contentFetch, runtime } = setupRuntime(async () => ({
      notes: [
        { color: 'blue', text: 'First body', title: 'First' },
        { title: 'Second' },
      ],
      warnings: ['One warning'],
    }));
    const response = deferred<Response>();
    contentFetch.mockReturnValueOnce(response.promise);
    await runtime.sync(snapshot());
    await runtime.startImporterSession('example.csv', 'notes-csv');
    const preview = runtime.getSnapshot().importSession!;

    const confirming = runtime.confirmImporterSession(preview.operationId);

    expect(runtime.getSnapshot().importSession).toMatchObject({
      canCancel: false,
      canConfirm: false,
      notes: preview.notes,
      operationId: preview.operationId,
      status: 'committing',
    });
    runtime.cancelImporterSession(preview.operationId);
    expect(runtime.getSnapshot().importSession?.status).toBe('committing');
    await expect(
      runtime.startImporterSession('example.csv', 'notes-csv')
    ).rejects.toThrow('Import confirmation is in progress');
    const body = JSON.parse(
      contentFetch.mock.calls[0]![1]!.body as string
    ) as Record<string, unknown>;
    expect(body).toMatchObject({
      action: 'create',
      label: 'Import 2 notes with Import notes',
      notes: [
        { color: 'blue', text: 'First body', title: 'First' },
        { color: '', text: '', title: 'Second' },
      ],
      operationId: preview.operationId,
      pluginId: 'example.csv',
      workspaceId: 'workspace-a',
    });
    response.resolve(
      Response.json({
        changed: true,
        items: [
          { color: 'blue', id: 'note-1', revision: 1, title: 'First' },
          { color: '', id: 'note-2', revision: 1, title: 'Second' },
        ],
        operationId: preview.operationId,
      })
    );
    await confirming;

    expect(runtime.getSnapshot().importSession).toBeNull();
  });

  it('keeps the preview and operation identity for a failed commit retry', async () => {
    const { contentFetch, runtime } = setupRuntime(async () => ({
      notes: [{ text: 'Body', title: 'Retry me' }],
      warnings: ['Retained warning'],
    }));
    await runtime.sync(snapshot());
    await runtime.startImporterSession('example.csv', 'notes-csv');
    const preview = runtime.getSnapshot().importSession!;
    contentFetch
      .mockResolvedValueOnce(
        Response.json(
          { code: 'transport-error', error: 'Response was uncertain' },
          { status: 503 }
        )
      )
      .mockImplementationOnce(async (_url, options) => {
        const body = JSON.parse(options!.body as string) as {
          operationId: string;
        };
        return Response.json({
          changed: true,
          items: [{ color: '', id: 'note-1', revision: 1, title: 'Retry me' }],
          operationId: body.operationId,
        });
      });

    await runtime.confirmImporterSession(preview.operationId);

    expect(runtime.getSnapshot().importSession).toMatchObject({
      canCancel: true,
      canConfirm: true,
      error: expect.stringContaining('Response was uncertain'),
      notes: preview.notes,
      operationId: preview.operationId,
      status: 'failed',
      warnings: preview.warnings,
    });
    expect(runtime.getSnapshot().diagnostics.at(-1)?.phase).toBe(
      'importer-commit'
    );

    await runtime.confirmImporterSession(preview.operationId);

    expect(runtime.getSnapshot().importSession).toBeNull();
    const requests = contentFetch.mock.calls.map((call) =>
      JSON.parse(call[1]!.body as string)
    );
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      notes: preview.notes,
      operationId: preview.operationId,
    });
    expect(requests[1]).toMatchObject({
      notes: preview.notes,
      operationId: preview.operationId,
    });
  });

  it('cancels parsing promptly and ignores a late plugin result', async () => {
    const gate = deferred<ImporterParseResult>();
    let parseSignal: AbortSignal | undefined;
    const { runtime } = setupRuntime(async (_file, options) => {
      parseSignal = options.signal;
      return gate.promise;
    });
    await runtime.sync(snapshot());
    const starting = runtime.startImporterSession('example.csv', 'notes-csv');
    await vi.waitFor(() => expect(parseSignal).toBeDefined());
    const operationId = runtime.getSnapshot().importSession!.operationId;

    runtime.cancelImporterSession(operationId);
    await starting;

    expect(parseSignal?.aborted).toBe(true);
    expect(runtime.getSnapshot().importSession).toBeNull();
    gate.resolve({ notes: [{ title: 'Late' }], warnings: [] });
    await gate.promise;
    await Promise.resolve();
    expect(runtime.getSnapshot().importSession).toBeNull();
    expect(runtime.getSnapshot().diagnostics).toEqual([]);
  });

  it('treats closing the native picker as a silent cancellation', async () => {
    const parse = vi.fn(async () => ({
      notes: [{ title: 'Not reached' }],
      warnings: [],
    }));
    const { contentFetch, runtime, transport } = setupRuntime(parse);
    vi.mocked(transport.pick).mockResolvedValueOnce({
      cancelled: true,
      success: false,
    });
    await runtime.sync(snapshot());

    await runtime.startImporterSession('example.csv', 'notes-csv');

    expect(parse).not.toHaveBeenCalled();
    expect(contentFetch).not.toHaveBeenCalled();
    expect(runtime.getSnapshot().importSession).toBeNull();
    expect(runtime.getSnapshot().diagnostics).toEqual([]);
  });

  it('rejects invalid preview output before confirmation', async () => {
    const { contentFetch, runtime } = setupRuntime(async () => ({
      notes: [],
      warnings: [],
    }));
    await runtime.sync(snapshot());

    await runtime.startImporterSession('example.csv', 'notes-csv');

    expect(runtime.getSnapshot().importSession).toMatchObject({
      canConfirm: false,
      notes: [],
      status: 'failed',
      warnings: [],
    });
    expect(runtime.getSnapshot().importSession?.error).toContain('1–100 notes');
    expect(runtime.getSnapshot().diagnostics.at(-1)?.phase).toBe(
      'importer-parse'
    );
    expect(contentFetch).not.toHaveBeenCalled();
  });

  it.each([
    'disable',
    'workspace-switch',
    'reload',
    'dispose-registration',
  ] as const)('aborts and clears a parsing session on %s', async (action) => {
    const gate = deferred<ImporterParseResult>();
    let parseSignal: AbortSignal | undefined;
    const { disposeImporter, runtime } = setupRuntime(
      async (_file, options) => {
        parseSignal = options.signal;
        return gate.promise;
      }
    );
    await runtime.sync(snapshot());
    const starting = runtime.startImporterSession('example.csv', 'notes-csv');
    await vi.waitFor(() => expect(parseSignal).toBeDefined());

    switch (action) {
      case 'disable':
        await runtime.sync({ ...snapshot(), plugins: [] });
        break;
      case 'workspace-switch':
        await runtime.sync(snapshot('two', 'workspace-b'));
        break;
      case 'reload':
        await runtime.sync(snapshot('two'));
        break;
      default:
        await disposeImporter();
    }
    await starting;

    expect(parseSignal?.aborted).toBe(true);
    expect(runtime.getSnapshot().importSession).toBeNull();
    gate.resolve({ notes: [{ title: 'Late' }], warnings: [] });
  });
});

describe('validateImporterParseResult', () => {
  it.each([
    {
      label: 'more than 100 notes',
      value: {
        notes: Array.from({ length: 101 }, (_, index) => ({
          title: `Note ${index}`,
        })),
        warnings: [],
      },
    },
    {
      label: 'a blank title',
      value: { notes: [{ title: '   ' }], warnings: [] },
    },
    {
      label: 'an oversized body',
      value: {
        notes: [{ text: 'a'.repeat(256 * 1024 + 1), title: 'Large' }],
        warnings: [],
      },
    },
    {
      label: 'more than 100 warnings',
      value: {
        notes: [{ title: 'One' }],
        warnings: Array.from({ length: 101 }, () => 'warning'),
      },
    },
  ])('rejects $label', ({ value }) => {
    expect(() => validateImporterParseResult(value)).toThrow();
  });
});
