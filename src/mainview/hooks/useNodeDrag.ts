import type { Node, OnNodeDrag } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import { useCallback, useRef, useState } from 'react';

import { CARD_H, CARD_W, FOLDER_H, FOLDER_W } from '@/lib/canvasConstants';
import {
  isCanvasContentNode,
  isGroupChildNode,
} from '@/lib/canvasNodePredicates';
import { canAbsorbIntoFolder, sortNodesByParent } from '@/lib/canvasUtils';
import { applyRepulsion, type StoredOrigin } from '@/lib/collision';
import { useCanvasStore } from '@/store/canvasStore';

/**
 * "Content" here means a node that can be placed inside a Group or absorbed
 * into a Folder. Sourced from the canvas node registry via
 * `isCanvasContentNode`, so adding `asset` / `link` later flows through
 * automatically.
 */
const isContentNode = (node: Node) => isCanvasContentNode(node.type);

export function useNodeDrag() {
  const setNodes = useCanvasStore((s) => s.setNodes);
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const rf = useReactFlow();

  /** Original positions of nodes before they were pushed aside. */
  const pushedOriginsRef = useRef<Map<string, StoredOrigin>>(new Map());

  /** Find the folder whose bounds contain the dragged node's center. */
  const findOverlappingFolder = useCallback(
    (draggedNode: Node, allNodes: Node[]) => {
      if (!canAbsorbIntoFolder(draggedNode)) {
        return null;
      }
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
      // Detach from parent group if the node is a group child type
      if (!(node.parentId && isGroupChildNode(node.type))) {
        return;
      }
      const abs =
        rf.getInternalNode(node.id)?.internals.positionAbsolute ??
        node.position;
      setNodes((nds) =>
        sortNodesByParent(
          nds.map((n) => {
            if (n.type === 'group') {
              return { ...n, data: { ...n.data, active: false } };
            }
            if (n.id !== node.id) {
              return n;
            }
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
    (_, node, draggedNodes = []) => {
      const liveDraggedNodes = new Map<string, Node>();
      for (const draggedNode of draggedNodes) {
        liveDraggedNodes.set(draggedNode.id, draggedNode);
      }
      liveDraggedNodes.set(node.id, node);

      // --- Determine drop target ---
      let targetGroupId: string | null = null;
      let targetFolderId: string | null = null;

      // Content nodes (card/image/sticky) can go into groups or folders
      if (isContentNode(node)) {
        const group = rf
          .getIntersectingNodes(node)
          .find((n) => n.type === 'group');
        targetGroupId = group?.id ?? null;
        setNodes((nds) => {
          const folder = findOverlappingFolder(node, nds);
          targetFolderId = folder?.id || null;
          setDropTargetId(targetFolderId);
          return nds.map((n) =>
            n.type === 'group'
              ? { ...n, data: { ...n.data, active: n.id === targetGroupId } }
              : n
          );
        });
      }
      // Folders can go into groups but NOT into other folders
      else if (node.type === 'folder') {
        const group = rf
          .getIntersectingNodes(node)
          .find((n) => n.type === 'group');
        targetGroupId = group?.id ?? null;
        setDropTargetId(null);
        setNodes((nds) =>
          nds.map((n) =>
            n.type === 'group'
              ? { ...n, data: { ...n.data, active: n.id === targetGroupId } }
              : n
          )
        );
      }
      // Groups cannot go into anything
      else if (node.type === 'group') {
        setDropTargetId(null);
        setNodes((nds) =>
          nds.map((n) =>
            n.type === 'group'
              ? { ...n, data: { ...n.data, active: false } }
              : n
          )
        );
      }

      setActiveGroupId(targetGroupId);

      // --- Repulsion: push all overlapping nodes away ---
      // Exempt all potential drop-target containers so the dragged node can
      // approach and enter them without pushing them away.
      setNodes((nds) => {
        const exemptIds = new Set<string>();
        const hasReportedDraggedNodes = draggedNodes.length > 0;
        const nodesForRepulsion = nds.map((n) => {
          const draggedNode = liveDraggedNodes.get(n.id);
          if (!draggedNode) {
            return n;
          }
          return {
            ...n,
            parentId: draggedNode.parentId,
            extent: draggedNode.extent,
            measured: draggedNode.measured ?? n.measured,
            position: { ...draggedNode.position },
            style: draggedNode.style ?? n.style,
          };
        });

        const draggingIds = hasReportedDraggedNodes
          ? new Set(liveDraggedNodes.keys())
          : new Set(nds.filter((n) => n.selected).map((n) => n.id));
        if (!draggingIds.has(node.id)) {
          draggingIds.add(node.id);
        }

        // Content nodes can enter any group; only those absorbable by folders
        // (e.g. card/image but not sticky) are exempt from folder repulsion.
        if (isContentNode(node)) {
          const canEnterFolder = canAbsorbIntoFolder(node);
          for (const n of nds) {
            if (n.type === 'group') {
              exemptIds.add(n.id);
            } else if (n.type === 'folder' && canEnterFolder) {
              exemptIds.add(n.id);
            }
          }
        }
        // Folders can enter any group
        else if (node.type === 'folder') {
          for (const n of nds) {
            if (n.type === 'group') {
              exemptIds.add(n.id);
            }
          }
        }
        // Groups can't enter anything — no exemptions

        // Parents of any dragging node should not be pushed
        for (const id of draggingIds) {
          const dragging = nodesForRepulsion.find((n) => n.id === id);
          if (dragging?.parentId) {
            exemptIds.add(dragging.parentId);
          }
        }

        return applyRepulsion({
          nodes: nodesForRepulsion,
          activeNodeId: node.id,
          activeNodeIds: draggingIds,
          pushedOrigins: pushedOriginsRef.current,
          exemptIds,
          gap: 20,
        });
      });
    },
    [rf, setNodes, findOverlappingFolder]
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_, node) => {
      setDropTargetId(null);
      pushedOriginsRef.current.clear();

      if (isContentNode(node)) {
        setNodes((nds) => {
          // Check folder drop first
          const folder = findOverlappingFolder(node, nds);
          if (folder) {
            const cardNode = nds.find((n) => n.id === node.id);
            if (!cardNode) {
              return nds;
            }
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
                if (n.id !== folder.id) {
                  return n;
                }
                const d = n.data as any;
                const children = [...(d.children || []), childEntry];
                return {
                  ...n,
                  data: {
                    ...n.data,
                    children,
                  },
                };
              });
          }

          // Check group drop
          const targetGroup = rf
            .getIntersectingNodes(node)
            .find((n) => n.type === 'group');

          const updated = nds.map((n) => {
            if (n.id !== node.id) {
              if (n.type === 'group') {
                return { ...n, data: { ...n.data, active: false } };
              }
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

      // Folder can be dropped into a group
      if (node.type === 'folder') {
        setNodes((nds) => {
          const targetGroup = rf
            .getIntersectingNodes(node)
            .find((n) => n.type === 'group');

          const updated = nds.map((n) => {
            if (n.id !== node.id) {
              if (n.type === 'group') {
                return { ...n, data: { ...n.data, active: false } };
              }
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

      // Groups stay top-level — no nesting into other groups or folders
      if (node.type === 'group') {
        setNodes((nds) =>
          nds.map((n) =>
            n.type === 'group'
              ? { ...n, data: { ...n.data, active: false } }
              : n
          )
        );
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
