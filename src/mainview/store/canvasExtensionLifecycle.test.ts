import type { Edge, Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import {
  CHECKLIST_CANVAS_TYPE_ID,
  FILE_CANVAS_TYPE_ID,
  IMAGE_CANVAS_TYPE_ID,
  LINK_CANVAS_TYPE_ID,
  POMODORO_CANVAS_TYPE_ID,
  RECORDING_CANVAS_TYPE_ID,
  REMINDER_CANVAS_TYPE_ID,
} from '../../shared/extensions/builtinIds';
import {
  EXTENSION_INSTANCE_SCHEMA,
  type ExtensionInstanceRecord,
} from '../../shared/extensions/instance';

const rpcMocks = vi.hoisted(() => ({
  cloneExtensionInstance: vi.fn(),
  createExtensionInstance: vi.fn(),
  deleteNote: vi.fn(),
  deleteWidget: vi.fn(),
  isRpcAvailable: vi.fn(),
  loadCanvas: vi.fn(),
  saveManifest: vi.fn(),
  setActiveView: vi.fn(),
  updateExtensionInstance: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
}));

vi.mock('@/lib/rpc', () => ({
  isRpcAvailable: rpcMocks.isRpcAvailable,
  loadCanvas: rpcMocks.loadCanvas,
  rpcCloneExtensionInstance: rpcMocks.cloneExtensionInstance,
  rpcCreateExtensionInstance: rpcMocks.createExtensionInstance,
  rpcDeleteNote: rpcMocks.deleteNote,
  rpcDeleteWidget: rpcMocks.deleteWidget,
  rpcSaveManifest: rpcMocks.saveManifest,
  rpcSetActiveView: rpcMocks.setActiveView,
  rpcUpdateExtensionInstance: rpcMocks.updateExtensionInstance,
}));

vi.mock('@/lib/rpc-license', () => ({
  getCachedLicense: vi.fn(() => null),
  refreshLicense: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastMocks.error,
  },
}));

const EXTENSION_CANVAS_TYPES = [
  CHECKLIST_CANVAS_TYPE_ID,
  POMODORO_CANVAS_TYPE_ID,
  REMINDER_CANVAS_TYPE_ID,
  LINK_CANVAS_TYPE_ID,
  IMAGE_CANVAS_TYPE_ID,
  FILE_CANVAS_TYPE_ID,
  RECORDING_CANVAS_TYPE_ID,
] as const;
const PASTED_NODE_ID_RE = /^paste-/;

function makeRecord(
  id: string,
  canvasTypeId: string,
  state: unknown = { value: id }
): ExtensionInstanceRecord {
  return {
    schema: EXTENSION_INSTANCE_SCHEMA,
    id,
    canvasTypeId,
    appVersion: '1.0.0',
    dataVersion: 1,
    revision: 1,
    createdAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-07T00:00:00.000Z',
    state,
    presentation: { title: id, plainText: JSON.stringify(state) },
  };
}

function makeExtensionNode(
  id: string,
  instanceId: string,
  canvasTypeId: string = LINK_CANVAS_TYPE_ID,
  overrides?: Partial<Node>
): Node {
  return {
    id,
    type: 'extension',
    position: { x: 100, y: 120 },
    data: { canvasTypeId, instanceId },
    ...overrides,
  };
}

function resetStores(): void {
  useCanvasStore.getState().reset();
  useExtensionInstanceStore.setState({ records: {}, history: {} });
}

beforeEach(() => {
  resetStores();
  toastMocks.error.mockReset();
  rpcMocks.cloneExtensionInstance.mockReset();
  rpcMocks.createExtensionInstance.mockReset();
  rpcMocks.deleteNote.mockReset();
  rpcMocks.deleteWidget.mockReset();
  rpcMocks.isRpcAvailable.mockReset();
  rpcMocks.isRpcAvailable.mockResolvedValue(true);
  rpcMocks.loadCanvas.mockReset();
  rpcMocks.saveManifest.mockReset();
  rpcMocks.saveManifest.mockResolvedValue({ success: true });
  rpcMocks.setActiveView.mockReset();
  rpcMocks.setActiveView.mockResolvedValue({ success: true });
  rpcMocks.updateExtensionInstance.mockReset();
  rpcMocks.updateExtensionInstance.mockResolvedValue({ success: true });
});

