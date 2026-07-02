import type { Node, OnNodeDrag } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import { useCallback, useRef, useState } from 'react';
import {
  isCanvasContentNode,
  isGroupChildNode,
} from '@/lib/canvasNodePredicates';
import { CARD_H, CARD_W, FOLDER_H, FOLDER_W } from '@/lib/canvasNodeRegistry';
import { canAbsorbIntoFolder, sortNodesByParent } from '@/lib/canvasUtils';
import type { Point } from '@/lib/collision';
import {
  applyDragRepulsion,
  captureRepulsionOrigins,
  REPULSION_GAP,
} from '@/lib/repulsion';
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
  /** True while dragging a single content/folder node — drives the CSS class
   *  that animates repelled neighbors. Group drags are excluded because their
   *  children re-render each frame and would visibly lag inside the group;
   *  multi-select drags are excluded because only the grabbed node carries
   *  React Flow's `.dragging` class (the transition opt-out). */
  const [repelAnimationActive, setRepelAnimationActive] = useState(false);
  const rf = useReactFlow();

  /**
   * Top-level node positions captured on the first drag frame of a gesture.
   * The repulsion solver re-solves from these origins on every frame, which
   * keeps results path-independent and lets pushed nodes flow back to their
   * spot when the pressure is gone. `null` means "capture on next frame".
   */
  const originsRef = useRef<Map<string, Point> | null>(null);

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

  /** Restore every pushed (non-dragged) node to its gesture-start origin.
   *  Used when the dragged node is absorbed by a folder/group: the canvas
   *  space it was going to occupy is no longer needed. */
  const restorePushedNodes = useCallback(
    (nds: Node[], excludeIds: Set<string>): Node[] => {
      const origins = originsRef.current;
      if (!origins) {
        return nds;
      }
      return nds.map((n) => {
        if (n.parentId || excludeIds.has(n.id)) {
          return n;
        }
        const origin = origins.get(n.id);
        if (
          !origin ||
          (origin.x === n.position.x && origin.y === n.position.y)
        ) {
          return n;
        }
        return { ...n, position: { x: origin.x, y: origin.y } };
      });
    },
    []
  );

  const onNodeDragStart: OnNodeDrag = useCallback(
    (_, node, draggedNodes = []) => {
      saveSnapshot();
      originsRef.current = null;
      const draggingGroup =
        node.type === 'group' || draggedNodes.some((n) => n.type === 'group');
      setRepelAnimationActive(!draggingGroup && draggedNodes.length <= 1);
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
      // --- Determine drop target ---
      let targetGroupId: string | null = null;
      let targetFolderId: string | null = null;

      // Content nodes (card/image/sticky) can go into groups or folders
      if (isContentNode(node)) {
        const group = rf
          .getIntersectingNodes(node)
          .find((n) => n.type === 'group');
        targetGroupId = group?.id ?? null;
        const folder = findOverlappingFolder(
          node,
          useCanvasStore.getState().nodes
        );
        targetFolderId = folder?.id || null;
        setDropTargetId(targetFolderId);
      }
      // Folders can go into groups but NOT into other folders
      else if (node.type === 'folder') {
        const group = rf
          .getIntersectingNodes(node)
          .find((n) => n.type === 'group');
        targetGroupId = group?.id ?? null;
        setDropTargetId(null);
      }
      // Groups cannot go into anything
      else if (node.type === 'group') {
        setDropTargetId(null);
      }

      setActiveGroupId(targetGroupId);

      // While hovering a container the node is about to enter, repulsion is
      // paused: nothing should be shoved aside for space the node won't use,
      // and previously pushed nodes flow back to their origins.
      const paused = targetGroupId !== null || targetFolderId !== null;

      setNodes((nds) => {
        // Capture gesture-start origins lazily on the first drag frame. Only
        // the dragged node has moved at this point, and it is exempt from
        // origin-based solving anyway.
        originsRef.current ??= captureRepulsionOrigins(nds);

        // Group drop-target highlighting (clone only on actual flag changes).
        const highlighted = nds.map((n) => {
          if (n.type !== 'group') {
            return n;
          }
          const nextActive = n.id === targetGroupId;
          if (Boolean(n.data.active) === nextActive) {
            return n;
          }
          return { ...n, data: { ...n.data, active: nextActive } };
        });

        // The dragged node ids. React Flow reports them via the third
        // callback arg; fall back to the current selection when absent.
        const draggingIds = new Set<string>();
        if (draggedNodes.length > 0) {
          for (const draggedNode of draggedNodes) {
            draggingIds.add(draggedNode.id);
          }
        } else {
          for (const n of highlighted) {
            if (n.selected) {
              draggingIds.add(n.id);
            }
          }
        }
        draggingIds.add(node.id);

        // Positions in the store are already live: React Flow dispatches the
        // position changes (including helper-line snapping) synchronously
        // before this callback runs.
        return applyDragRepulsion({
          nodes: highlighted,
          activeIds: draggingIds,
          origins: originsRef.current,
          paused,
          gap: REPULSION_GAP,
        });
      });
    },
    [rf, setNodes, findOverlappingFolder]
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_, node, draggedNodes = []) => {
      setDropTargetId(null);
      setRepelAnimationActive(false);

      const draggingIds = new Set<string>(draggedNodes.map((n) => n.id));
      draggingIds.add(node.id);

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
            const nextNodes: Node[] = [];
            for (const n of restorePushedNodes(nds, draggingIds)) {
              if (n.id === node.id) {
                continue;
              }
              if (n.id !== folder.id) {
                nextNodes.push(n);
                continue;
              }
              const d = n.data as any;
              const children = [...(d.children || []), childEntry];
              nextNodes.push({
                ...n,
                data: {
                  ...n.data,
                  children,
                },
              });
            }
            return nextNodes;
          }

          // Check group drop
          const targetGroup = rf
            .getIntersectingNodes(node)
            .find((n) => n.type === 'group');

          const base = targetGroup ? restorePushedNodes(nds, draggingIds) : nds;
          const updated = base.map((n) => {
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
        originsRef.current = null;
        return;
      }

      // Folder can be dropped into a group
      if (node.type === 'folder') {
        setNodes((nds) => {
          const targetGroup = rf
            .getIntersectingNodes(node)
            .find((n) => n.type === 'group');

          const base = targetGroup ? restorePushedNodes(nds, draggingIds) : nds;
          const updated = base.map((n) => {
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
        originsRef.current = null;
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
      originsRef.current = null;
    },
    [rf, setNodes, findOverlappingFolder, restorePushedNodes]
  );

  return {
    dropTargetId,
    activeGroupId,
    repelAnimationActive,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  };
}
