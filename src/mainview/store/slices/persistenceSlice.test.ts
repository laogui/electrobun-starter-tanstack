// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { toast };
});
vi.mock('@/lib/rpc-license', () => ({
  getCachedLicense: vi.fn(() => ({ activated: true })),
  refreshLicense: vi.fn(async () => ({ activated: true })),
}));
vi.mock('@/lib/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rpc')>()),
  isRpcAvailable: vi.fn(async () => true),
  loadCanvas: vi.fn(),
  rpcSaveManifest: vi.fn(),
  rpcSetActiveView: vi.fn(),
}));

const rpc = await import('@/lib/rpc');
const { resetViewportPersistSuppression } = await import(
  '@/lib/viewportPersist'
);
const { useCanvasStore } = await import('@/store/canvasStore');

const state = () => useCanvasStore.getState();
const saveManifest = vi.mocked(rpc.rpcSaveManifest);
const setActiveViewRpc = vi.mocked(rpc.rpcSetActiveView);
const loadCanvas = vi.mocked(rpc.loadCanvas);

const card = (id: string, extra: Partial<Node> = {}): Node => ({
  data: { title: id },
  id,
  position: { x: 0, y: 0 },
  type: 'card',
  ...extra,
});

type SavedCall = [string, Record<string, unknown>[], Record<string, unknown>[]];
const savedCall = (index: number): SavedCall => {
  const call = saveManifest.mock.calls[index];
  if (!call) {
    throw new Error(`rpcSaveManifest call ${index} missing`);
  }
  return call;
};

