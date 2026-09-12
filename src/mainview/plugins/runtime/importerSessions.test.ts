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
import {
  validateImporterFieldInspection,
  validateImporterParseResult,
} from './importers';
import type { ImporterPlacementHost } from './importPlacement';
import { PluginRuntime, type PluginRuntimeOptions } from './PluginRuntime';

const handle: PluginFileHandleData = {
  id: '33333333-3333-4333-8333-333333333333',
  kind: 'file',
  lastModified: 123,
  mimeType: 'text/csv',
  name: 'notes.csv',
  size: 48,
};
const IMPORT_OPERATION_ID_RE = /^plgimport_[a-f0-9]{32}$/;
const SEGMENT_OPERATION_ID_RE = /_segment_(\d+)$/;
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

function notes(count: number, prefix: string) {
  return Array.from({ length: count }, (_, index) => ({
    title: `${prefix} ${index + 1}`,
  }));
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
  ) => Promise<ImporterParseResult>,
  options: Pick<PluginRuntimeOptions, 'placementHost'> = {}
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
    ...options,
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
  it('requires explicit host-owned field mapping before parsing', async () => {
    const parse = vi.fn(
      async (
        _file: PluginFileHandleData,
        options: {
          mapping?: {
            color: string | null;
            text: string | null;
            title: string | null;
          };
        }
      ): Promise<ImporterParseResult> => ({
        notes: [{ title: `Mapped ${options.mapping?.title}` }],
        warnings: [],
      })
    );
    const transport: PluginFilesTransport = {
      pick: vi.fn(async () => ({ files: [handle], success: true as const })),
      readText: vi.fn(async () => ({ success: true as const, text: '' })),
      release: vi.fn(async () => ({ success: true })),
    };
    const runtime = new PluginRuntime({
      filesTransport: transport,
      importer: async () => ({
        default: {
          setup(app: PluginContext) {
            app.importers.register({
              accept: [{ description: 'CSV files', extensions: ['.csv'] }],
              id: 'mapped-csv',
              inspectFields: async () => ({
                fields: ['Heading', 'Body', 'Tint'],
                suggestedMapping: { text: 'Body', title: 'Heading' },
              }),
              parse,
              title: 'Mapped CSV',
            });
          },
        },
      }),
    });
    runtimes.push(runtime);
    await runtime.sync(snapshot());

    await runtime.startImporterSession('example.csv', 'mapped-csv');
    const configuring = runtime.getSnapshot().importSession!;
    expect(configuring).toMatchObject({
      canConfirm: false,
      canPrepare: true,
      mapping: { color: null, text: 'Body', title: 'Heading' },
      sourceFields: ['Heading', 'Body', 'Tint'],
      status: 'configuring',
    });
    expect(parse).not.toHaveBeenCalled();

    runtime.updateImporterMapping(configuring.operationId, 'color', 'Tint');
    await runtime.prepareImporterSession(configuring.operationId);

    expect(parse).toHaveBeenCalledWith(handle, {
      mapping: { color: 'Tint', text: 'Body', title: 'Heading' },
      signal: expect.any(AbortSignal),
    });
    expect(runtime.getSnapshot().importSession).toMatchObject({
      notes: [{ title: 'Mapped Heading' }],
      status: 'preview',
    });
  });

  it('retries canvas placement without recreating committed notes', async () => {
    const placementHost: ImporterPlacementHost = {
      getTargets: () => [{ id: 'research', name: 'Research' }],
      place: vi
        .fn()
        .mockRejectedValueOnce(new Error('Target canvas is still loading'))
        .mockResolvedValueOnce({
          nodeIds: ['node-import-1'],
          viewId: 'research',
        }),
    };
    const { contentFetch, runtime, transport } = setupRuntime(
      async () => ({ notes: [{ title: 'Placed note' }], warnings: [] }),
      { placementHost }
    );
    contentFetch.mockImplementation(async (_url, request) => {
      const body = JSON.parse(request!.body as string) as {
        operationId: string;
      };
      return Response.json({
        changed: true,
        items: [{ color: '', id: 'note-1', revision: 1, title: 'Placed note' }],
        operationId: body.operationId,
      });
    });
    await runtime.sync(snapshot());
    await runtime.startImporterSession('example.csv', 'notes-csv');
    const preview = runtime.getSnapshot().importSession!;
    runtime.updateImporterPlacement(preview.operationId, {
      mode: 'canvas',
      strategy: 'vertical',
      viewId: 'research',
    });

    await runtime.confirmImporterSession(preview.operationId);
    expect(runtime.getSnapshot().importSession).toMatchObject({
      canConfirm: true,
      completedNotes: 1,
      status: 'placement-failed',
    });
    expect(contentFetch).toHaveBeenCalledOnce();

    await runtime.confirmImporterSession(preview.operationId);
    expect(contentFetch).toHaveBeenCalledOnce();
    expect(placementHost.place).toHaveBeenCalledTimes(2);
    expect(placementHost.place).toHaveBeenLastCalledWith({
      items: [{ color: '', id: 'note-1', revision: 1, title: 'Placed note' }],
      operationId: preview.operationId,
      strategy: 'vertical',
      viewId: 'research',
    });
    expect(runtime.getSnapshot().importSession).toBeNull();
    await vi.waitFor(() => expect(transport.release).toHaveBeenCalled());
  });

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

  it('commits explicit segments in order and resumes the failed range with the same identity', async () => {
    const { contentFetch, runtime, transport } = setupRuntime(async () => ({
      segments: [{ notes: notes(100, 'First') }, { notes: notes(2, 'Second') }],
      warnings: ['Large import'],
    }));
    contentFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options!.body as string) as {
        notes: Array<{ title: string }>;
        operationId: string;
      };
      const secondAttempts = contentFetch.mock.calls.filter((call) =>
        String(
          (JSON.parse(call[1]!.body as string) as Record<string, unknown>)
            .operationId
        ).endsWith('_segment_2')
      ).length;
      if (body.operationId.endsWith('_segment_2') && secondAttempts === 1) {
        return Response.json(
          { code: 'transport-error', error: 'Uncertain segment response' },
          { status: 503 }
        );
      }
      return Response.json({
        changed: true,
        items: body.notes.map((note, index) => ({
          color: '',
          id: `${body.operationId}-${index}`,
          revision: 1,
          title: note.title,
        })),
        operationId: body.operationId,
      });
    });
    await runtime.sync(snapshot());
    await runtime.startImporterSession('example.csv', 'notes-csv');
    const preview = runtime.getSnapshot().importSession!;

    expect(preview).toMatchObject({
      completedNotes: 0,
      status: 'preview',
      totalNotes: 102,
    });
    expect(preview.segments).toMatchObject([
      { end: 100, start: 1, status: 'pending' },
      { end: 102, start: 101, status: 'pending' },
    ]);

    await runtime.confirmImporterSession(preview.operationId);

    expect(runtime.getSnapshot().importSession).toMatchObject({
      canConfirm: true,
      canRollback: true,
      completedNotes: 100,
      status: 'failed',
      totalNotes: 102,
    });
    expect(runtime.getSnapshot().importSession?.segments).toMatchObject([
      { status: 'completed' },
      { error: expect.stringContaining('Uncertain'), status: 'failed' },
    ]);
    const firstOperationIds = contentFetch.mock.calls.map(
      (call) =>
        (JSON.parse(call[1]!.body as string) as Record<string, unknown>)
          .operationId
    );
    expect(firstOperationIds[0]).toBe(`${preview.operationId}_segment_1`);
    expect(firstOperationIds[1]).toBe(`${preview.operationId}_segment_2`);

    await runtime.confirmImporterSession(preview.operationId);

    expect(runtime.getSnapshot().importSession).toMatchObject({
      canConfirm: false,
      canRollback: true,
      completedNotes: 102,
      status: 'completed',
    });
    expect(
      (
        JSON.parse(contentFetch.mock.calls[2]![1]!.body as string) as Record<
          string,
          unknown
        >
      ).operationId
    ).toBe(`${preview.operationId}_segment_2`);
    await vi.waitFor(() => expect(transport.release).toHaveBeenCalledTimes(1));
  });

  it('rolls back clean ranges in reverse while preserving and retrying a conflict', async () => {
    const { contentFetch, runtime } = setupRuntime(async () => ({
      segments: [{ notes: notes(100, 'First') }, { notes: notes(2, 'Second') }],
      warnings: [],
    }));
    let conflict = true;
    contentFetch.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options!.body as string) as {
        action: string;
        batchId?: string;
        notes?: Array<{ title: string }>;
        operationId: string;
      };
      if (body.action === 'undo') {
        const segment = Number(
          body.batchId?.match(SEGMENT_OPERATION_ID_RE)?.[1]
        );
        if (segment === 2 && conflict) {
          return Response.json(
            { code: 'revision-conflict', error: 'A note was edited' },
            { status: 409 }
          );
        }
        const count = segment === 1 ? 100 : 2;
        return Response.json({
          changed: true,
          items: [],
          operationId: body.operationId,
          removedIds: notes(count, 'removed').map((note) => note.title),
        });
      }
      return Response.json({
        changed: true,
        items: (body.notes ?? []).map((note, index) => ({
          color: '',
          id: `${body.operationId}-${index}`,
          revision: 1,
          title: note.title,
        })),
        operationId: body.operationId,
      });
    });
    await runtime.sync(snapshot());
    await runtime.startImporterSession('example.csv', 'notes-csv');
    const operationId = runtime.getSnapshot().importSession!.operationId;
    await runtime.confirmImporterSession(operationId);

    await runtime.rollbackImporterSession(operationId);

    expect(runtime.getSnapshot().importSession).toMatchObject({
      canRollback: true,
      completedNotes: 2,
      status: 'rollback-conflict',
    });
    expect(runtime.getSnapshot().importSession?.segments).toMatchObject([
      { status: 'rolled-back' },
      { error: expect.stringContaining('edited'), status: 'rollback-conflict' },
    ]);
    const firstRollback = contentFetch.mock.calls
      .map(
        (call) => JSON.parse(call[1]!.body as string) as Record<string, unknown>
      )
      .filter((body) => body.action === 'undo');
    expect(firstRollback.map((body) => body.batchId)).toEqual([
      `${operationId}_segment_2`,
      `${operationId}_segment_1`,
    ]);

    conflict = false;
    await runtime.rollbackImporterSession(operationId);

    expect(runtime.getSnapshot().importSession).toMatchObject({
      canRollback: false,
      completedNotes: 0,
      status: 'rolled-back',
    });
    const rollbackRequests = contentFetch.mock.calls
      .map(
        (call) => JSON.parse(call[1]!.body as string) as Record<string, unknown>
      )
      .filter((body) => body.action === 'undo');
    expect(rollbackRequests.at(-1)).toMatchObject({
      batchId: `${operationId}_segment_2`,
      operationId: `${operationId}_rollback_2`,
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
    const { disposeImporter, runtime, transport } = setupRuntime(
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
    await vi.waitFor(() =>
      expect(transport.release).toHaveBeenCalledWith(
        expect.objectContaining({ handleIds: [handle.id] })
      )
    );
    gate.resolve({ notes: [{ title: 'Late' }], warnings: [] });
  });
});

