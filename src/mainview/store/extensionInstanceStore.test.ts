import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerBuiltinCanvasTypes } from '@/extensions/registerBuiltins';
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
      future: [expect.objectContaining({ id: first.id })],
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
});
