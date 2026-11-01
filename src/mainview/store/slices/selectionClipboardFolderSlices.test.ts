// @vitest-environment jsdom

import type { Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { toast };
});
vi.mock('@/lib/rpc-license', () => ({
  getCachedLicense: vi.fn(() => ({ activated: false })),
  refreshLicense: vi.fn(async () => ({ activated: false })),
}));
vi.mock('@/lib/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rpc')>()),
  rpcDeleteNote: vi.fn(async () => ({ success: true })),
  rpcDeleteWidget: vi.fn(async () => ({ success: true })),
}));

const { rpcDeleteNote, rpcDeleteWidget } = await import('@/lib/rpc');
const { useCanvasStore } = await import('@/store/canvasStore');

const NOTE_ID_RE = /^note_/;
const state = () => useCanvasStore.getState();
const byId = (id: string) => state().nodes.find((n) => n.id === id);
const selectedIds = () =>
  state()
    .nodes.filter((n) => n.selected)
    .map((n) => n.id);

const card = (id: string, x: number, y: number, extra: Partial<Node> = {}) =>
  ({
    data: { title: id },
    id,
    position: { x, y },
    style: { height: 100, width: 100 },
    type: 'card',
    ...extra,
  }) satisfies Node;

describe('selectionSlice', () => {
  beforeEach(() => {
    state().reset();
    useCanvasStore.setState({
      nodes: [
        card('left', 0, 0, { selected: true }),
        card('right', 400, 0),
        card('below', 0, 400),
      ],
    });
  });

  it('moves the selection to the nearest node in a direction', () => {
    expect(state().selectNodeInDirection('right')?.id).toBe('right');
    expect(selectedIds()).toEqual(['right']);
    expect(state().selectNodeInDirection('left')?.id).toBe('left');
    expect(state().selectNodeInDirection('down')?.id).toBe('below');
  });

  it('extends the selection instead of replacing it', () => {
    state().selectNodeInDirection('right', { extend: true });
    expect(selectedIds().sort()).toEqual(['left', 'right']);
  });

  it('deselectAll clears node and edge selection', () => {
    useCanvasStore.setState({
      edges: [{ id: 'e', selected: true, source: 'left', target: 'right' }],
    });
    state().deselectAll();
    expect(selectedIds()).toEqual([]);
    expect(state().edges[0]?.selected).toBe(false);
  });

  it('groups the selection with padding and ungroups back to absolute positions', () => {
    state().setNodes((nodes) =>
      nodes.map((n) => ({ ...n, selected: n.id !== 'below' }))
    );
    state().groupSelected();

    const group = state().nodes.find((n) => n.type === 'group');
    expect(group).toBeDefined();
    expect(group?.position).toEqual({ x: -24, y: -24 });
    expect(group?.style).toMatchObject({ height: 148, width: 548 });
    expect(byId('right')).toMatchObject({
      parentId: group?.id,
      position: { x: 424, y: 24 },
    });
    // Parents must precede their children for React Flow.
    const order = state().nodes.map((n) => n.id);
    expect(order.indexOf(group!.id)).toBeLessThan(order.indexOf('right'));

    state().setNodes((nodes) =>
      nodes.map((n) => ({ ...n, selected: n.id === group?.id }))
    );
    state().ungroupSelected();
    expect(state().nodes.some((n) => n.type === 'group')).toBe(false);
    expect(byId('right')?.position).toEqual({ x: 400, y: 0 });
    expect(byId('right')?.parentId).toBeUndefined();

    state().undo();
    expect(state().nodes.some((n) => n.type === 'group')).toBe(true);
  });
});

