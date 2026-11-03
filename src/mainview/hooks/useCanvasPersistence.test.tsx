// @vitest-environment jsdom

import type { Node } from '@xyflow/react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/confirmCanvasRecovery', () => ({
  confirmCanvasRecovery: vi.fn(async () => false),
}));
const { confirmCanvasRecovery } = await import('@/lib/confirmCanvasRecovery');

vi.mock('@/lib/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rpc')>()),
  isRpcAvailable: vi.fn(async () => true),
  rpcSaveManifest: vi.fn(async () => ({ success: true })),
  loadCanvas: vi.fn(),
}));

const rpc = await import('@/lib/rpc');
const { readPendingFlushBackup, writePendingFlushBackup } = await import(
  '@/lib/pendingFlushBackup'
);
const { useCanvasPersistence } = await import('@/hooks/useCanvasPersistence');
const { useCanvasStore } = await import('@/store/canvasStore');

const saveManifest = vi.mocked(rpc.rpcSaveManifest);
const DEBOUNCE_MS = 2500;

const card = (id: string, extra: Partial<Node> = {}): Node => ({
  data: { title: id },
  id,
  position: { x: 0, y: 0 },
  type: 'card',
  ...extra,
});

function Harness() {
  useCanvasPersistence();
  return null;
}

let root: Root | null = null;

async function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<Harness />);
  });
  // Let the isRpcAvailable() promise resolve.
  await act(async () => {
    await Promise.resolve();
  });
}

const moveNode = (x: number) =>
  act(() => {
    useCanvasStore
      .getState()
      .setNodes((nodes) => nodes.map((n) => ({ ...n, position: { x, y: 0 } })));
  });