describe('persistenceSlice', () => {
  beforeEach(() => {
    state().reset();
    state().setActiveViewId('default');
    resetViewportPersistSuppression();
    saveManifest.mockReset();
    saveManifest.mockResolvedValue({ success: true });
    setActiveViewRpc.mockReset();
    setActiveViewRpc.mockResolvedValue({ success: true });
    loadCanvas.mockReset();
  });

  describe('hydrate / reset', () => {
    it('orders parents before children and marks the canvas hydrated', () => {
      state().hydrate(
        [
          card('child', { parentId: 'group' }),
          card('group', { type: 'group' }),
        ],
        []
      );
      expect(state().nodes.map((n) => n.id)).toEqual(['group', 'child']);
      expect(state()._hydrated).toBe(true);
      expect(state().topicWritePaused).toBe(false);
    });

    it('restores the session camera cached for the view', () => {
      state().setViewport({ x: 1, y: 2, zoom: 3 }, { persist: true });
      state().hydrate([card('a')], []);
      expect(state().viewport).toEqual({ x: 1, y: 2, zoom: 3 });
      expect(state().sessionViewport).toEqual({ x: 1, y: 2, zoom: 3 });
    });

    it('reset clears graph, history, camera cache and transient UI', () => {
      state().hydrate([card('a')], []);
      state().commitNodeData('a', { title: 'x' });
      state().setViewport({ x: 1, y: 1, zoom: 1 }, { persist: true });
      state().setTagSidebarOpen(true);
      state().setActiveTagFilters(['work']);

      state().reset();

      expect(state()).toMatchObject({
        _hydrated: false,
        _sessionViewports: {},
        activeTagFilters: [],
        edges: [],
        nodes: [],
        sessionViewport: null,
        tagSidebarOpen: false,
        viewport: null,
      });
      expect(state().canUndo()).toBe(false);
    });
  });

  describe('viewport session cache', () => {
    it('keeps a live-only camera out of the session cache', () => {
      state().setViewport({ x: 5, y: 5, zoom: 1 }, { persist: false });
      expect(state().viewport).toEqual({ x: 5, y: 5, zoom: 1 });
      expect(state().sessionViewport).toBeNull();
    });

    it('stashes and restores each view camera across view swaps', () => {
      state().setViewport({ x: 10, y: 0, zoom: 1 }, { persist: true });
      state().setActiveView('second');
      expect(state().viewport).toBeNull();
      state().setViewport({ x: 20, y: 0, zoom: 2 }, { persist: true });

      state().setActiveView('default');
      expect(state().viewport).toEqual({ x: 10, y: 0, zoom: 1 });
      state().setActiveView('second');
      expect(state().viewport).toEqual({ x: 20, y: 0, zoom: 2 });
    });

    it('a view swap drops the graph and its undo history', () => {
      state().hydrate([card('a')], []);
      state().commitNodeData('a', { title: 'x' });
      state().setActiveView('second');
      expect(state()).toMatchObject({ _hydrated: false, nodes: [] });
      expect(state().canUndo()).toBe(false);
    });
  });

  describe('switchView', () => {
    it('flushes the sanitized graph, persists the view, then swaps', async () => {
      state().hydrate(
        [
          card('a', {
            selected: true,
            data: { previewUrl: 'blob:x', title: 'A' },
          }),
        ],
        [{ id: 'e', selected: true, source: 'a', target: 'a' }]
      );

      await expect(state().switchView('second')).resolves.toBe(true);

      expect(saveManifest).toHaveBeenCalledTimes(1);
      const [viewId, nodes, edges] = savedCall(0);
      expect(viewId).toBe('default');
      expect(nodes[0]).not.toHaveProperty('selected');
      expect(nodes[0]?.data).toEqual({ title: 'A' });
      expect(edges[0]).not.toHaveProperty('selected');
      expect(setActiveViewRpc).toHaveBeenCalledWith('second');
      expect(state().activeViewId).toBe('second');
    });

    it('stays on the current view when the flush fails', async () => {
      state().hydrate([card('a')], []);
      saveManifest.mockResolvedValue({ success: false });

      await expect(state().switchView('second')).resolves.toBe(false);
      expect(state().activeViewId).toBe('default');
      expect(state().nodes).toHaveLength(1);
      expect(setActiveViewRpc).not.toHaveBeenCalled();
    });

    it('never flushes a canvas that was not hydrated', async () => {
      await expect(state().switchView('second')).resolves.toBe(true);
      expect(saveManifest).not.toHaveBeenCalled();
    });

    it('re-flushes edits made while the switch flush was in flight', async () => {
      state().hydrate([card('a')], []);
      saveManifest.mockImplementationOnce(async () => {
        // Simulate the user typing during the save RPC round-trip.
        state().setNodes((nodes) => [...nodes, card('late')]);
        return { success: true };
      });

      await expect(state().switchView('second')).resolves.toBe(true);

      expect(saveManifest).toHaveBeenCalledTimes(2);
      const [, lastNodes] = savedCall(1);
      expect(lastNodes.map((n) => n.id)).toEqual(['a', 'late']);
      expect(state().activeViewId).toBe('second');
    });

    it('skips the outgoing flush when asked (deleted view)', async () => {
      state().hydrate([card('a')], []);
      await expect(
        state().switchView('second', { skipFlush: true })
      ).resolves.toBe(true);
      expect(saveManifest).not.toHaveBeenCalled();
      expect(state().activeViewId).toBe('second');
    });

    it('commits a typed Topic draft into the outgoing flush', async () => {
      state().hydrate([], []);
      state().beginTopicDraft(null, { anchor: { x: 0, y: 0 } });
      state().setTopicDraftText('Carry me');

      await state().switchView('second');

      const [, nodes] = savedCall(0);
      expect(nodes).toHaveLength(1);
      expect(nodes[0]?.data).toMatchObject({ title: 'Carry me' });
    });
  });

  describe('moveSelectedToView', () => {
    const target = { edges: [] as Edge[], nodes: [card('t1')] };

    beforeEach(() => {
      loadCanvas.mockResolvedValue(target);
      state().hydrate(
        [
          card('keep'),
          card('move', { selected: true }),
          card('move2', { selected: true }),
        ],
        [
          { id: 'inner', source: 'move', target: 'move2' },
          { id: 'cross', source: 'keep', target: 'move' },
        ]
      );
    });

    it('writes the target first, then the source, then updates the store', async () => {
      await expect(state().moveSelectedToView('other')).resolves.toBe(true);

      const [targetView, targetNodes, targetEdges] = savedCall(0);
      expect(targetView).toBe('other');
      expect(targetNodes.map((n) => n.id)).toEqual(['t1', 'move', 'move2']);
      expect(targetEdges.map((e) => e.id)).toEqual(['inner']);

      const [sourceView, sourceNodes] = savedCall(1);
      expect(sourceView).toBe('default');
      expect(sourceNodes.map((n) => n.id)).toEqual(['keep']);

      expect(state().nodes.map((n) => n.id)).toEqual(['keep']);
      expect(state().edges).toEqual([]);
    });

    it('aborts without writing when the target canvas cannot be read', async () => {
      loadCanvas.mockRejectedValueOnce(new Error('ManifestCorruptError'));

      await expect(state().moveSelectedToView('other')).resolves.toBe(false);

      expect(saveManifest).not.toHaveBeenCalled();
      expect(state().nodes).toHaveLength(3);
    });

    it('aborts without writing when the target canvas is missing', async () => {
      loadCanvas.mockResolvedValueOnce(null);

      await expect(state().moveSelectedToView('other')).resolves.toBe(false);

      expect(saveManifest).not.toHaveBeenCalled();
      expect(state().nodes).toHaveLength(3);
    });

    it('keeps edits made during the move in the source canvas', async () => {
      saveManifest.mockImplementationOnce(async () => {
        // Target save in flight: the user adds a card to the source canvas.
        state().setNodes((nodes) => [...nodes, card('late')]);
        return { success: true };
      });

      await expect(state().moveSelectedToView('other')).resolves.toBe(true);

      const [sourceView, sourceNodes] = savedCall(1);
      expect(sourceView).toBe('default');
      expect(sourceNodes.map((n) => n.id)).toEqual(['keep', 'late']);
      expect(state().nodes.map((n) => n.id)).toEqual(['keep', 'late']);
    });

    it('rolls the target back when the source save fails', async () => {
      saveManifest
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false })
        .mockResolvedValueOnce({ success: true });

      await expect(state().moveSelectedToView('other')).resolves.toBe(false);

      expect(saveManifest).toHaveBeenCalledTimes(3);
      const [rollbackView, rollbackNodes] = savedCall(2);
      expect(rollbackView).toBe('other');
      expect(rollbackNodes.map((n) => n.id)).toEqual(['t1']);
      expect(state().nodes).toHaveLength(3);
    });
  });
});
