// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useContextMenu } from '@/hooks/useContextMenu';

const storeState = {
  nodes: [
    {
      id: 'card-1',
      type: 'card',
      position: { x: 10, y: 20 },
      data: { title: 'Card 1', content: '', color: '#FFFFFF' },
    },
    {
      id: 'folder-1',
      type: 'folder',
      position: { x: 30, y: 40 },
      data: { title: 'Folder 1', subtitle: '', children: [] },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      source: 'card-1',
      target: 'folder-1',
      data: { animated: false, pathType: 'smoothstep' },
    },
  ],
  clipboard: [],
  focusedNode: null as null | Record<string, unknown>,
  focusedFolder: null as null | Record<string, unknown>,
  editingEdgeId: null as null | string,
};

const storeActions = {
  setNodes: vi.fn((updater: unknown) => {
    const nextNodes =
      typeof updater === 'function'
        ? (
            updater as (
              nodes: typeof storeState.nodes
            ) => typeof storeState.nodes
          )(storeState.nodes)
        : (updater as typeof storeState.nodes);
    storeState.nodes = nextNodes;
  }),
  setEdges: vi.fn((updater: unknown) => {
    const nextEdges =
      typeof updater === 'function'
        ? (
            updater as (
              edges: typeof storeState.edges
            ) => typeof storeState.edges
          )(storeState.edges)
        : (updater as typeof storeState.edges);
    storeState.edges = nextEdges;
  }),
  setFocusedNode: vi.fn((value: unknown) => {
    storeState.focusedNode = value as Record<string, unknown>;
  }),
  setFocusedFolder: vi.fn((value: unknown) => {
    storeState.focusedFolder = value as Record<string, unknown>;
  }),
  deleteNodes: vi.fn(),
  deleteEdge: vi.fn(),
  updateEdgeData: vi.fn(),
  setEditingEdgeId: vi.fn((id: string) => {
    storeState.editingEdgeId = id;
  }),
  changeNodeColor: vi.fn(),
  addFolderChild: vi.fn(),
  pasteClipboard: vi.fn(),
  nextNodeId: vi.fn(() => `node-${Math.random().toString(36).slice(2, 10)}`),
  saveSnapshot: vi.fn(),
  createNode: vi.fn(
    (
      type: string,
      _rf: unknown,
      options?: {
        anchor?: { x: number; y: number };
        anchorCenter?: { x: number; y: number };
      }
    ) => {
      storeActions.saveSnapshot();
      const id = storeActions.nextNodeId();
      const center = options?.anchorCenter ?? { x: 0, y: 0 };
      const position = options?.anchor ?? { x: center.x, y: center.y };
      const dataByType: Record<string, Record<string, unknown>> = {
        card: { type: 'text', title: '', content: '', color: '#FFFFFF' },
        checklist: {
          type: 'checklist',
          title: '',
          items: [],
          color: '#FFFFFF',
        },
        folder: { title: 'New Folder', subtitle: '', children: [] },
        group: { label: 'New Group', color: 'blue' },
        image: { imageUrl: '', title: '', color: '#FFFFFF' },
        sticky: { content: '', color: '#FEF08A' },
      };
      const resolvedType = type === 'checklist' ? 'card' : type;
      storeState.nodes = [
        ...storeState.nodes,
        {
          id,
          type: resolvedType,
          position,
          data: dataByType[type] ?? {},
        } as (typeof storeState.nodes)[number],
      ];
    }
  ),
};

vi.mock('../../paraglide/messages.js', () => ({
  default_folder_title: () => 'New Folder',
  default_new_group_label: () => 'New Group',
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'copied-id',
}));

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        ...storeState,
        ...storeActions,
      }),
    {
      getState: () => storeState,
      setState: (partial: Partial<typeof storeState>) => {
        Object.assign(storeState, partial);
      },
    }
  ),
}));

const viewport = { x: 10, y: 20, zoom: 2 };
const zoomTo = vi.fn();
const rfInstance = {
  current: {
    getViewport: () => viewport,
    zoomTo,
  },
};