describe('useCanvasPersistence (debounced manifest flush)', () => {
  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    localStorage.clear();
    saveManifest.mockClear();
    useCanvasStore.getState().reset();
    useCanvasStore.getState().setActiveViewId('view-1');
    useCanvasStore.getState().hydrate([card('a', { selected: true })], []);
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    root = null;
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('coalesces a burst of edits into one sanitized save after the debounce', async () => {
    await mount();
    await moveNode(10);
    await moveNode(20);
    await moveNode(30);

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS - 1);
    });
    expect(saveManifest).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(saveManifest).toHaveBeenCalledTimes(1);
    const [viewId, nodes] = saveManifest.mock.calls[0] ?? [];
    expect(viewId).toBe('view-1');
    expect(nodes).toEqual([
      expect.objectContaining({ id: 'a', position: { x: 30, y: 0 } }),
    ]);
    expect(nodes?.[0]).not.toHaveProperty('selected');
  });

  it('does not save the hydration itself or a write-paused canvas', async () => {
    await mount();
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS * 2);
    });
    expect(saveManifest).not.toHaveBeenCalled();

    useCanvasStore.setState({ topicWritePaused: true });
    await moveNode(5);
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(saveManifest).not.toHaveBeenCalled();
  });

  it('flushes immediately when the window loses focus', async () => {
    await mount();
    await moveNode(42);
    await act(async () => {
      window.dispatchEvent(new Event('blur'));
      await Promise.resolve();
    });
    expect(saveManifest).toHaveBeenCalledTimes(1);
  });

  it('writes a crash backup on unload while dirty and clears it after a save', async () => {
    await mount();
    await moveNode(7);
    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });
    expect(readPendingFlushBackup('view-1')?.nodes[0]?.position).toEqual({
      x: 7,
      y: 0,
    });

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
      await Promise.resolve();
    });
    expect(readPendingFlushBackup('view-1')).toBeNull();
  });

  it('keeps a failed save dirty, reports the conflict and clears the warning after retry', async () => {
    const error = vi.spyOn(toast, 'error').mockReturnValue('save-error');
    const dismiss = vi.spyOn(toast, 'dismiss');
    saveManifest.mockResolvedValueOnce({
      success: false,
      error: 'revision-conflict',
    });
    await mount();
    await moveNode(12);
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: 'canvas-save-view-1' })
    );
    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });
    expect(readPendingFlushBackup('view-1')?.nodes[0]?.position.x).toBe(12);
    await act(async () => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(saveManifest).toHaveBeenCalledTimes(2);
    expect(readPendingFlushBackup('view-1')).toBeNull();
    expect(dismiss).toHaveBeenCalledWith('canvas-save-view-1');
  });

  it('reloads only conflicting notes while preserving layout and unrelated local drafts', async () => {
    const error = vi.spyOn(toast, 'error').mockReturnValue('conflict');
    useCanvasStore.setState({
      nodes: [
        card('stale', {
          data: {
            noteId: 'stale',
            title: 'Stale local draft',
            blocknoteRevision: 1,
          },
        }),
        card('other', {
          data: {
            noteId: 'other',
            title: 'Keep local draft',
            blocknoteRevision: 2,
          },
        }),
      ],
    });
    vi.mocked(rpc.loadCanvas).mockResolvedValueOnce({
      nodes: [
        card('stale', {
          data: { noteId: 'stale', title: 'Disk title', blocknoteRevision: 2 },
        }),
        card('other', {
          data: {
            noteId: 'other',
            title: 'Unedited disk title',
            blocknoteRevision: 2,
          },
        }),
      ],
      edges: [],
    });
    saveManifest.mockResolvedValueOnce({
      success: false,
      error: 'revision-conflict',
      layoutSaved: true,
      conflictNoteIds: ['stale'],
    });
    await mount();
    await moveNode(123);
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    const options = error.mock.calls.at(-1)?.[1];
    expect(options?.action).toBeDefined();
    await act(async () => {
      if (
        options?.action &&
        typeof options.action === 'object' &&
        'onClick' in options.action
      ) {
        options.action.onClick({} as React.MouseEvent<HTMLButtonElement>);
      }
    });
    expect(useCanvasStore.getState().nodes[0]?.data.title).toBe('Disk title');
    expect(useCanvasStore.getState().nodes[1]?.data.title).toBe(
      'Keep local draft'
    );
    expect(useCanvasStore.getState().nodes[0]?.position.x).toBe(123);
    expect(
      Object.keys(localStorage).some((key) => key.includes('archive.'))
    ).toBe(true);
  });

  it('requires confirmation before a pending backup replaces the loaded disk graph', async () => {
    const confirm = vi.mocked(confirmCanvasRecovery).mockResolvedValue(false);
    writePendingFlushBackup('view-1', {
      edges: [],
      nodes: [card('restored', { position: { x: 3, y: 4 } })],
    });
    useCanvasStore.getState().reset();
    useCanvasStore.getState().setActiveViewId('view-1');

    await mount();
    // The disk load lands after the hook is ready; it must not clobber the
    // backup restore (the old race restored first and then got overwritten).
    await act(async () => {
      useCanvasStore.getState().hydrate([card('from-disk')], []);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(confirm).toHaveBeenCalledOnce();
    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual([
      'from-disk',
    ]);
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(saveManifest).not.toHaveBeenCalled();
    expect(readPendingFlushBackup('view-1')?.nodes[0]?.id).toBe('restored');
  });

  it('restores a confirmed backup but retains independent recovery evidence', async () => {
    vi.mocked(confirmCanvasRecovery).mockResolvedValueOnce(true);
    writePendingFlushBackup('view-1', {
      nodes: [card('recovered')],
      edges: [],
    });
    useCanvasStore.getState().reset();
    await mount();
    await act(async () => {
      useCanvasStore.getState().hydrate([card('disk')], []);
    });
    expect(useCanvasStore.getState().nodes[0]?.id).toBe('recovered');
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(readPendingFlushBackup('view-1')).toBeNull();
    expect(
      Object.keys(localStorage).some((key) => key.includes('archive.view-1.'))
    ).toBe(true);
  });

  it('cannot apply an old recovery choice after the canvas changes', async () => {
    let choose!: (value: boolean) => void;
    vi.mocked(confirmCanvasRecovery).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          choose = resolve;
        })
    );
    writePendingFlushBackup('view-1', { nodes: [card('old')], edges: [] });
    useCanvasStore.getState().reset();
    await mount();
    await act(async () => {
      useCanvasStore.getState().hydrate([card('disk')], []);
    });
    await moveNode(42);
    await act(async () => {
      choose(true);
    });
    expect(useCanvasStore.getState().nodes[0]?.id).toBe('disk');
    expect(useCanvasStore.getState().nodes[0]?.position.x).toBe(42);
  });

  it('keeps edits made during an in-flight save dirty', async () => {
    let resolveSave: (value: { success: boolean }) => void = () => undefined;
    saveManifest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        })
    );
    await mount();
    await moveNode(1);
    await act(async () => {
      window.dispatchEvent(new Event('blur'));
      await Promise.resolve();
    });
    expect(saveManifest).toHaveBeenCalledTimes(1);

    // Edit while the first save is still in flight, then let it succeed.
    await moveNode(2);
    await act(async () => {
      resolveSave({ success: true });
      await Promise.resolve();
      await Promise.resolve();
    });

    // The later edit must still count as unsaved: blur flushes it again.
    await act(async () => {
      window.dispatchEvent(new Event('blur'));
      await Promise.resolve();
    });
    expect(saveManifest).toHaveBeenCalledTimes(2);
    expect(saveManifest.mock.calls[1]?.[1]).toEqual([
      expect.objectContaining({ position: { x: 2, y: 0 } }),
    ]);
  });

  it('flushes pending edits when the main process asks before quit', async () => {
    const { flushRegisteredCanvas } = await import('@/lib/canvasFlushRegistry');
    await mount();
    await moveNode(9);
    let result: boolean | undefined;
    await act(async () => {
      result = await flushRegisteredCanvas();
    });
    expect(result).toBe(true);
    expect(saveManifest).toHaveBeenCalledTimes(1);
    expect(saveManifest.mock.calls[0]?.[1]).toEqual([
      expect.objectContaining({ position: { x: 9, y: 0 } }),
    ]);
  });
});