describe('clipboardSlice', () => {
  beforeEach(() => {
    state().reset();
    useCanvasStore.setState({
      edges: [
        { id: 'inner', source: 'a', target: 'b' },
        { id: 'outer', source: 'b', target: 'c' },
      ],
      nodes: [
        card('a', 0, 0, { selected: true }),
        card('b', 200, 0, { selected: true }),
        card('c', 400, 0),
      ],
    });
  });

  it('copies the selection with only its internal edges', () => {
    state().copySelected();
    expect(state().clipboard.map((n) => n.id)).toEqual(['a', 'b']);
    expect(state().clipboardEdges.map((e) => e.id)).toEqual(['inner']);
  });

  it('pastes fresh ids at an offset, remaps edges and selects the copies', async () => {
    state().copySelected();
    await state().pasteClipboard(50);

    const pasted = state().nodes.filter((n) => n.id.startsWith('paste-'));
    expect(pasted).toHaveLength(2);
    expect(pasted.map((n) => n.position)).toEqual([
      { x: 50, y: 50 },
      { x: 250, y: 50 },
    ]);
    expect(selectedIds().sort()).toEqual(pasted.map((n) => n.id).sort());

    const pastedEdge = state().edges.find((e) => e.id.startsWith('paste-'));
    expect(pastedEdge).toMatchObject({
      source: pasted[0]?.id,
      target: pasted[1]?.id,
    });

    state().undo();
    expect(state().nodes).toHaveLength(3);
  });

  it('duplicates the selection without touching the clipboard', async () => {
    await state().duplicateSelected();
    expect(state().nodes).toHaveLength(5);
    expect(state().clipboard).toEqual([]);
  });

  it('cut copies then deletes the selection without deleting backing files', () => {
    state().cutSelected();
    expect(rpcDeleteWidget).not.toHaveBeenCalled();
    expect(state().nodes.map((n) => n.id)).toEqual(['c']);
    expect(state().clipboard.map((n) => n.id)).toEqual(['a', 'b']);
    expect(state().edges).toEqual([]);
  });
});

describe('folderSlice', () => {
  beforeEach(() => {
    state().reset();
    useCanvasStore.setState({
      nodes: [
        card('note', 0, 0, { data: { noteId: 'note_1', title: 'Note' } }),
        card('folder', 400, 0, { data: { children: [] }, type: 'folder' }),
      ],
      edges: [{ id: 'e', source: 'note', target: 'folder' }],
    });
  });

  const children = () =>
    (byId('folder')?.data.children ?? []) as Array<{
      data: Record<string, unknown>;
      id: string;
      noteId?: string;
    }>;

  it('absorbs a card into a folder, keeping its note and dropping its edges', () => {
    state().absorbCardIntoFolder('note', 'folder');
    expect(byId('note')).toBeUndefined();
    expect(state().edges).toEqual([]);
    expect(children()).toEqual([
      expect.objectContaining({ id: 'note', noteId: 'note_1' }),
    ]);

    state().undo();
    expect(byId('note')).toBeDefined();
    expect(children()).toEqual([]);
  });

  it('moves a folder child back onto the canvas', () => {
    state().absorbCardIntoFolder('note', 'folder');
    state().moveFolderChildToCanvas('folder', 'note', {
      anchor: { x: 900, y: 900 },
    });
    expect(children()).toEqual([]);
    expect(byId('note')).toMatchObject({
      data: { noteId: 'note_1' },
      position: { x: 900, y: 900 },
      selected: true,
    });
  });

  it('adds note-backed children and keeps their files on removal for undo', () => {
    state().addFolderChild('folder');
    const [child] = children();
    expect(child?.noteId).toMatch(NOTE_ID_RE);

    state().deleteFolderChild('folder', child!.id);
    expect(children()).toEqual([]);
    expect(rpcDeleteNote).not.toHaveBeenCalled();
    expect(rpcDeleteWidget).not.toHaveBeenCalled();

    state().undo();
    expect(children()).toEqual([
      expect.objectContaining({ id: child?.id, noteId: child?.noteId }),
    ]);
  });

  it('commitFolderChildData snapshots and syncs the focused folder', () => {
    state().addFolderChild('folder');
    const [child] = children();
    state().setFocusedFolder({
      data: { children: children() },
      id: 'folder',
      rect: new DOMRect(),
      type: 'folder',
    });

    state().commitFolderChildData('folder', child!.id, { title: 'Edited' });
    expect(children()[0]?.data.title).toBe('Edited');
    const focusedChildren = state().focusedFolder?.data.children as Array<{
      data: Record<string, unknown>;
    }>;
    expect(focusedChildren[0]?.data.title).toBe('Edited');
  });

  it('detaches a note from the canvas and pins it back', () => {
    state().detachNoteFromCanvas('note');
    expect(byId('note')?.data.detached).toBe(true);
    expect(state().edges).toEqual([]);

    state().pinNoteToCanvas('note', { x: 30, y: 40 });
    expect(byId('note')?.data.detached).toBeUndefined();
    expect(byId('note')?.position).toEqual({ x: 30, y: 40 });
  });
});