const Harness = () => {
  const {
    contextMenu,
    onPaneContextMenu,
    onNodeContextMenu,
    onEdgeContextMenu,
    handleContextMenuAction,
  } = useContextMenu({ rfInstance: rfInstance as never });

  return (
    <div>
      <button
        onClick={() => {
          onPaneContextMenu({
            preventDefault: vi.fn(),
            clientX: 210,
            clientY: 180,
          } as unknown as MouseEvent);
        }}
        type="button"
      >
        pane
      </button>
      <button
        onClick={() => {
          onNodeContextMenu(
            {
              preventDefault: vi.fn(),
              clientX: 90,
              clientY: 70,
            } as never,
            {
              id: 'folder-1',
              type: 'folder',
              position: { x: 0, y: 0 },
              data: { title: 'Folder 1', subtitle: '', children: [] },
            } as never
          );
        }}
        type="button"
      >
        node
      </button>
      <button
        onClick={() => {
          onEdgeContextMenu(
            {
              preventDefault: vi.fn(),
              clientX: 120,
              clientY: 160,
            } as never,
            { id: 'edge-1', source: 'card-1', target: 'folder-1' } as never
          );
        }}
        type="button"
      >
        edge
      </button>
      <button
        onClick={() => {
          handleContextMenuAction('new-note');
        }}
        type="button"
      >
        new-note
      </button>
      <button
        onClick={() => {
          handleContextMenuAction('new-checklist');
        }}
        type="button"
      >
        new-checklist
      </button>
      <button
        onClick={() => {
          handleContextMenuAction('paste');
        }}
        type="button"
      >
        paste
      </button>
      <button
        onClick={() => {
          handleContextMenuAction('reset-zoom');
        }}
        type="button"
      >
        reset-zoom
      </button>
      <button
        onClick={() => {
          handleContextMenuAction('copy', 'card-1');
        }}
        type="button"
      >
        copy
      </button>
      <button
        onClick={() => {
          handleContextMenuAction('delete', 'card-1');
        }}
        type="button"
      >
        delete
      </button>
      <button
        onClick={() => {
          handleContextMenuAction('change-color', 'card-1');
        }}
        type="button"
      >
        color
      </button>
      <button
        onClick={() => {
          handleContextMenuAction('new-child', 'folder-1');
        }}
        type="button"
      >
        child
      </button>
      <button
        onClick={() => {
          handleContextMenuAction('edit-edge-label', 'edge-1');
        }}
        type="button"
      >
        edit-edge
      </button>
      <button
        onClick={() => {
          handleContextMenuAction('toggle-edge-animated', 'edge-1');
        }}
        type="button"
      >
        toggle-animated
      </button>
      <button
        onClick={() => {
          handleContextMenuAction('toggle-edge-path-type', 'edge-1');
        }}
        type="button"
      >
        toggle-path
      </button>
      <button
        onClick={() => {
          handleContextMenuAction('delete-edge', 'edge-1');
        }}
        type="button"
      >
        delete-edge
      </button>
      <button
        onClick={() => {
          handleContextMenuAction('focus', 'card-1');
        }}
        type="button"
      >
        focus
      </button>
      <button
        onClick={() => {
          handleContextMenuAction('open-folder', 'folder-1');
        }}
        type="button"
      >
        open-folder
      </button>
      <output aria-label="context-menu-state">
        {contextMenu ? JSON.stringify(contextMenu) : 'null'}
      </output>
    </div>
  );
};

