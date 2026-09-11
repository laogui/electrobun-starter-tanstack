import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerBuiltinCanvasTypes } from '@/extensions/registerBuiltins';
import { canvasTypeRegistry } from '@/extensions/registry';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import {
  CHECKLIST_CANVAS_TYPE_ID,
  LINK_CANVAS_TYPE_ID,
} from '../../shared/extensions/builtinIds';
import {
  EXTENSION_INSTANCE_SCHEMA,
  type ExtensionInstanceLoadError,
  type ExtensionInstanceRecord,
} from '../../shared/extensions/instance';
import { ExtensionRevisionConflictError } from '../../shared/extensions/revisionConflict';
import { counterCanvasType } from '../extensions/builtin/counter';

const rpcMocks = vi.hoisted(() => ({
  clone: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/rpc', () => ({
  rpcCloneExtensionInstance: rpcMocks.clone,
  rpcCreateExtensionInstance: rpcMocks.create,
  rpcUpdateExtensionInstance: rpcMocks.update,
}));

const toastErrorMock = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock('../../paraglide/messages.js', () => ({
  toast_save_failed: () => 'Could not save this note.',
}));

registerBuiltinCanvasTypes();

function makeRecord(
  id: string,
  overrides?: Partial<ExtensionInstanceRecord>
): ExtensionInstanceRecord {
  return {
    schema: EXTENSION_INSTANCE_SCHEMA,
    id,
    canvasTypeId: CHECKLIST_CANVAS_TYPE_ID,
    appVersion: '1.0.0',
    dataVersion: 1,
    revision: 1,
    createdAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-07T00:00:00.000Z',
    state: {
      title: id,
      items: [{ id: 'item-1', text: 'Keep me', checked: false }],
    },
    presentation: { title: id, plainText: '[ ] Keep me' },
    ...overrides,
  };
}

function recordState(id: string): unknown {
  return useExtensionInstanceStore.getState().records[id] &&
    'state' in useExtensionInstanceStore.getState().records[id]!
    ? (
        useExtensionInstanceStore.getState().records[
          id
        ] as ExtensionInstanceRecord
      ).state
    : undefined;
}

