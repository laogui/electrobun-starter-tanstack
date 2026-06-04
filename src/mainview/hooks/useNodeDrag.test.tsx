// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useNodeDrag } from '@/hooks/useNodeDrag';

const applyRepulsionMock = vi.hoisted(() =>
  vi.fn(({ nodes }: { nodes: unknown[] }) => nodes)
);

const state = {
  nodes: [
    {
      id: 'group-1',
      type: 'group',
      position: { x: 100, y: 100 },
      data: { active: false },
      style: { width: 500, height: 300 },
    },
    {
      id: 'folder-1',
      type: 'folder',
      position: { x: 20, y: 20 },
      data: { title: 'Folder', children: [] },
      measured: { width: 280, height: 280 },
      style: { width: 280, height: 280 },
    },
    {
      id: 'card-1',
      type: 'card',
      parentId: 'group-1',
      extent: 'parent' as const,
      position: { x: 20, y: 30 },
      data: {
        title: 'Card',
        color: '#fff',
        isHidden: true,
        isDropTarget: true,
      },
      style: { width: 350, height: 450 },
    },
  ],
};

const rfMock = {
  getInternalNode: vi.fn((id: string) => {
    if (id === 'card-1') {
      return {
        internals: { positionAbsolute: { x: 140, y: 160 } },
        measured: { width: 350, height: 450 },
      };
    }
    if (id === 'group-1') {
      return {
        internals: { positionAbsolute: { x: 100, y: 100 } },
        measured: { width: 500, height: 300 },
      };
    }
    if (id === 'folder-1') {
      return {
        internals: { positionAbsolute: { x: 20, y: 20 } },
        measured: { width: 280, height: 280 },
      };
    }
    if (id === 'sticky-1') {
      return {
        internals: { positionAbsolute: { x: 180, y: 210 } },
        measured: { width: 280, height: 280 },
      };
    }
    return null;
  }),
  getIntersectingNodes: vi.fn(() => [state.nodes[0]]),
  getNodes: vi.fn(() => state.nodes),
};

const saveSnapshotMock = vi.fn();
const setNodesMock = vi.fn((updater: unknown) => {
  state.nodes =
    typeof updater === 'function'
      ? (updater as (nodes: typeof state.nodes) => typeof state.nodes)(
          state.nodes
        )
      : (updater as typeof state.nodes);
});

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => rfMock,
}));

vi.mock('@/lib/collision', () => ({
  applyRepulsion: applyRepulsionMock,
}));

vi.mock('@/store/canvasStore', () => {
  const useCanvasStore = (
    selector: (state: Record<string, unknown>) => unknown
  ) =>
    selector({
      setNodes: setNodesMock,
      saveSnapshot: saveSnapshotMock,
    });

  useCanvasStore.getState = () => ({
    nodes: state.nodes,
    setNodes: setNodesMock,
    saveSnapshot: saveSnapshotMock,
  });

  return { useCanvasStore };
});

