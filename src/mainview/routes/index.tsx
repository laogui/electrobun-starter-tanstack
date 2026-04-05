import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createFileRoute } from "@tanstack/react-router";
import { ReactFlow, Background, MiniMap, applyNodeChanges, applyEdgeChanges, addEdge, ConnectionMode, useReactFlow, ReactFlowProvider, type ReactFlowInstance } from '@xyflow/react';
import type { NodeChange, NodePositionChange, Node, Connection, Edge, OnNodeDrag } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AnimatePresence } from 'motion/react';
import CardNode from '@/components/canvas/nodes/CardNode';
import FolderNode from '@/components/canvas/nodes/FolderNode';
import GroupNode from '@/components/canvas/nodes/GroupNode';
import { FocusedView } from '@/components/canvas/FocusedView';
import { FolderView } from '@/components/canvas/FolderView';
import { CreateMenu } from '@/components/canvas/CreateMenu';
import { HelperLines } from '@/components/canvas/HelperLines';
import { CanvasContextMenu, type ContextMenuState } from '@/components/canvas/ContextMenu';
import { CanvasUpdateProvider } from '@/components/canvas/CanvasContext';
import { initialNodes } from '@/data/initialNodes';
import { getHelperLines } from '@/lib/getHelperLines';
import { nanoid } from 'nanoid';

export const Route = createFileRoute("/")({
  component: CanvasRoute,
});

const GROUP_COLORS = ['blue', 'green', 'yellow', 'pink', 'orange'] as const;

const nodeTypes = {
  card: CardNode,
  folder: FolderNode,
  group: GroupNode,
};

/** Sort nodes so parents always appear before children (React Flow requirement) */
function sortNodesByParent(nodes: Node[]): Node[] {
  const sorted: Node[] = [];
  const remaining = [...nodes];
  const placed = new Set<string>();

  // First pass: place all nodes without parentId
  for (let i = remaining.length - 1; i >= 0; i--) {
    if (!remaining[i]!.parentId) {
      placed.add(remaining[i]!.id);
      sorted.push(remaining[i]!);
      remaining.splice(i, 1);
    }
  }

  // Iteratively place nodes whose parent is already placed
  let safety = remaining.length + 1;
  while (remaining.length > 0 && safety-- > 0) {
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (placed.has(remaining[i]!.parentId!)) {
        placed.add(remaining[i]!.id);
        sorted.push(remaining[i]!);
        remaining.splice(i, 1);
      }
    }
  }

  // Append any orphans (broken parentId)
  sorted.push(...remaining);
  return sorted;
}

/** Check if potentialDescendantId is a descendant of ancestorId */
function isDescendant(nodes: Node[], ancestorId: string, potentialDescendantId: string): boolean {
  const parentMap = new Map<string, string>();
  for (const n of nodes) {
    if (n.parentId) parentMap.set(n.id, n.parentId);
  }
  const visited = new Set<string>();
  let current = potentialDescendantId;
  while (parentMap.has(current)) {
    if (visited.has(current)) break;
    visited.add(current);
    current = parentMap.get(current)!;
    if (current === ancestorId) return true;
  }
  return false;
}

