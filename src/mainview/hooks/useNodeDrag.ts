import { useReactFlow } from '@xyflow/react';
import type { Node, OnNodeDrag } from '@xyflow/react';
import { useCallback, useRef, useState } from 'react';

import { CARD_H, CARD_W, FOLDER_H, FOLDER_W } from '@/lib/canvasConstants';
import { isDescendant, sortNodesByParent } from '@/lib/canvasUtils';
import { useCanvasStore } from '@/store/canvasStore';

/** Node types that can be placed inside a Group or Folder (i.e. content nodes). */
const CONTENT_TYPES = new Set(['card', 'image', 'sticky']);
const isContentNode = (node: Node) => CONTENT_TYPES.has(node.type ?? '');

export function useNodeDrag() {
  const setNodes = useCanvasStore((s) => s.setNodes);
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const rf = useReactFlow();

  /** Original positions of cards before they were pushed aside by a dragging group. */
  const originalPositionsRef = useRef<Map<string, { x: number; y: number }>>(
    new Map()
  );

  const findOverlappingFolder = useCallback(
    (draggedNode: Node, allNodes: Array<Node>) => {
      if (!isContentNode(draggedNode)) return null;
      const nodeW =
        (draggedNode.measured?.width ?? (draggedNode.style?.width as number)) ||
        CARD_W;
      const nodeH =
        (draggedNode.measured?.height ??
          (draggedNode.style?.height as number)) ||
        CARD_H;
      const dx = draggedNode.position.x + nodeW / 2;
      const dy = draggedNode.position.y + nodeH / 2;
      return (
        allNodes.find(
          (n) =>
            n.type === 'folder' &&
            n.id !== draggedNode.id &&
            dx >= n.position.x &&
            dx <=
              n.position.x +
                (n.measured?.width ?? (n.style?.width as number) ?? FOLDER_W) &&
            dy >= n.position.y &&
            dy <=
              n.position.y +
                (n.measured?.height ?? (n.style?.height as number) ?? FOLDER_H)
        ) || null
      );
    },
    []
  );

  const onNodeDragStart: OnNodeDrag = useCallback(
    (_, node) => {
      saveSnapshot();
      if ((!isContentNode(node) && node.type !== 'group') || !node.parentId)
        return;
      const abs =
        rf.getInternalNode(node.id)?.internals.positionAbsolute ??
        node.position;
      setNodes((nds) =>
        sortNodesByParent(
          nds.map((n) => {
            if (n.type === 'group')
              return { ...n, data: { ...n.data, active: false } };
            if (n.id !== node.id) return n;
            return {
              ...n,
              parentId: undefined,
              extent: undefined,
              position: abs,
            };
          })
        )
      );
      setActiveGroupId(null);
    },
    [rf, setNodes, saveSnapshot]
  );

  const onNodeDrag: OnNodeDrag = useCallback(
    (_, node) => {
      if (isContentNode(node)) {
        const group = rf
          .getIntersectingNodes(node)
          .find((n) => n.type === 'group');
        setActiveGroupId(group?.id ?? null);
        setNodes((nds) => {
          const folder = findOverlappingFolder(node, nds);
          setDropTargetId(folder?.id || null);
          return nds.map((n) =>
            n.type === 'group'
              ? { ...n, data: { ...n.data, active: n.id === group?.id } }
              : n
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
              !isDescendant(currentNodes, node.id, n.id)
          );
        setActiveGroupId(targetGroup?.id ?? null);
        setNodes((nds) =>
          nds.map((n) =>
            n.type === 'group'
              ? { ...n, data: { ...n.data, active: n.id === targetGroup?.id } }
              : n
          )
        );

        const PADDING = 20;
        const savedPositions = originalPositionsRef.current;

        const groupInternal = rf.getInternalNode(node.id);
        if (!groupInternal) return;

        const gx = groupInternal.internals.positionAbsolute.x;
        const gy = groupInternal.internals.positionAbsolute.y;
        const gw = groupInternal.measured.width ?? 760;
        const gh = groupInternal.measured.height ?? 380;

        // Check overlap between a rect and the dragging group
        const overlapsGroup = (
          rx: number,
          ry: number,
          rw: number,
          rh: number
        ) => rx < gx + gw && rx + rw > gx && ry < gy + gh && ry + rh > gy;

        const otherGroups = rf
          .getNodes()
          .filter((n) => n.type === 'group' && n.id !== node.id)
          .map((n) => {
            const internal = rf.getInternalNode(n.id);
            if (!internal) return null;
            return {
              x: internal.internals.positionAbsolute.x,
              y: internal.internals.positionAbsolute.y,
              w: internal.measured.width ?? 760,
              h: internal.measured.height ?? 380,
            };
          })
          .filter(Boolean);

        const overlapsAnyGroup = (
          rx: number,
          ry: number,
          rw: number,
          rh: number
        ) =>
          otherGroups.some(
            (g) =>
              rx < g.x + g.w && rx + rw > g.x && ry < g.y + g.h && ry + rh > g.y
          );

        setNodes((nds) =>
          nds.map((n) => {
            if (!isContentNode(n) || n.parentId === node.id) return n;

            const cardInternal = rf.getInternalNode(n.id);
            if (!cardInternal) return n;

            const cw = cardInternal.measured.width ?? 240;
            const ch = cardInternal.measured.height ?? 80;

            // Use original position for overlap test to avoid flicker
            const origPos = savedPositions.get(n.id);
            let origAbsX: number;
            let origAbsY: number;

            if (origPos) {
              // Card was previously pushed — test against its original position
              if (n.parentId) {
                const parentInternal = rf.getInternalNode(n.parentId);
                if (parentInternal) {
                  origAbsX =
                    origPos.x + parentInternal.internals.positionAbsolute.x;
                  origAbsY =
                    origPos.y + parentInternal.internals.positionAbsolute.y;
                } else {
                  origAbsX = origPos.x;
                  origAbsY = origPos.y;
                }
              } else {
                origAbsX = origPos.x;
                origAbsY = origPos.y;
              }
            } else {
              origAbsX = cardInternal.internals.positionAbsolute.x;
              origAbsY = cardInternal.internals.positionAbsolute.y;
            }

            const stillOverlaps = overlapsGroup(origAbsX, origAbsY, cw, ch);

            if (!stillOverlaps) {
              // Group moved away — restore to original position
              if (origPos) {
                savedPositions.delete(n.id);
                return { ...n, position: { ...origPos } };
              }
              return n;
            }

            // Card's original position overlaps group — push it aside
            if (!savedPositions.has(n.id)) {
              savedPositions.set(n.id, { ...n.position });
            }

            const ddx = origAbsX + cw / 2 - (gx + gw / 2);
            const ddy = origAbsY + ch / 2 - (gy + gh / 2);

            let newAbsX = origAbsX;
            let newAbsY = origAbsY;

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
          })
        );
      }
    },
    [rf, setNodes, findOverlappingFolder]
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_, node) => {
      setDropTargetId(null);
      originalPositionsRef.current.clear();

      if (isContentNode(node)) {
        setNodes((nds) => {
          const folder = findOverlappingFolder(node, nds);
          if (folder) {
            const cardNode = nds.find((n) => n.id === node.id);
            if (!cardNode) return nds;
            const {
              isHidden: _,
              isDropTarget: __,
              ...cleanData
            } = cardNode.data as any;
            const childEntry = {
              id: cardNode.id,
              type: cardNode.type ?? 'card',
              data: cleanData,
            };
            return nds
              .filter((n) => n.id !== node.id)
              .map((n) => {
                if (n.id !== folder.id) return n;
                const d = n.data as any;
                const children = [...(d.children || []), childEntry];
                return {
                  ...n,
                  data: {
                    ...n.data,
                    children,
                    title: `${children.length} items`,
                  },
                };
              });
          }

          const targetGroup = rf
            .getIntersectingNodes(node)
            .find((n) => n.type === 'group');

          const updated = nds.map((n) => {
            if (n.id !== node.id) {
              if (n.type === 'group')
                return { ...n, data: { ...n.data, active: false } };
              return n;
            }
            const abs =
              rf.getInternalNode(node.id)?.internals.positionAbsolute ??
              node.position;
            if (targetGroup) {
              const groupAbs =
                rf.getInternalNode(targetGroup.id)?.internals
                  .positionAbsolute ?? targetGroup.position;
              return {
                ...n,
                parentId: targetGroup.id,
                extent: 'parent' as const,
                position: { x: abs.x - groupAbs.x, y: abs.y - groupAbs.y },
              };
            }
            return {
              ...n,
              parentId: undefined,
              extent: undefined,
              position: abs,
            };
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
            .find(
              (n) =>
                n.type === 'group' &&
                n.id !== node.id &&
                !isDescendant(nds, node.id, n.id)
            );

          const updated = nds.map((n) => {
            if (n.id !== node.id) {
              if (n.type === 'group')
                return { ...n, data: { ...n.data, active: false } };
              return n;
            }
            const abs =
              rf.getInternalNode(node.id)?.internals.positionAbsolute ??
              node.position;
            if (targetGroup) {
              const groupAbs =
                rf.getInternalNode(targetGroup.id)?.internals
                  .positionAbsolute ?? targetGroup.position;
              return {
                ...n,
                parentId: targetGroup.id,
                position: { x: abs.x - groupAbs.x, y: abs.y - groupAbs.y },
              };
            }
            return {
              ...n,
              parentId: undefined,
              extent: undefined,
              position: abs,
            };
          });
          return sortNodesByParent(updated);
        });
        setActiveGroupId(null);
      }
    },
    [rf, setNodes, findOverlappingFolder]
  );

  return {
    dropTargetId,
    activeGroupId,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  };
}
