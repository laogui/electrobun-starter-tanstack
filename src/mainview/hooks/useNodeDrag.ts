import type { Node, OnNodeDrag } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import { useCallback, useRef, useState } from 'react';

import {
  canAbsorbIntoFolder,
  GROUP_CHILD_TYPES,
  sortNodesByParent,
} from '@/lib/canvasUtils';
import {
  applyRepulsion,
  buildAbsoluteRects,
  getNodeSize,
  type StoredOrigin,
} from '@/lib/collision';
import { useCanvasStore } from '@/store/canvasStore';

/** Node types that can be placed inside a Group or absorbed into a Folder. */
const CONTENT_TYPES = new Set(['card', 'image', 'sticky']);
const isContentNode = (node: Node) => CONTENT_TYPES.has(node.type ?? '');

export function useNodeDrag() {
  const setNodes = useCanvasStore((s) => s.setNodes);
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const rf = useReactFlow();

  /** Original positions of nodes before they were pushed aside. */
  const pushedOriginsRef = useRef<Map<string, StoredOrigin>>(new Map());

  /** Find the folder whose bounds contain the dragged node's center.
   *  Uses absolute coordinates so nodes inside groups are compared correctly. */
  const findOverlappingFolder = useCallback(
    (draggedNode: Node, allNodes: Node[]) => {
      if (!canAbsorbIntoFolder(draggedNode)) {
        return null;
      }
      // Build absolute rects to handle nodes parented inside groups
      const absRects = buildAbsoluteRects(allNodes);
      const draggedSize = getNodeSize(draggedNode);

      // Use the live dragged position (which is already absolute after
      // onNodeDragStart detaches group children).
      const draggedRect = absRects.get(draggedNode.id);
      const dx = (draggedRect?.left ?? draggedNode.position.x) + draggedSize.width / 2;
      const dy = (draggedRect?.top ?? draggedNode.position.y) + draggedSize.height / 2;

      return (
        allNodes.find((n) => {
          if (n.type !== 'folder' || n.id === draggedNode.id) {
            return false;
          }
          const folderRect = absRects.get(n.id);
          if (!folderRect) {
            return false;
          }
          return (
            dx >= folderRect.left &&
            dx <= folderRect.right &&
            dy >= folderRect.top &&
            dy <= folderRect.bottom
          );
        }) || null
      );
    },
    []
  );

  const onNodeDragStart: OnNodeDrag = useCallback(
    (_, node) => {
      saveSnapshot();
      // Detach from parent group if the node is a group child type
      if (!(node.parentId && GROUP_CHILD_TYPES.has(node.type ?? ''))) {
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

      if (isContentNode(node) || node.type === 'folder') {
        const group = rf
          .getIntersectingNodes(node)
          .find((n) => n.type === 'group');
        targetGroupId = group?.id ?? null;
      }

      setActiveGroupId(targetGroupId);

      // --- Single atomic setNodes: drop-target highlighting + repulsion ---
      // Merging these into one call avoids intermediate inconsistent state
      // that could cause missed repulsion or stale node positions.
      setNodes((nds) => {
        // 1. Merge live drag positions into store nodes FIRST so that
        //    folder overlap and repulsion both see accurate coordinates.
        const hasReportedDraggedNodes = draggedNodes.length > 0;
        const nodesWithLivePositions = nds.map((n) => {
          const draggedNode = liveDraggedNodes.get(n.id);
          if (!draggedNode) {
            // Update group active state in the same pass
            if (n.type === 'group') {
              const shouldBeActive =
                node.type !== 'group' && n.id === targetGroupId;
              if ((n.data as any).active !== shouldBeActive) {
                return {
                  ...n,
                  data: { ...n.data, active: shouldBeActive },
                };
              }
            }
            return n;
          }
          // Merge live dragged position + update group active state
          const merged: Node = {
            ...n,
            parentId: draggedNode.parentId,
            extent: draggedNode.extent,
            measured: draggedNode.measured ?? n.measured,
            position: { ...draggedNode.position },
            style: draggedNode.style ?? n.style,
          };
          if (n.type === 'group') {
            const shouldBeActive =
              node.type !== 'group' && merged.id === targetGroupId;
            return {
              ...merged,
              data: { ...merged.data, active: shouldBeActive },
            };
          }
          return merged;
        });

        // 2. Determine folder drop target using merged positions
        let targetFolderId: string | null = null;
        if (isContentNode(node)) {
          // Find the dragged node with its live position for overlap check
          const liveNode = nodesWithLivePositions.find(
            (n) => n.id === node.id
          );
          const folder = findOverlappingFolder(
            liveNode ?? node,
            nodesWithLivePositions
          );
          targetFolderId = folder?.id || null;
        }
        setDropTargetId(targetFolderId);

        // 3. Build dragging ID set
        const draggingIds = hasReportedDraggedNodes
          ? new Set(liveDraggedNodes.keys())
          : new Set(nds.filter((n) => n.selected).map((n) => n.id));
        if (!draggingIds.has(node.id)) {
          draggingIds.add(node.id);
        }

        // 4. Build exempt IDs for repulsion
        const exemptIds = new Set<string>();

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
          const dragging = nodesWithLivePositions.find((n) => n.id === id);
          if (dragging?.parentId) {
            exemptIds.add(dragging.parentId);
          }
        }

        // 5. Apply repulsion
        return applyRepulsion({
          nodes: nodesWithLivePositions,
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

  /** Restore all previously pushed nodes to their original positions. */
  const restorePushedNodes = useCallback(
    (nds: Node[]): Node[] => {
      if (pushedOriginsRef.current.size === 0) {
        return nds;
      }
      const result = nds.map((n) => {
        const orig = pushedOriginsRef.current.get(n.id);
        if (!orig) {
          return n;
        }
        return { ...n, position: { ...orig.position } };
      });
      pushedOriginsRef.current.clear();
      return result;
    },
    []
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_, node) => {
      setDropTargetId(null);

      if (isContentNode(node)) {
        setNodes((nds) => {
          // Check folder drop first
          const folder = findOverlappingFolder(node, nds);
          if (folder) {
            const cardNode = nds.find((n) => n.id === node.id);
            if (!cardNode) {
              pushedOriginsRef.current.clear();
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
            // Card absorbed into folder: restore pushed nodes since the
            // source of repulsion (the dragged card) is being removed.
            const restored = restorePushedNodes(nds);
            return restored
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
                    title: `${children.length} items`,
                  },
                };
              });
          }

          // Check group drop
          const targetGroup = rf
            .getIntersectingNodes(node)
            .find((n) => n.type === 'group');

          // Clear pushed origins — pushed nodes stay at their new positions
          // because the dragged node is now placed near them.
          pushedOriginsRef.current.clear();

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
        pushedOriginsRef.current.clear();
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
        pushedOriginsRef.current.clear();
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
    [rf, setNodes, findOverlappingFolder, restorePushedNodes]
  );

  return {
    dropTargetId,
    activeGroupId,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  };
}
