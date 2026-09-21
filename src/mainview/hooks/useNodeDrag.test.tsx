// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useNodeDrag } from '@/hooks/useNodeDrag';
import { buildTopicChildEdge } from '@/lib/topicTree';
import { createTopicData } from '../../shared/topic';

const applyDragRepulsionMock = vi.hoisted(() =>
  vi.fn(({ nodes }: { nodes: Node[] }) => nodes)
);

const state: { edges: Edge[]; nodes: Node[] } = {
  edges: [],
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

vi.mock('@/lib/repulsion', () => ({
  REPULSION_GAP: 20,
  applyDragRepulsion: applyDragRepulsionMock,
  captureRepulsionOrigins: (nodes: Node[]) => {
    const origins = new Map<string, { x: number; y: number }>();
    for (const node of nodes) {
      if (!node.parentId) {
        origins.set(node.id, { x: node.position.x, y: node.position.y });
      }
    }
    return origins;
  },
  pushNodeAwayFromObstacle: (
    node: { x: number; y: number; width: number; height: number },
    obs: { x: number; y: number; width: number; height: number },
    gap = 20
  ) => {
    // Real algorithm: push out along axis of minimum penetration.
    const dx = node.x + node.width / 2 - (obs.x + obs.width / 2);
    const dy = node.y + node.height / 2 - (obs.y + obs.height / 2);
    const px = (node.width + obs.width) / 2 + gap - Math.abs(dx);
    const py = (node.height + obs.height) / 2 + gap - Math.abs(dy);
    if (px <= 0.5 || py <= 0.5) {
      return { x: node.x, y: node.y };
    }
    if (px < py) {
      const sign = dx > 0 ? 1 : -1;
      return { x: node.x + px * sign, y: node.y };
    }
    const sign = dy > 0 ? 1 : -1;
    return { x: node.x, y: node.y + py * sign };
  },
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
    edges: state.edges,
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
    repelAnimationActive,
    rejectedFolderId,
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
              id: 'widget-1',
              type: 'widget',
              position: { x: 0, y: 0 },
              data: { widgetId: 'w1', kind: 'checklist' },
              measured: { width: 320, height: 340 },
              style: { width: 320, height: 340 },
            } as never,
            [] as never
          );
        }}
        type="button"
      >
        dragging-widget
      </button>
      <button
        onClick={() => {
          onNodeDragStop(
            {} as never,
            {
              id: 'widget-1',
              type: 'widget',
              position: { x: 0, y: 0 },
              data: { widgetId: 'w1', kind: 'checklist' },
              measured: { width: 320, height: 340 },
              style: { width: 320, height: 340 },
            } as never,
            [] as never
          );
        }}
        type="button"
      >
        drag-stop-widget
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
      <output aria-label="rejected-folder">{rejectedFolderId ?? 'none'}</output>
      <output aria-label="repel-anim">
        {repelAnimationActive ? 'on' : 'off'}
      </output>
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
    expect(screen.getByLabelText('repel-anim')).toHaveTextContent('on');
  });

  it('tracks active targets while dragging and nests into folder on stop', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'dragging' }));
    expect(screen.getByLabelText('drop-target')).toHaveTextContent('folder-1');
    expect(setNodesMock).toHaveBeenCalled();
    expect(state.nodes.find((node) => node.id === 'group-1')).toMatchObject({
      data: { active: true },
    });

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
    expect(state.nodes.find((node) => node.id === 'group-1')).toMatchObject({
      data: { active: false },
    });
    expect(screen.getByLabelText('drop-target')).toHaveTextContent('none');
    expect(screen.getByLabelText('active-group')).toHaveTextContent('none');
    expect(screen.getByLabelText('repel-anim')).toHaveTextContent('off');
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
    applyDragRepulsionMock.mockImplementation(({ nodes }) => nodes);
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

    // A folder can't be absorbed by another folder, but it can be nested into
    // a group - so the group acts as the drop target (driving z-index
    // elevation) as well as the active group (driving the highlight).
    expect(screen.getByLabelText('drop-target')).toHaveTextContent('group-1');
    expect(screen.getByLabelText('active-group')).toHaveTextContent('group-1');
    expect(state.nodes.find((node) => node.id === 'group-1')).toMatchObject({
      data: { active: true },
    });
  });

  it('passes store nodes, dragged ids and origins to the repulsion solver', () => {
    rfMock.getIntersectingNodes.mockReturnValue([] as never[]);

    render(<Harness />);
    fireEvent.click(
      screen.getByRole('button', { name: 'dragging-live-position' })
    );

    const lastCall = applyDragRepulsionMock.mock.calls.at(-1);
    const params = lastCall?.[0] as {
      activeIds: Set<string>;
      nodes: typeof state.nodes;
      origins: Map<string, { x: number; y: number }>;
      paused: boolean;
    };
    expect(params.activeIds).toEqual(new Set(['card-1']));
    // Store positions are authoritative (helper-line snapping already ran).
    expect(params.nodes.find((n) => n.id === 'card-1')?.position).toEqual({
      x: 80,
      y: 90,
    });
    expect(params.origins.get('card-1')).toEqual({ x: 80, y: 90 });
    expect(params.paused).toBe(false);
  });

  it('pauses repulsion while hovering a folder drop target', () => {
    rfMock.getIntersectingNodes.mockReturnValue([] as never[]);

    render(<Harness />);
    // card-1 at (40,60) has its center inside folder-1 → drop target active.
    fireEvent.click(screen.getByRole('button', { name: 'dragging' }));

    expect(screen.getByLabelText('drop-target')).toHaveTextContent('folder-1');
    const params = applyDragRepulsionMock.mock.calls.at(-1)?.[0] as unknown as {
      paused: boolean;
    };
    expect(params.paused).toBe(true);
  });

  it('pauses repulsion while hovering a group drop target', () => {
    rfMock.getIntersectingNodes.mockReturnValue([
      { id: 'group-1', type: 'group', position: { x: 100, y: 100 } } as never,
    ]);
    // Move the folder away so only the group is a candidate.
    state.nodes = state.nodes.map((node) =>
      node.id === 'folder-1'
        ? { ...node, position: { x: 2000, y: 2000 } }
        : node
    ) as typeof state.nodes;

    render(<Harness />);
    fireEvent.click(
      screen.getByRole('button', { name: 'dragging-live-position' })
    );

    const params = applyDragRepulsionMock.mock.calls.at(-1)?.[0] as unknown as {
      paused: boolean;
    };
    expect(params.paused).toBe(true);
  });

  it('rejects a widget dragged over a folder without absorbing it', () => {
    // widget-1 at (0,0) has its center inside folder-1 (20,20, 300x300).
    rfMock.getIntersectingNodes.mockReturnValue([] as never[]);

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'dragging-widget' }));

    // The folder is a reject target, not an absorb drop target.
    expect(screen.getByLabelText('rejected-folder')).toHaveTextContent(
      'folder-1'
    );
    expect(screen.getByLabelText('drop-target')).toHaveTextContent('none');
    // Repulsion is not paused (nothing is being absorbed).
    const params = applyDragRepulsionMock.mock.calls.at(-1)?.[0] as unknown as {
      paused: boolean;
    };
    expect(params.paused).toBe(false);
  });

  it('does not absorb a widget into a folder and pushes it out on drop stop', () => {
    rfMock.getIntersectingNodes.mockReturnValue([] as never[]);
    state.nodes = state.nodes.map((n) =>
      n.id === 'card-1'
        ? {
            id: 'widget-1',
            type: 'widget',
            position: { x: 0, y: 0 },
            data: { widgetId: 'w1', kind: 'checklist' },
            measured: { width: 320, height: 340 },
            style: { width: 320, height: 340 },
          }
        : n
    ) as typeof state.nodes;

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'drag-stop-widget' }));

    // widget stays top-level, folder keeps empty children.
    const widget = state.nodes.find((n) => n.id === 'widget-1');
    expect(widget).toBeDefined();
    expect(state.nodes.find((n) => n.id === 'folder-1')).toMatchObject({
      data: { title: 'Folder', children: [] },
    });
    expect(screen.getByLabelText('rejected-folder')).toHaveTextContent('none');
    // The widget (0,0, 320x340) overlapped folder-1 (20,20, 280x280) at drag
    // stop; it must be pushed out rather than settle inside.
    expect(widget?.position).toEqual({ x: 0, y: 320 });
  });

  it('restores pushed nodes to their origins when dropping into a folder', () => {
    rfMock.getIntersectingNodes.mockReturnValue([] as never[]);
    state.nodes = [
      ...initialNodes(),
      {
        id: 'card-2',
        type: 'card',
        position: { x: 600, y: 600 },
        data: { title: 'Neighbor', color: '#fff' },
        measured: { width: 350, height: 450 },
        style: { width: 350, height: 450 },
      },
    ] as typeof state.nodes;

    render(<Harness />);
    // First drag frame captures origins (card-2 at 600,600).
    fireEvent.click(screen.getByRole('button', { name: 'dragging' }));
    // Simulate card-2 having been pushed aside during the drag.
    state.nodes = state.nodes.map((node) =>
      node.id === 'card-2' ? { ...node, position: { x: 700, y: 700 } } : node
    ) as typeof state.nodes;

    // Drop into the folder → card absorbed, pushed neighbor restored.
    fireEvent.click(screen.getByRole('button', { name: 'drag-stop' }));

    expect(state.nodes.find((n) => n.id === 'card-1')).toBeUndefined();
    expect(state.nodes.find((n) => n.id === 'card-2')?.position).toEqual({
      x: 600,
      y: 600,
    });
  });

  it('keeps top-level group unchanged on drag start and skips repel animation', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'drag-start-group' }));

    expect(saveSnapshotMock).toHaveBeenCalled();
    expect(state.nodes.find((node) => node.id === 'group-1')).toMatchObject({
      position: { x: 100, y: 100 },
      data: { active: false },
    });
    expect(screen.getByLabelText('repel-anim')).toHaveTextContent('off');
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

