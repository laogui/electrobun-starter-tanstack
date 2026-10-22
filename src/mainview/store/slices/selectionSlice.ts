import type { Node } from '@xyflow/react';
import type { StateCreator } from 'zustand';
import { isGroupChildNode } from '@/lib/canvasNodePredicates';
import { buildNewNodeSpec } from '@/lib/canvasNodeRegistry';
import { sortNodesByParent } from '@/lib/canvasUtils';
import { buildAbsoluteRects, getNodeSize } from '@/lib/collision';
import { markNodesEntering } from '@/lib/motion';
import { topicCommandContextForNodes } from '../canvas/topicCommandContext';
import type { CanvasState } from '../canvasStore';

const GROUP_SELECTION_PADDING = 24;

export interface SelectionSlice {
  deselectAll: () => void;
  groupSelected: () => void;
  selectNodeInDirection: (
    direction: 'down' | 'left' | 'right' | 'up',
    options?: { extend?: boolean }
  ) => Node | null;

  ungroupSelected: () => void;
}

export const createSelectionSlice: StateCreator<
  CanvasState,
  [],
  [],
  SelectionSlice
> = (set, get) => ({
  deselectAll: () => {
    set((s) => ({
      edges: s.edges.map((edge) =>
        edge.selected ? { ...edge, selected: false } : edge
      ),
      nodes: s.nodes.map((node) =>
        node.selected ? { ...node, selected: false } : node
      ),
      topicCommandContextId: null,
    }));
  },

  selectNodeInDirection: (direction, options) => {
    const { nodes } = get();
    const selectableNodes = nodes.filter(
      (node) => !(node.data as Record<string, unknown>).detached
    );
    if (selectableNodes.length === 0) {
      return null;
    }
    const absoluteRects = buildAbsoluteRects(selectableNodes);
    const centerOf = (node: Node) => {
      const rect = absoluteRects.get(node.id);
      if (rect) {
        return {
          x: (rect.left + rect.right) / 2,
          y: (rect.top + rect.bottom) / 2,
        };
      }
      const size = getNodeSize(node);
      return {
        x: node.position.x + size.width / 2,
        y: node.position.y + size.height / 2,
      };
    };

    const selectedNodes = selectableNodes.filter((node) => node.selected);
    const compareExtendAnchor = (a: Node, b: Node): number => {
      const ac = centerOf(a);
      const bc = centerOf(b);
      if (direction === 'right') {
        return bc.x - ac.x || ac.y - bc.y || a.id.localeCompare(b.id);
      }
      if (direction === 'left') {
        return ac.x - bc.x || ac.y - bc.y || a.id.localeCompare(b.id);
      }
      if (direction === 'down') {
        return bc.y - ac.y || ac.x - bc.x || a.id.localeCompare(b.id);
      }
      return ac.y - bc.y || ac.x - bc.x || a.id.localeCompare(b.id);
    };
    const pickExtendAnchor = () => {
      if (selectedNodes.length === 0) {
        return selectableNodes[0]!;
      }
      let best = selectedNodes[0]!;
      for (const node of selectedNodes.slice(1)) {
        if (compareExtendAnchor(node, best) < 0) {
          best = node;
        }
      }
      return best;
    };

    const current =
      options?.extend === true
        ? pickExtendAnchor()
        : (selectedNodes[0] ?? selectableNodes[0]!);
    const currentCenter = centerOf(current);
    const candidates: Array<{
      node: Node;
      primary: number;
      secondary: number;
    }> = [];
    for (const node of selectableNodes) {
      if (node.id === current.id) {
        continue;
      }
      const center = centerOf(node);
      const dx = center.x - currentCenter.x;
      const dy = center.y - currentCenter.y;
      const primary =
        direction === 'right'
          ? dx
          : direction === 'left'
            ? -dx
            : direction === 'down'
              ? dy
              : -dy;
      if (primary <= 0) {
        continue;
      }
      const secondary =
        direction === 'left' || direction === 'right'
          ? Math.abs(dy)
          : Math.abs(dx);
      candidates.push({ node, primary, secondary });
    }
    candidates.sort(
      (a, b) =>
        a.primary - b.primary ||
        a.secondary - b.secondary ||
        a.node.id.localeCompare(b.node.id)
    );

    const target = candidates[0]?.node ?? current;
    set((s) => {
      const nodes = s.nodes.map((node) => ({
        ...node,
        selected:
          options?.extend === true
            ? Boolean(node.selected || node.id === target.id)
            : node.id === target.id,
      }));
      return {
        nodes,
        topicCommandContextId: topicCommandContextForNodes(
          s.nodes,
          nodes,
          s.topicCommandContextId
        ),
      };
    });
    return target;
  },

  groupSelected: () => {
    const { nodes } = get();
    const selected = nodes.filter(
      (node) => node.selected && isGroupChildNode(node.type)
    );
    if (selected.length === 0) {
      return;
    }
    const absoluteRects = buildAbsoluteRects(nodes);
    const rects = selected
      .map((node) => absoluteRects.get(node.id))
      .filter((rect) => rect !== undefined);
    if (rects.length === 0) {
      return;
    }

    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    const groupPosition = {
      x: left - GROUP_SELECTION_PADDING,
      y: top - GROUP_SELECTION_PADDING,
    };
    const groupWidth = right - left + GROUP_SELECTION_PADDING * 2;
    const groupHeight = bottom - top + GROUP_SELECTION_PADDING * 2;
    const groupSpec = buildNewNodeSpec('group');
    const groupId = get().nextNodeId();
    const groupNode: Node = {
      ...groupSpec.base,
      id: groupId,
      position: groupPosition,
      selected: true,
      style: {
        ...groupSpec.base.style,
        width: groupWidth,
        height: groupHeight,
      },
    };
    const selectedIds = new Set(selected.map((node) => node.id));

    get().saveSnapshot();
    markNodesEntering([groupId]);
    set((s) => ({
      nodes: sortNodesByParent([
        ...s.nodes.map((node) => {
          if (!selectedIds.has(node.id)) {
            return { ...node, selected: false };
          }
          const rect = absoluteRects.get(node.id);
          const { parentId: _parentId, extent: _extent, ...rest } = node as any;
          return {
            ...rest,
            parentId: groupId,
            extent: 'parent' as const,
            position: {
              x: (rect?.left ?? node.position.x) - groupPosition.x,
              y: (rect?.top ?? node.position.y) - groupPosition.y,
            },
            selected: false,
          } as Node;
        }),
        groupNode,
      ]),
    }));
  },

  ungroupSelected: () => {
    const { nodes } = get();
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const selected = nodes.filter((node) => node.selected);
    const selectedGroupIds = new Set<string>();
    const selectedChildIds = new Set<string>();
    for (const node of selected) {
      if (node.type === 'group') {
        selectedGroupIds.add(node.id);
        continue;
      }
      const parent = node.parentId ? byId.get(node.parentId) : null;
      if (parent?.type === 'group') {
        selectedChildIds.add(node.id);
      }
    }

    if (selectedGroupIds.size === 0 && selectedChildIds.size === 0) {
      return;
    }

    const absoluteRects = buildAbsoluteRects(nodes);
    get().saveSnapshot();
    set((s) => {
      const detachIds = new Set(selectedChildIds);
      for (const node of s.nodes) {
        if (node.parentId && selectedGroupIds.has(node.parentId)) {
          detachIds.add(node.id);
        }
      }
      return {
        edges: s.edges.filter(
          (edge) =>
            !(
              selectedGroupIds.has(edge.source) ||
              selectedGroupIds.has(edge.target)
            )
        ),
        nodes: sortNodesByParent(
          s.nodes.flatMap((node) => {
            if (selectedGroupIds.has(node.id)) {
              return [];
            }
            if (!detachIds.has(node.id)) {
              return [{ ...node, selected: false }];
            }
            const rect = absoluteRects.get(node.id);
            const {
              parentId: _parentId,
              extent: _extent,
              ...rest
            } = node as any;
            return [
              {
                ...rest,
                position: {
                  x: rect?.left ?? node.position.x,
                  y: rect?.top ?? node.position.y,
                },
                selected: true,
              } as Node,
            ];
          })
        ),
      };
    });
  },
});