const Harness = () => {
  const {
    dropTargetId,
    activeGroupId,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  } = useNodeDrag();

  return (
    <div>
      <button
        onClick={() => {
          onNodeDragStart(
            {} as never,
            {
              id: 'card-1',
              type: 'card',
              parentId: 'group-1',
              position: { x: 20, y: 30 },
              data: { title: 'Card', color: '#fff' },
            } as never,
            [] as never
          );
        }}
        type="button"
      >
        drag-start
      </button>
      <button
        onClick={() => {
          onNodeDrag(
            {} as never,
            {
              id: 'card-1',
              type: 'card',
              position: { x: 40, y: 60 },
              data: { title: 'Card', color: '#fff' },
              measured: { width: 350, height: 450 },
              style: { width: 350, height: 450 },
            } as never,
            [] as never
          );
        }}
        type="button"
      >
        dragging
      </button>
      <button
        onClick={() => {
          const liveNode = {
            id: 'card-1',
            type: 'card',
            position: { x: 900, y: 920 },
            data: { title: 'Card', color: '#fff' },
            measured: { width: 350, height: 450 },
            style: { width: 350, height: 450 },
          };
          onNodeDrag({} as never, liveNode as never, [liveNode] as never);
        }}
        type="button"
      >
        dragging-live-position
      </button>
      <button
        onClick={() => {
          onNodeDragStop(
            {} as never,
            {
              id: 'card-1',
              type: 'card',
              position: { x: 40, y: 60 },
              data: { title: 'Card', color: '#fff' },
              measured: { width: 350, height: 450 },
              style: { width: 350, height: 450 },
            } as never,
            [] as never
          );
        }}
        type="button"
      >
        drag-stop
      </button>
      <button
        onClick={() => {
          onNodeDragStop(
            {} as never,
            {
              id: 'group-2',
              type: 'group',
              position: { x: 300, y: 300 },
              data: { active: false },
            } as never,
            [] as never
          );
        }}
        type="button"
      >
        drag-stop-group
      </button>
      <button
        onClick={() => {
          onNodeDrag(
            {} as never,
            {
              id: 'group-1',
              type: 'group',
              position: { x: 110, y: 110 },
              data: { active: false },
            } as never,
            [] as never
          );
        }}
        type="button"
      >
        dragging-group
      </button>
      <button
        onClick={() => {
          onNodeDragStop(
            {} as never,
            {
              id: 'card-1',
              type: 'card',
              parentId: 'group-1',
              position: { x: 80, y: 90 },
              data: { title: 'Card', color: '#fff' },
              measured: { width: 350, height: 450 },
              style: { width: 350, height: 450 },
            } as never,
            [] as never
          );
        }}
        type="button"
      >
        drag-stop-card-to-group
      </button>
      <button
        onClick={() => {
          onNodeDragStop(
            {} as never,
            {
              id: 'sticky-1',
              type: 'sticky',
              position: { x: 180, y: 210 },
              data: { content: 'Sticky', color: '#FEF08A' },
              measured: { width: 280, height: 280 },
              style: { width: 280, height: 280 },
            } as never,
            [] as never
          );
        }}
        type="button"
      >
        drag-stop-missing-content
      </button>
      <button
        onClick={() => {
          onNodeDragStop(
            {} as never,
            {
              id: 'folder-1',
              type: 'folder',
              position: { x: 20, y: 20 },
              data: { title: 'Folder', children: [] },
              measured: { width: 280, height: 280 },
              style: { width: 280, height: 280 },
            } as never,
            [] as never
          );
        }}
        type="button"
      >
        drag-stop-folder
      </button>
      <button
        onClick={() => {
          onNodeDrag(
            {} as never,
            {
              id: 'folder-1',
              type: 'folder',
              position: { x: 40, y: 60 },
              data: { title: 'Folder', children: [] },
              measured: { width: 280, height: 280 },
              style: { width: 280, height: 280 },
            } as never,
            [] as never
          );
        }}
        type="button"
      >
        dragging-folder
      </button>
      <button
        onClick={() => {
          onNodeDragStart(
            {} as never,
            {
              id: 'folder-1',
              type: 'folder',
              parentId: 'group-1',
              position: { x: 20, y: 20 },
              data: { title: 'Folder', children: [] },
            } as never,
            [] as never
          );
        }}
        type="button"
      >
        drag-start-folder
      </button>
      <button
        onClick={() => {
          onNodeDragStart(
            {} as never,
            {
              id: 'group-1',
              type: 'group',
              position: { x: 100, y: 100 },
              data: { active: false },
            } as never,
            [] as never
          );
        }}
        type="button"
      >
        drag-start-group
      </button>
      <output aria-label="drop-target">{dropTargetId ?? 'none'}</output>
      <output aria-label="active-group">{activeGroupId ?? 'none'}</output>
    </div>
  );
};

describe('useNodeDrag', () => {
  it('detaches parented nodes and saves snapshot on drag start', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'drag-start' }));

    expect(saveSnapshotMock).toHaveBeenCalled();
    expect(state.nodes.find((node) => node.id === 'card-1')).toMatchObject({
      parentId: undefined,
      extent: undefined,
      position: { x: 140, y: 160 },
    });
    expect(screen.getByLabelText('active-group')).toHaveTextContent('none');
  });

  it('tracks active targets while dragging and nests into folder on stop', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'dragging' }));
    expect(screen.getByLabelText('drop-target')).toHaveTextContent('folder-1');
    expect(setNodesMock).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'drag-stop' }));

    expect(state.nodes.find((node) => node.id === 'card-1')).toBeUndefined();
    expect(state.nodes.find((node) => node.id === 'folder-1')).toMatchObject({
      data: {
        title: 'Folder',
        children: [
          {
            id: 'card-1',
            type: 'card',
            data: { title: 'Card', color: '#fff' },
          },
        ],
      },
    });
    expect(screen.getByLabelText('drop-target')).toHaveTextContent('none');
    expect(screen.getByLabelText('active-group')).toHaveTextContent('none');
  });
});

const initialNodes = () => [
  {
    id: 'group-1',
    type: 'group',
    position: { x: 100, y: 100 },
    data: { active: false },
    style: { width: 500, height: 300 },
  },
  {
    id: 'group-2',
    type: 'group',
    position: { x: 700, y: 100 },
    data: { active: false },
    style: { width: 500, height: 300 },
  },
  {
    id: 'folder-1',
    type: 'folder',
    position: { x: 20, y: 20 },
    data: { title: 'Folder', children: [] },
    measured: { width: 280, height: 280 },
    style: { width: 280, height: 280 },
  },
  {
    id: 'card-1',
    type: 'card',
    position: { x: 80, y: 90 },
    data: { title: 'Card', color: '#fff' },
    measured: { width: 350, height: 450 },
    style: { width: 350, height: 450 },
  },
];