describe('extensionInstanceStore lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useExtensionInstanceStore.setState({ records: {}, history: {} });
    rpcMocks.clone.mockReset();
    rpcMocks.create.mockReset();
    rpcMocks.update.mockReset();
    rpcMocks.update.mockResolvedValue({ success: true });
    toastErrorMock.mockReset();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    useExtensionInstanceStore.setState({ records: {}, history: {} });
    canvasTypeRegistry.clearOwner('example.cards', 1);
  });

  it('keeps per-instance state history isolated from the canvas-facing records', async () => {
    const first = makeRecord('extinst_first');
    const second = makeRecord('extinst_second', {
      state: { title: 'Second', items: [] },
      presentation: { title: 'Second' },
    });
    useExtensionInstanceStore.getState().hydrate({
      [first.id]: first,
      [second.id]: second,
    });

    await useExtensionInstanceStore.getState().updateState(first.id, {
      history: 'record',
      state: {
        title: 'First updated',
        items: [{ id: 'item-1', text: 'Keep me', checked: true }],
      },
    });
    useExtensionInstanceStore.getState().undoInstance(first.id);

    expect(recordState(first.id)).toEqual(first.state);
    expect(recordState(second.id)).toEqual(second.state);
    expect(useExtensionInstanceStore.getState().history[first.id]).toEqual({
      past: [],
      future: [
        expect.objectContaining({
          state: {
            title: 'First updated',
            items: [{ id: 'item-1', text: 'Keep me', checked: true }],
          },
        }),
      ],
    });

    useExtensionInstanceStore.getState().redoInstance(first.id);
    expect(recordState(first.id)).toMatchObject({
      title: 'First updated',
      items: [{ checked: true }],
    });
    expect(recordState(second.id)).toEqual(second.state);
  });

  it('preserves opaque state and presentation for an unknown canvas type', async () => {
    const unknown = makeRecord('extinst_unknown', {
      canvasTypeId: 'ghostboard.future/new-type',
      state: { fromNewerApp: { answer: 42 } },
      presentation: {
        title: 'Future content',
        plainText: 'Keep this opaque state',
      },
    });
    useExtensionInstanceStore.getState().hydrate({ [unknown.id]: unknown });

    const snapshot = await useExtensionInstanceStore
      .getState()
      .updateState(unknown.id, {
        history: 'record',
        state: { fromNewerApp: { answer: 43 } },
      });

    expect(snapshot.state).toEqual({ fromNewerApp: { answer: 43 } });
    expect(snapshot.presentation).toEqual(unknown.presentation);
    expect(recordState(unknown.id)).toEqual({ fromNewerApp: { answer: 43 } });

    useExtensionInstanceStore.getState().undoInstance(unknown.id);
    expect(recordState(unknown.id)).toEqual(unknown.state);
    useExtensionInstanceStore.getState().redoInstance(unknown.id);
    expect(recordState(unknown.id)).toEqual({ fromNewerApp: { answer: 43 } });
  });

  it('does not mutate or write missing and corrupted instance records', async () => {
    const missing: ExtensionInstanceLoadError = {
      id: 'extinst_missing',
      error: 'missing',
    };
    const corrupted: ExtensionInstanceLoadError = {
      id: 'extinst_corrupted',
      error: 'corrupted',
    };
    useExtensionInstanceStore.getState().hydrate({
      [missing.id]: missing,
      [corrupted.id]: corrupted,
    });

    await expect(
      useExtensionInstanceStore.getState().updateState(missing.id, {
        history: 'record',
        state: { title: 'should not save' },
      })
    ).resolves.toEqual({
      revision: 0,
      state: null,
      presentation: { title: '' },
    });
    useExtensionInstanceStore.getState().undoInstance(missing.id);
    useExtensionInstanceStore.getState().redoInstance(corrupted.id);
    await useExtensionInstanceStore.getState().saveNow(corrupted.id);

    expect(useExtensionInstanceStore.getState().records).toEqual({
      [missing.id]: missing,
      [corrupted.id]: corrupted,
    });
    expect(rpcMocks.update).not.toHaveBeenCalled();
  });

  it('hydrates only referenced records while retaining pending records during a save', async () => {
    const referenced = makeRecord('extinst_referenced');
    const unreferenced = makeRecord('extinst_unreferenced');
    useExtensionInstanceStore.getState().hydrate({
      [referenced.id]: referenced,
      [unreferenced.id]: unreferenced,
    });
    await useExtensionInstanceStore.getState().updateState(referenced.id, {
      history: 'record',
      state: { title: 'pending', items: [] },
    });

    useExtensionInstanceStore.getState().hydrate({}, new Set([referenced.id]));

    expect(useExtensionInstanceStore.getState().records).toHaveProperty(
      referenced.id
    );
    expect(useExtensionInstanceStore.getState().records).not.toHaveProperty(
      unreferenced.id
    );
    expect(rpcMocks.update).not.toHaveBeenCalled();
  });

  it('can clone an instance without sharing its id or state object', async () => {
    const source = makeRecord('extinst_source', {
      canvasTypeId: LINK_CANVAS_TYPE_ID,
      state: { url: 'https://example.com', title: 'Example' },
    });
    const cloneState = { url: 'https://example.com', title: 'Example' };
    const clone = makeRecord('extinst_clone', {
      canvasTypeId: LINK_CANVAS_TYPE_ID,
      state: cloneState,
      presentation: source.presentation,
    });
    rpcMocks.clone.mockResolvedValue({ success: true, record: clone });
    useExtensionInstanceStore.getState().hydrate({ [source.id]: source });

    await expect(
      useExtensionInstanceStore.getState().cloneInstance(source.id)
    ).resolves.toEqual(clone);

    expect(rpcMocks.clone).toHaveBeenCalledWith(source.id);
    expect(useExtensionInstanceStore.getState().records).toMatchObject({
      [source.id]: source,
      [clone.id]: clone,
    });
    expect(clone.state).toEqual(source.state);
    expect(clone.state).not.toBe(source.state);
  });

  it('persists a plugin state migration with the old revision and new data version', async () => {
    const canvasType = {
      ...counterCanvasType,
      id: 'example.cards/counter',
      dataVersion: 2,
      validateState: (
        state: unknown
      ): state is { count: number; label: string } =>
        !!state &&
        typeof state === 'object' &&
        typeof (state as { count?: unknown }).count === 'number' &&
        typeof (state as { label?: unknown }).label === 'string',
      migrateState: (record: ExtensionInstanceRecord) => ({
        count: Number((record.state as { count?: unknown }).count ?? 0),
        label: 'Migrated',
      }),
      buildPresentation: (state: { count: number; label: string }) => ({
        title: state.label,
        plainText: `Count ${state.count}`,
      }),
    };
    canvasTypeRegistry.replaceOwner('example.cards', 1, [canvasType]);
    const initial = makeRecord('extinst_migrate', {
      canvasTypeId: canvasType.id,
      dataVersion: 1,
      state: { count: 4 },
      presentation: { title: 'Legacy counter' },
    });
    const migrated: ExtensionInstanceRecord = {
      ...initial,
      dataVersion: 2,
      revision: 2,
      state: { count: 4, label: 'Migrated' },
      presentation: { title: 'Migrated', plainText: 'Count 4' },
    };
    rpcMocks.update.mockResolvedValue({ success: true, record: migrated });
    useExtensionInstanceStore.getState().hydrate({ [initial.id]: initial });

    await expect(
      useExtensionInstanceStore.getState().migrateInstance(initial.id)
    ).resolves.toBe(true);
    expect(rpcMocks.update).toHaveBeenCalledWith({
      dataVersion: 2,
      expectedRevision: 1,
      instanceId: initial.id,
      state: migrated.state,
      presentation: migrated.presentation,
    });
    expect(useExtensionInstanceStore.getState().records[initial.id]).toEqual(
      migrated
    );
  });

  it('does not replace a newer local record when a migration response arrives late', async () => {
    const canvasType = {
      ...counterCanvasType,
      id: 'example.cards/counter',
      dataVersion: 2,
      migrateState: () => ({ count: 1 }),
    };
    canvasTypeRegistry.replaceOwner('example.cards', 1, [canvasType]);
    const initial = makeRecord('extinst_late_migrate', {
      canvasTypeId: canvasType.id,
      dataVersion: 1,
      state: { count: 0 },
    });
    let resolveMigration!: (value: unknown) => void;
    rpcMocks.update.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMigration = resolve;
        })
    );
    useExtensionInstanceStore.getState().hydrate({ [initial.id]: initial });
    const pending = useExtensionInstanceStore
      .getState()
      .migrateInstance(initial.id);
    await vi.waitFor(() => expect(rpcMocks.update).toHaveBeenCalledOnce());
    const local = { ...initial, state: { count: 9 } };
    useExtensionInstanceStore.setState((state) => ({
      records: { ...state.records, [initial.id]: local },
    }));
    resolveMigration({
      success: true,
      record: {
        ...initial,
        dataVersion: 2,
        revision: 2,
        state: { count: 1 },
      },
    });

    await expect(pending).resolves.toBe(true);
    expect(useExtensionInstanceStore.getState().records[initial.id]).toBe(
      local
    );
  });

  it('passes expectedRevision on save and toasts when the write fails', async () => {
    const record = makeRecord('extinst_save');
    useExtensionInstanceStore.getState().hydrate({ [record.id]: record });
    rpcMocks.update.mockResolvedValueOnce({ success: false });

    await useExtensionInstanceStore.getState().saveNow(record.id);

    expect(rpcMocks.update).toHaveBeenCalledWith({
      instanceId: record.id,
      expectedRevision: record.revision,
      state: record.state,
      presentation: record.presentation,
    });
    expect(toastErrorMock).toHaveBeenCalledWith('Could not save this note.');
  });

  it('persists undo and redo against the latest acknowledged revision', async () => {
    const initial = makeRecord('extinst_saved_history');
    let disk = initial;
    rpcMocks.update.mockImplementation(async (input) => {
      if (input.expectedRevision !== disk.revision) {
        return { success: false };
      }
      disk = {
        ...disk,
        state: input.state,
        presentation: input.presentation,
        revision: disk.revision + 1,
      };
      return { success: true, record: disk };
    });
    const store = useExtensionInstanceStore.getState();
    store.hydrate({ [initial.id]: initial });
    await store.updateState(initial.id, {
      history: 'record',
      state: { title: 'Edited', items: [] },
    });
    await store.saveNow(initial.id);
    store.undoInstance(initial.id);
    await store.saveNow(initial.id);
    expect(disk.state).toEqual(initial.state);
    store.redoInstance(initial.id);
    await store.saveNow(initial.id);
    expect(disk.state).toEqual({ title: 'Edited', items: [] });
    expect(
      rpcMocks.update.mock.calls.map(([input]) => input.expectedRevision)
    ).toEqual([1, 2, 3]);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('preserves in-flight edits and sends queued writes with the acknowledged revision', async () => {
    const initial = makeRecord('extinst_queued_edits');
    let acknowledge: (result: unknown) => void = () => {
      throw new Error('request not started');
    };
    rpcMocks.update.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve;
        })
    );
    rpcMocks.update.mockImplementationOnce(async (input) => ({
      success: true,
      record: { ...initial, ...input, revision: 3 },
    }));
    const store = useExtensionInstanceStore.getState();
    store.hydrate({ [initial.id]: initial });
    await store.updateState(initial.id, {
      history: 'record',
      state: { title: 'First', items: [] },
    });
    const firstSave = store.saveNow(initial.id);
    await Promise.resolve();
    const submitted = rpcMocks.update.mock.calls[0]![0];
    await store.updateState(initial.id, {
      history: 'record',
      state: { title: 'Second', items: [] },
    });
    const secondSave = store.saveNow(initial.id);
    acknowledge({
      success: true,
      record: { ...initial, ...submitted, revision: 2 },
    });
    await firstSave;
    expect(recordState(initial.id)).toEqual({ title: 'Second', items: [] });
    await secondSave;
    expect(
      rpcMocks.update.mock.calls.map(([input]) => [
        input.expectedRevision,
        input.state.title,
      ])
    ).toEqual([
      [1, 'First'],
      [2, 'Second'],
    ]);
    expect(recordState(initial.id)).toEqual({ title: 'Second', items: [] });
  });

  it('keeps unsaved content available for an explicit retry after failure', async () => {
    const initial = makeRecord('extinst_retry');
    const store = useExtensionInstanceStore.getState();
    store.hydrate({ [initial.id]: initial });
    await store.updateState(initial.id, {
      history: 'record',
      state: { title: 'Unsaved', items: [] },
    });
    rpcMocks.update.mockResolvedValueOnce({ success: false });
    await store.saveNow(initial.id);
    expect(recordState(initial.id)).toEqual({ title: 'Unsaved', items: [] });
    rpcMocks.update.mockImplementationOnce(async (input) => ({
      success: true,
      record: { ...initial, ...input, revision: 2 },
    }));
    await store.saveNow(initial.id);
    expect(
      rpcMocks.update.mock.calls.map(([input]) => input.expectedRevision)
    ).toEqual([1, 1]);
    expect(recordState(initial.id)).toEqual({ title: 'Unsaved', items: [] });
  });
});

