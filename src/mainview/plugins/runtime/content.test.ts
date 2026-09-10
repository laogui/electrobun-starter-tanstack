import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerNoteReferences } from '@/lib/noteReferences';
import { createPluginContent } from './content';

const endpoint = {
  aiEnabled: false,
  baseUrl: 'http://127.0.0.1:1234',
  token: 'secret',
};
const context = () => ({
  pluginId: 'example.notes',
  workspaceId: 'fixed-workspace',
  signal: new AbortController().signal,
});
afterEach(() => vi.useRealTimers());

describe('public content transport', () => {
  it('sends creation input and snapshots live references for creation undo', async () => {
    const result = {
      operationId: 'creation',
      changed: true,
      items: [{ id: 'new', title: 'New', color: '', revision: 1 }],
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json(result));
    const content = createPluginContent(context(), {
      getEndpoint: async () => endpoint,
      fetch: fetcher,
    });
    const notes = [{ title: 'New', text: 'Body' }];
    expect(
      await content.createMany(notes, {
        label: 'Create',
        operationId: 'creation',
      })
    ).toEqual(result);
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toMatchObject(
      {
        action: 'create',
        notes,
        operationId: 'creation',
        workspaceId: 'fixed-workspace',
      }
    );
    const unprotect = registerNoteReferences((workspace) =>
      workspace === 'fixed-workspace' ? ['new'] : []
    );
    try {
      await content.undo('creation');
      expect(
        JSON.parse(fetcher.mock.calls[1]![1]!.body as string)
      ).toMatchObject({ action: 'undo', protectedIds: ['new'] });
    } finally {
      unprotect();
    }
  });

  it('reads note sets with ordered null slots and rejects identity or count mismatches', async () => {
    const note = {
      id: 'a',
      kind: 'note',
      source: 'sidecar',
      revision: 1,
      title: 'A',
      color: '',
      text: 'Body',
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ items: [null, note] }))
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(
        Response.json({ items: [{ ...note, id: 'wrong' }] })
      );
    const content = createPluginContent(context(), {
      getEndpoint: async () => endpoint,
      fetch: fetcher,
    });
    expect(await content.getMany(['missing', 'a'])).toEqual([null, note]);
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toMatchObject(
      { action: 'getMany', ids: ['missing', 'a'] }
    );
    await expect(content.getMany(['a'])).rejects.toThrow(
      'Invalid content getMany response'
    );
    await expect(content.getMany(['a'])).rejects.toThrow('identity mismatch');
  });
  it('captures plugin/workspace identities and uses stable operation ids for retries', async () => {
    const result = {
      operationId: 'retry-id',
      changed: true,
      items: [{ id: 'note-a', title: 'New', color: 'red', revision: 2 }],
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(result));
    const content = createPluginContent(context(), {
      getEndpoint: async () => endpoint,
      fetch: fetcher,
    });
    expect(
      await content.updateMany(
        [{ id: 'note-a', expectedRevision: 1, changes: { title: 'New' } }],
        { label: 'Title', operationId: 'retry-id' }
      )
    ).toEqual(result);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe(`${endpoint.baseUrl}/plugins/content`);
    expect(JSON.parse(options!.body as string)).toMatchObject({
      pluginId: 'example.notes',
      workspaceId: 'fixed-workspace',
      operationId: 'retry-id',
      action: 'update',
      label: 'Title',
    });
    expect(options!.headers).toMatchObject({ Authorization: 'Bearer secret' });
  });

  it('reports machine-readable conflicts and the generated operation id after uncertain failure', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: 'Note changed', code: 'revision-conflict' },
          { status: 409 }
        )
      );
    const content = createPluginContent(context(), {
      getEndpoint: async () => endpoint,
      fetch: fetcher,
    });
    const error = (await content
      .undo('original')
      .catch((failure: unknown) => failure)) as {
      code: string;
      operationId: string;
    };
    expect(error.code).toBe('revision-conflict');
    expect(typeof error.operationId).toBe('string');
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toMatchObject(
      { action: 'undo', batchId: 'original', operationId: error.operationId }
    );
  });

  it('reads missing and legacy notes and validates query responses', async () => {
    const note = {
      id: 'legacy',
      kind: 'note',
      source: 'markdown',
      revision: null,
      title: 'Legacy',
      color: '',
      text: '# Retained markdown',
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ item: null }))
      .mockResolvedValueOnce(Response.json({ item: note }))
      .mockResolvedValueOnce(Response.json({ items: [note], nextCursor: null }))
      .mockResolvedValueOnce(
        Response.json({ items: [null], nextCursor: null })
      );
    const content = createPluginContent(context(), {
      getEndpoint: async () => endpoint,
      fetch: fetcher,
    });
    expect(await content.get('absent')).toBeNull();
    expect(await content.get('legacy')).toEqual(note);
    expect(await content.query({ text: 'Legacy' })).toEqual({
      items: [note],
      nextCursor: null,
    });
    await expect(content.query()).rejects.toThrow(
      'Invalid note content response'
    );
  });

  it.each([
    'activation',
    'caller',
  ])('cancels on %s abort and does not send a late write', async (kind) => {
    const activation = new AbortController();
    const caller = new AbortController();
    let resolve!: (value: typeof endpoint) => void;
    const fetcher = vi.fn<typeof fetch>();
    const content = createPluginContent(
      { ...context(), signal: activation.signal },
      {
        getEndpoint: () =>
          new Promise((done) => {
            resolve = done;
          }),
        fetch: fetcher,
      }
    );
    const pending = content.redo('batch', {
      signal: caller.signal,
      operationId: 'redo-id',
    });
    (kind === 'activation' ? activation : caller).abort();
    await expect(pending).rejects.toMatchObject({
      name: 'AbortError',
      operationId: 'redo-id',
    });
    resolve(endpoint);
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('times out unresolved operations but retains their id for reconciliation', async () => {
    vi.useFakeTimers();
    const content = createPluginContent(context(), {
      getEndpoint: () => new Promise(() => undefined),
      timeoutMs: 20,
    });
    const pending = content.redo('batch', { operationId: 'uncertain' });
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
      operationId: 'uncertain',
    });
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
  });
});
