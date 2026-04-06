import { useState, useCallback } from 'react';
import { useReactFlow, type Node } from '@xyflow/react';
import type { OnNodeDrag } from '@xyflow/react';
import { sortNodesByParent, isDescendant } from '@/lib/canvasUtils';
import { CARD_W, CARD_H, FOLDER_W, FOLDER_H } from '@/lib/canvasConstants';
import { useCanvasStore } from '@/store/canvasStore';

export function useNodeDrag() {
  const setNodes = useCanvasStore((s) => s.setNodes);
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const rf = useReactFlow();

  const findOverlappingFolder = useCallback((draggedNode: Node, allNodes: Node[]) => {
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

  const onNodeDragStart: OnNodeDrag = useCallback(
    (_, node) => {
      saveSnapshot();
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
    [rf, setNodes, saveSnapshot],
  );

  const onNodeDrag: OnNodeDrag = useCallback(
    (_, node) => {
      if (node.type === 'card') {
        const group = rf.getIntersectingNodes(node).find((n) => n.type === 'group');
        setActiveGroupId(group?.id ?? null);
        setNodes((nds) => {
          const folder = findOverlappingFolder(node, nds);
          setDropTargetId(folder?.id || null);
          return nds.map((n) =>
            n.type === 'group' ? { ...n, data: { ...n.data, active: n.id === group?.id } } : n,
          );
        });
        return;
      }

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

            const ddx = (cx + cw / 2) - (gx + gw / 2);
            const ddy = (cy + ch / 2) - (gy + gh / 2);

            let newAbsX = cx;
            let newAbsY = cy;

            if (Math.abs(ddx / gw) > Math.abs(ddy / gh)) {
              newAbsX = ddx > 0 ? gx + gw + PADDING : gx - cw - PADDING;
            } else {
              newAbsY = ddy > 0 ? gy + gh + PADDING : gy - ch - PADDING;
            }

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

  return {
    dropTargetId,
    activeGroupId,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  };
}