describe('useNodeDrag — Topic branches', () => {
  /** parent → child → grandchild, all top-level. */
  function seedBranch(locked?: string) {
    state.edges = [
      buildTopicChildEdge('te-1', 'topic-parent', 'topic-child', 0),
      buildTopicChildEdge('te-2', 'topic-child', 'topic-grand', 0),
    ];
    state.nodes = [
      {
        data: { ...createTopicData('Parent') },
        id: 'topic-parent',
        position: { x: 0, y: 0 },
        style: { height: 40, width: 160 },
        type: 'topic',
      },
      {
        data: { ...createTopicData('Child'), locked: locked === 'topic-child' },
        id: 'topic-child',
        position: { x: 200, y: 0 },
        style: { height: 40, width: 160 },
        type: 'topic',
      },
      {
        data: { ...createTopicData('Grand'), locked: locked === 'topic-grand' },
        id: 'topic-grand',
        position: { x: 400, y: 0 },
        style: { height: 40, width: 160 },
        type: 'topic',
      },
    ];
  }

  function positionOf(id: string) {
    return state.nodes.find((n) => n.id === id)?.position;
  }

  /** Runs one gesture: grab `id`, move it to `to`, release. */
  const BranchHarness = ({
    id,
    to,
  }: {
    id: string;
    to: { x: number; y: number };
  }) => {
    const { onNodeDragStart, onNodeDrag, onNodeDragStop } = useNodeDrag();
    const live = () => {
      const node = state.nodes.find((n) => n.id === id) as Node;
      return { ...node, position: { ...node.position } };
    };
    return (
      <button
        onClick={() => {
          onNodeDragStart({} as never, live() as never, [] as never);
          // React Flow writes the grabbed node's new position into the store
          // before calling back, so the test does the same.
          state.nodes = state.nodes.map((n) =>
            n.id === id ? { ...n, position: to } : n
          );
          onNodeDrag({} as never, live() as never, [] as never);
          onNodeDragStop({} as never, live() as never, [] as never);
        }}
        type="button"
      >
        drag-branch
      </button>
    );
  };

  beforeEach(() => {
    rfMock.getIntersectingNodes.mockReturnValue([]);
    applyDragRepulsionMock.mockImplementation(({ nodes }) => nodes);
  });

  it('carries descendants along when a Topic is dragged', () => {
    seedBranch();
    render(<BranchHarness id="topic-parent" to={{ x: 50, y: 80 }} />);

    fireEvent.click(screen.getByText('drag-branch'));

    // The whole branch shifts by the same delta, so its internal layout is
    // untouched.
    expect(positionOf('topic-parent')).toEqual({ x: 50, y: 80 });
    expect(positionOf('topic-child')).toEqual({ x: 250, y: 80 });
    expect(positionOf('topic-grand')).toEqual({ x: 450, y: 80 });
  });

  it('leaves ancestors and siblings behind when a subtopic is dragged', () => {
    seedBranch();
    render(<BranchHarness id="topic-child" to={{ x: 200, y: 300 }} />);

    fireEvent.click(screen.getByText('drag-branch'));

    expect(positionOf('topic-parent')).toEqual({ x: 0, y: 0 });
    expect(positionOf('topic-child')).toEqual({ x: 200, y: 300 });
    expect(positionOf('topic-grand')).toEqual({ x: 400, y: 300 });
  });

  it('refuses the whole gesture when the branch contains a locked Topic', () => {
    seedBranch('topic-grand');
    render(<BranchHarness id="topic-parent" to={{ x: 50, y: 80 }} />);

    fireEvent.click(screen.getByText('drag-branch'));

    // Nothing moves: moving the unlocked part alone would tear the branch.
    expect(positionOf('topic-parent')).toEqual({ x: 0, y: 0 });
    expect(positionOf('topic-child')).toEqual({ x: 200, y: 0 });
    expect(positionOf('topic-grand')).toEqual({ x: 400, y: 0 });
  });

  it('moves the whole branch into a group when the ancestor is dropped in', () => {
    seedBranch();
    const group = {
      data: { active: false },
      id: 'group-topic',
      position: { x: 100, y: 100 },
      style: { height: 600, width: 900 },
      type: 'group',
    } as Node;
    state.nodes = [group, ...state.nodes];
    rfMock.getIntersectingNodes.mockReturnValue([group]);
    rfMock.getInternalNode.mockImplementation((id: string) => {
      if (id === 'group-topic') {
        return {
          internals: { positionAbsolute: { x: 100, y: 100 } },
          measured: { height: 600, width: 900 },
        };
      }
      const node = state.nodes.find((n) => n.id === id);
      return node
        ? {
            internals: { positionAbsolute: node.position },
            measured: { height: 40, width: 160 },
          }
        : null;
    });

    render(<BranchHarness id="topic-parent" to={{ x: 150, y: 150 }} />);
    fireEvent.click(screen.getByText('drag-branch'));

    // A tree lives in one container: every member is reparented, and the
    // group-relative coordinates preserve the branch's shape.
    for (const id of ['topic-parent', 'topic-child', 'topic-grand']) {
      expect(state.nodes.find((n) => n.id === id)?.parentId).toBe(
        'group-topic'
      );
    }
    expect(positionOf('topic-parent')).toEqual({ x: 50, y: 50 });
    expect(positionOf('topic-child')).toEqual({ x: 250, y: 50 });
    expect(positionOf('topic-grand')).toEqual({ x: 450, y: 50 });
  });
});