describe('useContextMenu', () => {
  it('tracks pane/node/edge context menu state', () => {
    render(<Harness />);

    const output = screen.getByLabelText('context-menu-state');

    fireEvent.click(screen.getByRole('button', { name: 'pane' }));
    expect(output).toHaveTextContent('{"x":210,"y":180,"target":"canvas"}');

    fireEvent.click(screen.getByRole('button', { name: 'node' }));
    expect(output).toHaveTextContent(
      '{"x":90,"y":70,"target":"folder","nodeId":"folder-1"}'
    );

    fireEvent.click(screen.getByRole('button', { name: 'edge' }));
    expect(output).toHaveTextContent(
      '{"x":120,"y":160,"target":"edge","edgeId":"edge-1"}'
    );
  });

  it('creates a new note and dispatches node and edge actions', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'pane' }));
    fireEvent.click(screen.getByRole('button', { name: 'new-note' }));

    expect(storeActions.saveSnapshot).toHaveBeenCalled();
    expect(storeActions.createNode).toHaveBeenCalledWith(
      'card',
      expect.anything(),
      {
        anchorCenter: {
          x: (210 - viewport.x) / viewport.zoom,
          y: (180 - viewport.y) / viewport.zoom,
        },
      }
    );
    expect(storeState.nodes.at(-1)).toMatchObject({
      id: expect.stringMatching(/^node-/),
      type: 'card',
    });

    fireEvent.click(screen.getByRole('button', { name: 'new-checklist' }));
    expect(storeState.nodes.at(-1)).toMatchObject({
      id: expect.stringMatching(/^node-/),
      type: 'card',
      data: {
        type: 'checklist',
        title: '',
        items: [],
        color: '#FFFFFF',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'paste' }));
    fireEvent.click(screen.getByRole('button', { name: 'reset-zoom' }));
    fireEvent.click(screen.getByRole('button', { name: 'delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'color' }));
    fireEvent.click(screen.getByRole('button', { name: 'child' }));
    fireEvent.click(screen.getByRole('button', { name: 'edit-edge' }));
    fireEvent.click(screen.getByRole('button', { name: 'toggle-animated' }));
    fireEvent.click(screen.getByRole('button', { name: 'toggle-path' }));
    fireEvent.click(screen.getByRole('button', { name: 'delete-edge' }));

    expect(storeActions.pasteClipboard).toHaveBeenCalled();
    expect(zoomTo).toHaveBeenCalledWith(1, { duration: 300 });
    expect(storeActions.deleteNodes).toHaveBeenCalledWith(['card-1']);
    expect(storeActions.changeNodeColor).toHaveBeenCalledWith('card-1');
    expect(storeActions.addFolderChild).toHaveBeenCalledWith('folder-1');
    expect(storeActions.setEditingEdgeId).toHaveBeenCalledWith('edge-1');
    expect(storeActions.updateEdgeData).toHaveBeenCalledWith('edge-1', {
      animated: true,
    });
    expect(storeActions.updateEdgeData).toHaveBeenCalledWith('edge-1', {
      pathType: 'bezier',
    });
    expect(storeActions.deleteEdge).toHaveBeenCalledWith('edge-1');
  });

  it('copies nodes and focuses/open folders when rect is available', () => {
    render(<Harness />);

    const cardElement = document.createElement('div');
    const folderElement = document.createElement('div');
    const rect = {
      x: 1,
      y: 2,
      width: 100,
      height: 120,
      top: 2,
      left: 1,
      right: 101,
      bottom: 122,
      toJSON: () => ({}),
    } as DOMRect;

    vi.spyOn(document, 'querySelector').mockImplementation((selector) => {
      if (selector === '[data-id="card-1"]') {
        Object.defineProperty(cardElement, 'getBoundingClientRect', {
          value: () => rect,
        });
        return cardElement;
      }
      if (selector === '[data-id="folder-1"]') {
        Object.defineProperty(folderElement, 'getBoundingClientRect', {
          value: () => rect,
        });
        return folderElement;
      }
      return null;
    });

    act(() => {
      screen.getByRole('button', { name: 'copy' }).click();
      screen.getByRole('button', { name: 'focus' }).click();
      screen.getByRole('button', { name: 'open-folder' }).click();
    });

    expect(storeState.clipboard[0]).toMatchObject({
      id: 'copied-id',
      data: { title: 'Card 1', content: '', color: '#FFFFFF' },
    });
    expect(storeActions.setFocusedNode).toHaveBeenCalledWith({
      id: 'card-1',
      type: 'card',
      data: { title: 'Card 1', content: '', color: '#FFFFFF' },
      rect,
    });
    expect(storeActions.setFocusedFolder).toHaveBeenCalledWith({
      id: 'folder-1',
      data: { title: 'Folder 1', subtitle: '', children: [] },
      rect,
    });
  });

  it('returns early when focus target has no bounding rect', () => {
    render(<Harness />);

    vi.spyOn(document, 'querySelector').mockReturnValue(null);
    screen.getByRole('button', { name: 'focus' }).click();

    expect(storeActions.setFocusedNode).not.toHaveBeenCalled();
  });
});