describe('extensionInstanceStore expectedRevision', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useExtensionInstanceStore.setState({ history: {}, records: {} });
    rpcMocks.update.mockReset();
    rpcMocks.update.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    useExtensionInstanceStore.setState({ history: {}, records: {} });
  });

  it('rejects a stale revision and leaves the state untouched', async () => {
    const initial = makeRecord('extinst_cas', { revision: 4 });
    const store = useExtensionInstanceStore.getState();
    store.hydrate({ [initial.id]: initial });

    const rejected = store.updateState(initial.id, {
      expectedRevision: 3,
      history: 'record',
      state: { items: [], title: 'Clobber' },
    });
    await expect(rejected).rejects.toBeInstanceOf(
      ExtensionRevisionConflictError
    );
    await expect(rejected).rejects.toMatchObject({
      message: 'revision-conflict',
      snapshot: { revision: 4 },
    });
    expect(recordState(initial.id)).toEqual(initial.state);
    vi.runOnlyPendingTimers();
    expect(rpcMocks.update).not.toHaveBeenCalled();
  });

  it('accepts a matching revision', async () => {
    const initial = makeRecord('extinst_cas_ok', { revision: 4 });
    const store = useExtensionInstanceStore.getState();
    store.hydrate({ [initial.id]: initial });

    const snapshot = await store.updateState(initial.id, {
      expectedRevision: 4,
      history: 'record',
      state: { items: [], title: 'Accepted' },
    });
    expect(snapshot.revision).toBe(4);
    expect(recordState(initial.id)).toEqual({ items: [], title: 'Accepted' });
  });

  it('leaves callers that omit the field unaffected', async () => {
    const initial = makeRecord('extinst_cas_absent', { revision: 9 });
    const store = useExtensionInstanceStore.getState();
    store.hydrate({ [initial.id]: initial });

    await store.updateState(initial.id, {
      history: 'record',
      state: { items: [], title: 'No expectation' },
    });
    expect(recordState(initial.id)).toEqual({
      items: [],
      title: 'No expectation',
    });
  });
});