describe('useNodeDrag – group and folder interactions', () => {
  beforeEach(() => {
    state.nodes = initialNodes() as typeof state.nodes;
    vi.clearAllMocks();
    rfMock.getInternalNode.mockImplementation((id: string) => {
      const node = state.nodes.find((n) => n.id === id);
      if (!node) {
        return null;
      }
      return {
        internals: { positionAbsolute: { ...node.position } },
        measured: { width: 500, height: 300 },
      };
    });
  });

  it('group cannot be dropped into another group', () => {
    rfMock.getIntersectingNodes.mockReturnValue([
      { id: 'group-1', type: 'group', position: { x: 100, y: 100 } } as never,
    ]);

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'drag-stop-group' }));

    const group2 = state.nodes.find((n) => n.id === 'group-2');
    expect(group2).toBeDefined();
    expect(group2?.parentId).toBeUndefined();
  });

  it('folder can be dropped into a group', () => {
    rfMock.getIntersectingNodes.mockReturnValue([
      { id: 'group-1', type: 'group', position: { x: 100, y: 100 } } as never,
    ]);

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'drag-stop-folder' }));

    const folder = state.nodes.find((n) => n.id === 'folder-1');
    expect(folder).toBeDefined();
    expect(folder?.parentId).toBe('group-1');
  });

  it('folder detaches from group on drag start', () => {
    state.nodes = state.nodes.map((n) =>
      n.id === 'folder-1'
        ? { ...n, parentId: 'group-1', extent: 'parent' as const }
        : n
    ) as typeof state.nodes;

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'drag-start-folder' }));

    const folder = state.nodes.find((n) => n.id === 'folder-1');
    expect(folder).toBeDefined();
    expect(folder?.parentId).toBeUndefined();
  });

  it('tracks a group as active while dragging a folder', () => {
    rfMock.getIntersectingNodes.mockReturnValue([
      { id: 'group-1', type: 'group', position: { x: 100, y: 100 } } as never,
    ]);

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'dragging-folder' }));

    expect(screen.getByLabelText('drop-target')).toHaveTextContent('none');
    expect(screen.getByLabelText('active-group')).toHaveTextContent('group-1');
    expect(state.nodes.find((node) => node.id === 'group-1')).toMatchObject({
      data: { active: true },
    });
  });

  it('uses the live dragged position for repulsion checks', () => {
    state.nodes = state.nodes.map((node) =>
      node.id === 'group-2' ? { ...node, selected: true } : node
    ) as typeof state.nodes;

    render(<Harness />);
    fireEvent.click(
      screen.getByRole('button', { name: 'dragging-live-position' })
    );

    const lastCall = applyRepulsionMock.mock.calls.at(-1);
    const params = lastCall?.[0] as {
      activeNodeIds: Set<string>;
      nodes: typeof state.nodes;
    };
    expect(params.nodes.find((n) => n.id === 'card-1')?.position).toEqual({
      x: 900,
      y: 920,
    });
    expect(params.activeNodeIds).toEqual(new Set(['card-1']));
  });

  it('keeps top-level group unchanged on drag start', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'drag-start-group' }));

    expect(saveSnapshotMock).toHaveBeenCalled();
    expect(state.nodes.find((node) => node.id === 'group-1')).toMatchObject({
      position: { x: 100, y: 100 },
      data: { active: false },
    });
  });

  it('clears active groups while dragging a group node', () => {
    state.nodes = state.nodes.map((node) =>
      node.type === 'group' ? { ...node, data: { active: true } } : node
    ) as typeof state.nodes;

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'dragging-group' }));

    expect(screen.getByLabelText('drop-target')).toHaveTextContent('none');
    expect(screen.getByLabelText('active-group')).toHaveTextContent('none');
    expect(state.nodes.filter((node) => node.type === 'group')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'group-1', data: { active: false } }),
        expect.objectContaining({ id: 'group-2', data: { active: false } }),
      ])
    );
  });

  it('drops a content node into a group when no folder overlaps', () => {
    rfMock.getIntersectingNodes.mockReturnValue([
      { id: 'group-1', type: 'group', position: { x: 100, y: 100 } } as never,
    ]);
    state.nodes = state.nodes.map((node) =>
      node.id === 'folder-1'
        ? { ...node, position: { x: 1000, y: 1000 } }
        : node
    ) as typeof state.nodes;

    render(<Harness />);
    fireEvent.click(
      screen.getByRole('button', { name: 'drag-stop-card-to-group' })
    );

    expect(state.nodes.find((node) => node.id === 'card-1')).toMatchObject({
      parentId: 'group-1',
      extent: 'parent',
      position: { x: -20, y: -10 },
    });
    expect(state.nodes.find((node) => node.id === 'group-1')).toMatchObject({
      data: { active: false },
    });
  });

  it('keeps nodes unchanged when folder drop target content is missing', () => {
    state.nodes = [
      {
        id: 'group-1',
        type: 'group',
        position: { x: 100, y: 100 },
        data: { active: false },
        style: { width: 500, height: 300 },
      },
      {
        id: 'folder-1',
        type: 'folder',
        position: { x: 20, y: 20 },
        data: { title: 'Folder', children: [] },
        measured: { width: 600, height: 600 },
        style: { width: 600, height: 600 },
      },
    ] as typeof state.nodes;

    render(<Harness />);
    fireEvent.click(
      screen.getByRole('button', { name: 'drag-stop-missing-content' })
    );

    expect(state.nodes.find((node) => node.id === 'folder-1')).toMatchObject({
      data: { title: 'Folder', children: [] },
    });
  });
});