function CanvasComponent() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState<Edge[]>([]);
  
  const [focusedNode, setFocusedNode] = useState<any>(null);
  const [focusedFolder, setFocusedFolder] = useState<any>(null);
  const [helperLineH, setHelperLineH] = useState<number | undefined>();
  const [helperLineV, setHelperLineV] = useState<number | undefined>();
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const rfInstance = useRef<ReactFlowInstance<any, any> | null>(null);
  const rf = useReactFlow();
  let nodeIdCounter = useRef(100);

  const CARD_W = 350, CARD_H = 450, FOLDER_W = 350, FOLDER_H = 350;

  const updateNodeData = useCallback(
    (nodeId: string, updates: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n,
        ),
      );
    },
    [setNodes],
  );

  const findOverlappingFolder = useCallback((draggedNode: Node, allNodes: typeof nodes) => {
    if (draggedNode.type !== 'card') return null;
    const dx = draggedNode.position.x + CARD_W / 2;
    const dy = draggedNode.position.y + CARD_H / 2;
    return allNodes.find(n =>
      n.type === 'folder' &&
      n.id !== draggedNode.id &&
      dx >= n.position.x && dx <= n.position.x + (n.measured?.width ?? (n.style?.width as number) ?? FOLDER_W) &&
      dy >= n.position.y && dy <= n.position.y + (n.measured?.height ?? (n.style?.height as number) ?? FOLDER_H)
    ) || null;
  }, []);

  // --- Three-phase group drag handlers (ported from mind-map-weaver) ---

  const onNodeDragStart: OnNodeDrag = useCallback(
    (_, node) => {
      // When dragging a card/group out of a parent group, detach it
      if ((node.type !== 'card' && node.type !== 'group') || !node.parentId) return;
      const abs = rf.getInternalNode(node.id)?.internals.positionAbsolute ?? node.position;
      setNodes((nds) =>
        sortNodesByParent(nds.map((n) => {
          if (n.type === 'group') return { ...n, data: { ...n.data, active: false } };
          if (n.id !== node.id) return n;
          return { ...n, parentId: undefined, extent: undefined, position: abs };
        })),
      );
      setActiveGroupId(null);
    },
    [rf, setNodes],
  );

  const onNodeDrag: OnNodeDrag = useCallback(
    (_, node) => {
      // Card: detect overlap with groups and folders
      if (node.type === 'card') {
        const group = rf.getIntersectingNodes(node).find((n) => n.type === 'group');
        setActiveGroupId(group?.id ?? null);
        setNodes((nds) => {
          // Also check for folder overlap
          const folder = findOverlappingFolder(node, nds);
          setDropTargetId(folder?.id || null);
          return nds.map((n) =>
            n.type === 'group' ? { ...n, data: { ...n.data, active: n.id === group?.id } } : n,
          );
        });
        return;
      }

      // Group dragging: highlight valid target groups (exclude self & descendants)
      // and push away non-child cards
      if (node.type === 'group') {
        const currentNodes = rf.getNodes();
        const targetGroup = rf
          .getIntersectingNodes(node)
          .find(
            (n) =>
              n.type === 'group' &&
              n.id !== node.id &&
              !isDescendant(currentNodes, node.id, n.id),
          );
        setActiveGroupId(targetGroup?.id ?? null);
        setNodes((nds) =>
          nds.map((n) =>
            n.type === 'group'
              ? { ...n, data: { ...n.data, active: n.id === targetGroup?.id } }
              : n,
          ),
        );

        // Push away non-child cards
        const PADDING = 20;
        const intersecting = rf
          .getIntersectingNodes(node)
          .filter((n) => n.type === 'card' && n.parentId !== node.id);

        if (intersecting.length === 0) return;

        const groupInternal = rf.getInternalNode(node.id);
        if (!groupInternal) return;

        const gx = groupInternal.internals.positionAbsolute.x;
        const gy = groupInternal.internals.positionAbsolute.y;
        const gw = groupInternal.measured.width ?? 760;
        const gh = groupInternal.measured.height ?? 380;

        // Collect other groups' bounding boxes for overlap checking
        const otherGroups = rf.getNodes().filter(
          (n) => n.type === 'group' && n.id !== node.id
        ).map((n) => {
          const internal = rf.getInternalNode(n.id);
          if (!internal) return null;
          return {
            x: internal.internals.positionAbsolute.x,
            y: internal.internals.positionAbsolute.y,
            w: internal.measured.width ?? 760,
            h: internal.measured.height ?? 380,
          };
        }).filter(Boolean) as { x: number; y: number; w: number; h: number }[];

        const overlapsAnyGroup = (rx: number, ry: number, rw: number, rh: number) =>
          otherGroups.some(
            (g) => rx < g.x + g.w && rx + rw > g.x && ry < g.y + g.h && ry + rh > g.y,
          );

        setNodes((nds) =>
          nds.map((n) => {
            if (!intersecting.some((i) => i.id === n.id)) return n;
            const cardInternal = rf.getInternalNode(n.id);
            if (!cardInternal) return n;

            const cx = cardInternal.internals.positionAbsolute.x;
            const cy = cardInternal.internals.positionAbsolute.y;
            const cw = cardInternal.measured.width ?? 240;
            const ch = cardInternal.measured.height ?? 80;

            const dx = (cx + cw / 2) - (gx + gw / 2);
            const dy = (cy + ch / 2) - (gy + gh / 2);

            let newAbsX = cx;
            let newAbsY = cy;

            if (Math.abs(dx / gw) > Math.abs(dy / gh)) {
              newAbsX = dx > 0 ? gx + gw + PADDING : gx - cw - PADDING;
            } else {
              newAbsY = dy > 0 ? gy + gh + PADDING : gy - ch - PADDING;
            }

            // If new position would overlap another group, don't move
            if (overlapsAnyGroup(newAbsX, newAbsY, cw, ch)) {
              return n;
            }

            if (n.parentId) {
              const parentInternal = rf.getInternalNode(n.parentId);
              if (parentInternal) {
                newAbsX -= parentInternal.internals.positionAbsolute.x;
                newAbsY -= parentInternal.internals.positionAbsolute.y;
              }
            }

            return { ...n, position: { x: newAbsX, y: newAbsY } };
          }),
        );
      }
    },
    [rf, setNodes, findOverlappingFolder],
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_, node) => {
      setDropTargetId(null);

      if (node.type === 'card') {
        // First check: drop into folder (existing behavior)
        setNodes(nds => {
          const folder = findOverlappingFolder(node, nds);
          if (folder) {
            const cardNode = nds.find(n => n.id === node.id);
            if (!cardNode) return nds;
            const { isHidden: _, isDropTarget: __, ...cleanData } = cardNode.data as any;
            const childEntry = { id: cardNode.id, type: 'card' as const, data: cleanData };
            return nds
              .filter(n => n.id !== node.id)
              .map(n => {
                if (n.id !== folder.id) return n;
                const d = n.data as any;
                const children = [...(d.children || []), childEntry];
                return { ...n, data: { ...n.data, children, title: `${children.length} items` } };
              });
          }

          // Second check: drop into group
          const targetGroup = rf
            .getIntersectingNodes(node)
            .find((n) => n.type === 'group');

          const updated = nds.map((n) => {
            if (n.id !== node.id) {
              if (n.type === 'group') return { ...n, data: { ...n.data, active: false } };
              return n;
            }
            const abs = rf.getInternalNode(node.id)?.internals.positionAbsolute ?? node.position;
            if (targetGroup) {
              const groupAbs = rf.getInternalNode(targetGroup.id)?.internals.positionAbsolute ?? targetGroup.position;
              return {
                ...n,
                parentId: targetGroup.id,
                extent: 'parent' as const,
                position: { x: abs.x - groupAbs.x, y: abs.y - groupAbs.y },
              };
            }
            return { ...n, parentId: undefined, extent: undefined, position: abs };
          });
          return sortNodesByParent(updated);
        });
        setActiveGroupId(null);
        return;
      }

      if (node.type === 'group') {
        setNodes((nds) => {
          const targetGroup = rf
            .getIntersectingNodes(node)
            .filter(
              (n) =>
                n.type === 'group' &&
                n.id !== node.id &&
                !isDescendant(nds, node.id, n.id),
            )[0];

          const updated = nds.map((n) => {
            if (n.id !== node.id) {
              if (n.type === 'group') return { ...n, data: { ...n.data, active: false } };
              return n;
            }
            const abs = rf.getInternalNode(node.id)?.internals.positionAbsolute ?? node.position;
            if (targetGroup) {
              const groupAbs = rf.getInternalNode(targetGroup.id)?.internals.positionAbsolute ?? targetGroup.position;
              return {
                ...n,
                parentId: targetGroup.id,
                position: { x: abs.x - groupAbs.x, y: abs.y - groupAbs.y },
              };
            }
            return { ...n, parentId: undefined, extent: undefined, position: abs };
          });
          return sortNodesByParent(updated);
        });
        setActiveGroupId(null);
      }
    },
    [rf, setNodes, findOverlappingFolder],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const positionChange = changes.find(
        (c): c is NodePositionChange => c.type === 'position' && c.dragging === true
      );

      if (positionChange?.position) {
        setNodes((nds) => {
          const { horizontal, vertical, snapPosition } = getHelperLines(positionChange, nds);
          setHelperLineH(horizontal);
          setHelperLineV(vertical);

          if (snapPosition.x !== undefined) {
            positionChange.position!.x = snapPosition.x;
          }
          if (snapPosition.y !== undefined) {
            positionChange.position!.y = snapPosition.y;
          }

          return applyNodeChanges(changes, nds);
        });
      } else {
        setHelperLineH(undefined);
        setHelperLineV(undefined);
        setNodes((nds) => applyNodeChanges(changes, nds));
      }
    },
    []
  );

  const onEdgesChange = useCallback(
    (changes: any) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, type: 'smoothstep' }, eds)),
    []
  );

  const onNodeDoubleClick = useCallback((_: any, node: Node) => {
    const el = document.querySelector(`[data-id="${node.id}"]`);
    const rect = el?.getBoundingClientRect();
    if (!rect) return;
    if (node.type === 'folder') {
      setFocusedFolder({ id: node.id, data: node.data, rect });
    } else {
      setFocusedNode({ id: node.id, data: node.data, rect });
    }
  }, []);

  const nodesWithState = useMemo(() => {
    return nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        isHidden: (focusedNode?.id === node.id) || (focusedFolder?.id === node.id),
        isDropTarget: dropTargetId === node.id
      }
    }));
  }, [nodes, focusedNode, focusedFolder, dropTargetId]);

  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const clipboardRef = useRef<any[]>([]);

  const onCreateNode = useCallback((type: 'card' | 'folder' | 'group') => {
    const id = `new-${++nodeIdCounter.current}`;
    const viewport = rfInstance.current?.getViewport();
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const zoom = viewport?.zoom ?? 1;

    if (type === 'group') {
      const flowX = ((cx - (viewport?.x ?? 0)) / zoom) - 250;
      const flowY = ((cy - (viewport?.y ?? 0)) / zoom) - 150;
      const color = GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
      setNodes(nds => [...nds, {
        id,
        type: 'group',
        position: { x: flowX, y: flowY },
        style: { width: 500, height: 300 },
        data: { label: 'New Group', color },
      }]);
      return;
    }

    const flowX = ((cx - (viewport?.x ?? 0)) / zoom) - (type === 'card' ? CARD_W : FOLDER_W) / 2;
    const flowY = ((cy - (viewport?.y ?? 0)) / zoom) - (type === 'card' ? CARD_H : FOLDER_H) / 2;

    const newNode: any = type === 'card'
      ? {
          id,
          type: 'card',
          position: { x: flowX, y: flowY },
          style: { width: CARD_W, height: CARD_H },
          data: { type: 'text', title: '', content: '', color: 'bg-white' },
        }
      : {
          id,
          type: 'folder',
          position: { x: flowX, y: flowY },
          data: { title: '0 items', subtitle: '', children: [] },
        };

    setNodes(nds => [...nds, newNode]);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const isModal = () => focusedNode || focusedFolder;
    const isEditing = () => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement)?.isContentEditable;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Escape: close focused/folder view
      if (e.key === 'Escape') {
        if (focusedNode) { setFocusedNode(null); return; }
        if (focusedFolder) { setFocusedFolder(null); return; }
        return;
      }

      // Block canvas-level shortcuts in modal or editing state
      if (isModal() || isEditing()) return;

      // Delete/Backspace: delete selected nodes and connected edges
      if (e.key === 'Delete' || e.key === 'Backspace') {
        setNodes(nds => {
          const selectedIds = new Set(nds.filter(n => n.selected).map(n => n.id));
          if (selectedIds.size === 0) return nds;
          setEdges(eds => eds.filter(e => !selectedIds.has(e.source) && !selectedIds.has(e.target)));
          // Detach children of deleted groups before removing
          return nds
            .filter(n => !n.selected)
            .map(n => n.parentId && selectedIds.has(n.parentId) ? { ...n, parentId: undefined, extent: undefined } : n);
        });
        return;
      }

      // Cmd+A: select all
      if (mod && e.key === 'a') {
        e.preventDefault();
        setNodes(nds => nds.map(n => ({ ...n, selected: true })));
        return;
      }

      // Cmd+C: copy selected nodes
      if (mod && e.key === 'c') {
        setNodes(nds => {
          const selected = nds.filter(n => n.selected);
          if (selected.length > 0) {
            clipboardRef.current = selected.map(n => {
              const { isHidden, isDropTarget, ...cleanData } = n.data as any;
              return { ...n, data: cleanData };
            });
          }
          return nds;
        });
        return;
      }

      // Cmd+V: paste copied nodes (offset by 30px)
      if (mod && e.key === 'v') {
        if (clipboardRef.current.length === 0) return;
        e.preventDefault();
        const offset = 30;
        const newNodes = clipboardRef.current.map(n => ({
          ...n,
          id: `paste-${nanoid(8)}`,
          position: { x: n.position.x + offset, y: n.position.y + offset },
          selected: true,
        }));
        setNodes(nds => [
          ...nds.map(n => ({ ...n, selected: false })),
          ...newNodes,
        ]);
        return;
      }

      // Cmd+N: open create menu
      if (mod && e.key === 'n') {
        e.preventDefault();
        setCreateMenuOpen(prev => !prev);
        return;
      }

      // Enter: open focused view for single selected node
      if (e.key === 'Enter') {
        setNodes(nds => {
          const selected = nds.filter(n => n.selected);
          if (selected.length !== 1) return nds;
          const node = selected[0]!;
          const el = document.querySelector(`[data-id="${node.id}"]`);
          const rect = el?.getBoundingClientRect();
          if (!rect) return nds;
          if (node.type === 'folder') {
            setFocusedFolder({ id: node.id, data: node.data, rect });
          } else {
            setFocusedNode({ id: node.id, data: node.data, rect });
          }
          return nds;
        });
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedNode, focusedFolder]);

  const onPaneContextMenu = useCallback((e: MouseEvent | React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, target: 'canvas' });
  }, []);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      target: node.type === 'folder' ? 'folder' : node.type === 'group' ? 'group' : 'card',
      nodeId: node.id,
    });
  }, []);

  const handleContextMenuAction = useCallback((action: string, nodeId?: string) => {
    const viewport = rfInstance.current?.getViewport();

    const screenToFlow = (sx: number, sy: number) => {
      const zoom = viewport?.zoom ?? 1;
      return {
        x: (sx - (viewport?.x ?? 0)) / zoom,
        y: (sy - (viewport?.y ?? 0)) / zoom,
      };
    };

    switch (action) {
      case 'new-note': {
        const pos = contextMenu ? screenToFlow(contextMenu.x, contextMenu.y) : screenToFlow(window.innerWidth / 2, window.innerHeight / 2);
        const id = `new-${++nodeIdCounter.current}`;
        setNodes(nds => [...nds, {
          id,
          type: 'card' as const,
          position: pos,
          data: { type: 'text' as const, title: '', content: '', color: 'bg-white' },
        }]);
        break;
      }
      case 'new-folder': {
        const pos = contextMenu ? screenToFlow(contextMenu.x, contextMenu.y) : screenToFlow(window.innerWidth / 2, window.innerHeight / 2);
        const id = `new-${++nodeIdCounter.current}`;
        setNodes(nds => [...nds, {
          id,
          type: 'folder' as const,
          position: pos,
          style: { width: 350, height: 350 },
          data: { title: '0 items', subtitle: '', children: [] },
        }]);
        break;
      }
      case 'new-group': {
        const pos = contextMenu ? screenToFlow(contextMenu.x, contextMenu.y) : screenToFlow(window.innerWidth / 2, window.innerHeight / 2);
        const id = `new-${++nodeIdCounter.current}`;
        const color = GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
        setNodes(nds => [...nds, {
          id,
          type: 'group' as const,
          position: pos,
          style: { width: 500, height: 300 },
          data: { label: 'New Group', color },
        }]);
        break;
      }
      case 'paste': {
        if (clipboardRef.current.length === 0) return;
        const offset = 30;
        const newNodes = clipboardRef.current.map(n => ({
          ...n,
          id: `paste-${nanoid(8)}`,
          position: { x: n.position.x + offset, y: n.position.y + offset },
          selected: true,
        }));
        setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), ...newNodes]);
        break;
      }
      case 'reset-zoom':
        rfInstance.current?.zoomTo(1, { duration: 300 });
        break;
      case 'focus':
        if (nodeId) {
          const el = document.querySelector(`[data-id="${nodeId}"]`);
          const rect = el?.getBoundingClientRect();
          if (!rect) return;
          setNodes(nds => {
            const node = nds.find(n => n.id === nodeId);
            if (node) setFocusedNode({ id: nodeId, data: node.data, rect });
            return nds;
          });
        }
        break;
      case 'open-folder':
        if (nodeId) {
          const el = document.querySelector(`[data-id="${nodeId}"]`);
          const rect = el?.getBoundingClientRect();
          if (!rect) return;
          setNodes(nds => {
            const node = nds.find(n => n.id === nodeId);
            if (node) setFocusedFolder({ id: nodeId, data: node.data, rect });
            return nds;
          });
        }
        break;
      case 'copy':
        if (nodeId) {
          setNodes(nds => {
            const node = nds.find(n => n.id === nodeId);
            if (node) {
              const { isHidden, isDropTarget, ...cleanData } = node.data as any;
              clipboardRef.current = [{ ...node, data: cleanData }];
            }
            return nds;
          });
        }
        break;
      case 'delete':
        if (nodeId) {
          setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
          setNodes(nds => {
            // When deleting a group, detach children first
            const deletedNode = nds.find(n => n.id === nodeId);
            if (deletedNode?.type === 'group') {
              return nds
                .filter(n => n.id !== nodeId)
                .map(n => n.parentId === nodeId ? { ...n, parentId: undefined, extent: undefined } : n);
            }
            return nds.filter(n => n.id !== nodeId);
          });
        }
        break;
      case 'change-color':
        if (nodeId) {
          setNodes(nds => nds.map(n => {
            if (n.id !== nodeId) return n;
            if (n.type === 'group') {
              const currentIdx = GROUP_COLORS.indexOf((n.data as any).color ?? 'blue');
              const nextColor = GROUP_COLORS[(currentIdx + 1) % GROUP_COLORS.length];
              return { ...n, data: { ...n.data, color: nextColor } };
            }
            const colors = ['bg-white', 'bg-[#FDF2F8]', 'bg-[#EAF2B8]', 'bg-[#DBEAFE]', 'bg-[#FEF3C7]', 'bg-[#E0E7FF]'];
            const currentIdx = colors.indexOf((n.data as any).color ?? 'bg-white');
            const nextColor = colors[(currentIdx + 1) % colors.length];
            return { ...n, data: { ...n.data, color: nextColor } };
          }));
        }
        break;
      case 'new-child':
        if (nodeId) {
          const childId = `child-${nanoid(8)}`;
          setNodes(nds => nds.map(n => {
            if (n.id !== nodeId) return n;
            const children = [...((n.data as any).children || []), {
              id: childId,
              type: 'card' as const,
              data: { type: 'text' as const, title: '', content: '', color: 'bg-white' },
            }];
            return { ...n, data: { ...n.data, children, title: `${children.length} items` } };
          }));
        }
        break;
    }
  }, [contextMenu]);

  return (
    <div className="w-screen h-screen bg-stone-50 font-sans overflow-hidden">
      <CanvasUpdateProvider value={updateNodeData}>
        <ReactFlow
          nodes={nodesWithState}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={onNodeDoubleClick}
          defaultEdgeOptions={{ type: 'smoothstep', animated: false }}
          connectionMode={ConnectionMode.Loose}
          onPaneContextMenu={onPaneContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onInit={(instance) => { rfInstance.current = instance; }}
          nodeTypes={nodeTypes}
          panOnScroll={true}
          selectionOnDrag={false}
          zoomOnPinch={true}
          minZoom={0.1}
          maxZoom={4}
          proOptions={{ hideAttribution: true }}
          fitView
        >
          <Background color="#ddd" gap={24} size={2} />
          <HelperLines horizontal={helperLineH} vertical={helperLineV} />
          <MiniMap
            position="bottom-right"
            nodeStrokeColor="#999"
            nodeColor="#ddd"
            maskColor="rgba(240, 239, 237, 0.7)"
            style={{ borderRadius: 8 }}
            pannable
            zoomable
          />
        </ReactFlow>
      </CanvasUpdateProvider>

      <AnimatePresence>
        {focusedFolder && (
          <FolderView
            folder={focusedFolder}
            onClose={() => setFocusedFolder(null)}
            onCardDoubleClick={(child: any, rect: any) => {
              setFocusedNode({ id: child.id, data: child.data, rect });
            }}
          />
        )}
        {focusedNode && (
          <FocusedView
            node={focusedNode}
            onClose={() => setFocusedNode(null)}
          />
        )}
      </AnimatePresence>

      <CreateMenu onCreateNode={onCreateNode} open={createMenuOpen} setOpen={setCreateMenuOpen} />
      <CanvasContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
        onAction={handleContextMenuAction}
      />
    </div>
  );
}

function CanvasRoute() {
  return (
    <ReactFlowProvider>
      <CanvasComponent />
    </ReactFlowProvider>
  );
}