afterEach(() => {
  resetStores();
});

describe('canvasStore extension instance lifecycle', () => {
  it.each(
    EXTENSION_CANVAS_TYPES
  )('duplicates a %s extension reference with an independent instance', async (canvasTypeId) => {
    const sourceId = `extinst_source_${canvasTypeId.split('/').at(-1)}`;
    const cloneId = `${sourceId}_clone`;
    const source = makeRecord(sourceId, canvasTypeId, {
      value: 'source',
    });
    const clone = makeRecord(cloneId, canvasTypeId, {
      value: 'source',
    });
    rpcMocks.cloneExtensionInstance.mockResolvedValueOnce({
      success: true,
      record: clone,
    });
    useExtensionInstanceStore.getState().hydrate({ [sourceId]: source });
    useCanvasStore.setState({
      nodes: [
        makeExtensionNode('source-node', sourceId, canvasTypeId, {
          selected: true,
        }),
      ],
      edges: [],
    });

    await useCanvasStore.getState().duplicateSelected();

    expect(rpcMocks.cloneExtensionInstance).toHaveBeenCalledWith(sourceId);
    expect(useExtensionInstanceStore.getState().records[cloneId]).toEqual(
      clone
    );
    expect(useCanvasStore.getState().nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'source-node',
          data: { canvasTypeId, instanceId: sourceId },
        }),
        expect.objectContaining({
          id: expect.stringMatching(PASTED_NODE_ID_RE),
          data: { canvasTypeId, instanceId: cloneId },
        }),
      ])
    );
  });

  it.each(
    EXTENSION_CANVAS_TYPES
  )('pastes a %s reference across canvases without sharing the instance id', async (canvasTypeId) => {
    const sourceId = `extinst_clipboard_${canvasTypeId.split('/').at(-1)}`;
    const cloneId = `${sourceId}_clone`;
    const source = makeRecord(sourceId, canvasTypeId, {
      value: 'clipboard',
    });
    const clone = makeRecord(cloneId, canvasTypeId, {
      value: 'clipboard',
    });
    rpcMocks.cloneExtensionInstance.mockResolvedValueOnce({
      success: true,
      record: clone,
    });
    useExtensionInstanceStore.getState().hydrate({ [sourceId]: source });
    useCanvasStore.setState({
      nodes: [],
      edges: [],
      clipboard: [makeExtensionNode('clipboard-node', sourceId, canvasTypeId)],
      clipboardEdges: [],
    });

    await useCanvasStore.getState().pasteClipboard();

    expect(rpcMocks.cloneExtensionInstance).toHaveBeenCalledWith(sourceId);
    const pasted = useCanvasStore
      .getState()
      .nodes.find((node) => node.type === 'extension');
    expect(pasted).toMatchObject({
      type: 'extension',
      data: { canvasTypeId, instanceId: cloneId },
    });
    expect(pasted?.id).not.toBe('clipboard-node');
  });

  it('recursively clones extension references inside a Folder', async () => {
    const sourceId = 'extinst_folder_source';
    const cloneId = 'extinst_folder_clone';
    const source = makeRecord(sourceId, LINK_CANVAS_TYPE_ID, {
      url: 'https://example.com',
    });
    const clone = makeRecord(cloneId, LINK_CANVAS_TYPE_ID, {
      url: 'https://example.com',
    });
    rpcMocks.cloneExtensionInstance.mockResolvedValueOnce({
      success: true,
      record: clone,
    });
    useExtensionInstanceStore.getState().hydrate({ [sourceId]: source });
    useCanvasStore.setState({
      nodes: [
        {
          id: 'folder-source',
          type: 'folder',
          position: { x: 0, y: 0 },
          selected: true,
          data: {
            title: 'Folder',
            children: [
              {
                id: 'folder-child',
                type: 'extension',
                data: {
                  canvasTypeId: LINK_CANVAS_TYPE_ID,
                  instanceId: sourceId,
                },
              },
            ],
          },
        },
      ],
      edges: [],
    });

    await useCanvasStore.getState().duplicateSelected();

    const folders = useCanvasStore
      .getState()
      .nodes.filter((node) => node.type === 'folder');
    expect(folders).toHaveLength(2);
    expect(rpcMocks.cloneExtensionInstance).toHaveBeenCalledWith(sourceId);
    expect((folders[1]?.data.children as Node[])[0]).toMatchObject({
      type: 'extension',
      data: { canvasTypeId: LINK_CANVAS_TYPE_ID, instanceId: cloneId },
    });
  });

  it('skips a failed extension clone and keeps the source reference visible', async () => {
    rpcMocks.cloneExtensionInstance.mockResolvedValueOnce({ success: false });
    const sourceId = 'extinst_clone_failure';
    const source = makeRecord(sourceId, LINK_CANVAS_TYPE_ID);
    useExtensionInstanceStore.getState().hydrate({ [sourceId]: source });
    useCanvasStore.setState({
      nodes: [
        makeExtensionNode('source-node', sourceId, LINK_CANVAS_TYPE_ID, {
          selected: true,
        }),
      ],
      edges: [],
    });

    await useCanvasStore.getState().duplicateSelected();

    expect(useCanvasStore.getState().nodes).toHaveLength(1);
    expect(useCanvasStore.getState().nodes[0]).toMatchObject({
      id: 'source-node',
      type: 'extension',
      data: { instanceId: sourceId },
    });
    expect(toastMocks.error).toHaveBeenCalledWith(
      'Failed to clone a canvas type; the copy was skipped.'
    );
  });

  it.each(
    EXTENSION_CANVAS_TYPES
  )('removes only the %s canvas reference and restores it through canvas undo/redo', (canvasTypeId) => {
    const sourceId = `extinst_delete_${canvasTypeId.split('/').at(-1)}`;
    const source = makeRecord(sourceId, canvasTypeId);
    useExtensionInstanceStore.getState().hydrate({ [sourceId]: source });
    const node = makeExtensionNode('source-node', sourceId, canvasTypeId);
    const edge: Edge = { id: 'edge-1', source: 'source-node', target: 'other' };
    useCanvasStore.setState({
      nodes: [
        node,
        makeExtensionNode('other-node', 'extinst_other', canvasTypeId),
      ],
      edges: [edge],
    });

    useCanvasStore.getState().deleteNodes(['source-node']);
    expect(useCanvasStore.getState().nodes.map(({ id }) => id)).toEqual([
      'other-node',
    ]);
    expect(useExtensionInstanceStore.getState().records[sourceId]).toEqual(
      source
    );

    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().nodes).toEqual([node, expect.any(Object)]);
    expect(useCanvasStore.getState().nodes[0]).toEqual(node);
    expect(useCanvasStore.getState().edges).toEqual([edge]);

    useCanvasStore.getState().redo();
    expect(useCanvasStore.getState().nodes.map(({ id }) => id)).toEqual([
      'other-node',
    ]);
    expect(useExtensionInstanceStore.getState().records[sourceId]).toEqual(
      source
    );
  });

  it.each(
    EXTENSION_CANVAS_TYPES
  )('hydrates a persisted %s reference and state independently after reload', (canvasTypeId) => {
    const sourceId = `extinst_reload_${canvasTypeId.split('/').at(-1)}`;
    const source = makeRecord(sourceId, canvasTypeId, {
      url: 'https://example.com/reloaded',
    });
    const node = makeExtensionNode('reload-node', sourceId, canvasTypeId);

    useCanvasStore.getState().hydrate([node], []);
    useExtensionInstanceStore.getState().hydrate({ [sourceId]: source });
    expect(useCanvasStore.getState().nodes).toEqual([node]);
    expect(useExtensionInstanceStore.getState().records[sourceId]).toEqual(
      source
    );

    resetStores();
    useCanvasStore.getState().hydrate([node], []);
    useExtensionInstanceStore.getState().hydrate({ [sourceId]: source });

    expect(useCanvasStore.getState().nodes[0]).toMatchObject({
      type: 'extension',
      data: { canvasTypeId, instanceId: sourceId },
    });
    expect(useExtensionInstanceStore.getState().records[sourceId]).toEqual(
      source
    );
  });
});