describe('validateImporterParseResult', () => {
  it('normalizes bounded field inspection and rejects duplicate fields', () => {
    expect(
      validateImporterFieldInspection({
        fields: [' title ', 'Body'],
        suggestedMapping: { text: 'Body' },
      })
    ).toEqual({
      fields: ['title', 'Body'],
      mapping: { color: null, text: 'Body', title: 'title' },
    });
    expect(() =>
      validateImporterFieldInspection({ fields: ['title', 'title'] })
    ).toThrow('duplicate');
  });

  it('accepts explicit bounded segments and reports one-based ranges', () => {
    const result = validateImporterParseResult({
      segments: [{ notes: notes(100, 'First') }, { notes: notes(1, 'Second') }],
      warnings: [],
    });
    expect(result.notes).toHaveLength(101);
    expect(result).toMatchObject({
      segmented: true,
      segments: [
        { end: 100, start: 1 },
        { end: 101, start: 101 },
      ],
    });
  });

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
      label: 'both notes and segments',
      value: {
        notes: [{ title: 'One' }],
        segments: [{ notes: notes(101, 'Segmented') }],
        warnings: [],
      },
    },
    {
      label: 'an empty segment',
      value: {
        segments: [{ notes: notes(101, 'First') }, { notes: [] }],
        warnings: [],
      },
    },
    {
      label: 'a segmented result with at most 100 notes',
      value: {
        segments: [
          { notes: notes(50, 'First') },
          { notes: notes(50, 'Second') },
        ],
        warnings: [],
      },
    },
    {
      label: 'more than 50 segments',
      value: {
        segments: Array.from({ length: 51 }, (_, index) => ({
          notes: notes(100, `Segment ${index}`),
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
