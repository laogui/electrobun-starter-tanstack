import type { Node, OnNodeDrag } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import { useCallback, useRef, useState } from 'react';
import {
  isCanvasContentNode,
  isGroupChildNode,
  isRejectedFolderChildNode,
} from '@/lib/canvasNodePredicates';
import { CARD_H, CARD_W, FOLDER_H, FOLDER_W } from '@/lib/canvasNodeRegistry';
import { canAbsorbIntoFolder, sortNodesByParent } from '@/lib/canvasUtils';
import type { Point } from '@/lib/collision';
import {
  applyDragRepulsion,
  captureRepulsionOrigins,
  pushNodeAwayFromObstacle,
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

/** Resolve a node's live width/height for overlap math. */
function nodeSize(node: Node): { width: number; height: number } {
  const width =
    (node.measured?.width ?? (node.style?.width as number)) || CARD_W;
  const height =
    (node.measured?.height ?? (node.style?.height as number)) || CARD_H;
  return { width, height };
}

/**
 * Push every dragged node out of the rejected folder so the cursor cannot pull
 * an un-placeable node (widget, sticky, folder, group) through it. Returns a
 * new node array with the pushed positions applied; other nodes are untouched.
 * The folder is an immovable obstacle, so only the dragged nodes move.
 */
export function pushDraggedNodesOutOfFolder(
  nodes: Node[],
  draggedIds: Set<string>,
  folderId: string
): Node[] {
  const folder = nodes.find((n) => n.id === folderId);
  if (!folder) {
    return nodes;
  }
  const folderSize = nodeSize(folder);
  const obstacle = {
    x: folder.position.x,
    y: folder.position.y,
    width: folderSize.width,
    height: folderSize.height,
  };
  return nodes.map((n) => {
    if (!draggedIds.has(n.id)) {
      return n;
    }
    const size = nodeSize(n);
    const pos = pushNodeAwayFromObstacle(
      {
        x: n.position.x,
        y: n.position.y,
        width: size.width,
        height: size.height,
      },
      obstacle
    );
    if (pos.x === n.position.x && pos.y === n.position.y) {
      return n;
    }
    return { ...n, position: pos };
  });
}

function getDraggingNodeIds(node: Node, draggedNodes: Node[]): string[] {
  const ids = new Set<string>();
  for (const draggedNode of draggedNodes) {
    ids.add(draggedNode.id);
  }
  ids.add(node.id);
  return [...ids];
}

export function useNodeDrag() {
  const setNodes = useCanvasStore((s) => s.setNodes);
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  /** Folder the dragged node overlaps but is not allowed to enter (widgets,
   *  sticky, groups, other folders). Drives the red "reject" highlight. */
  const [rejectedFolderId, setRejectedFolderId] = useState<string | null>(null);
  const [draggingNodeIds, setDraggingNodeIds] = useState<string[]>([]);
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
      return findAnyOverlappingFolder(draggedNode, allNodes);
    },
    []
  );

  /** Like {@link findOverlappingFolder} but ignores absorbability, so callers
   *  can detect a folder the dragged node overlaps even when it must be
   *  visually rejected (widgets, sticky, folders, groups). */
  const findAnyOverlappingFolder = useCallback(
    (draggedNode: Node, allNodes: Node[]) => {
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
      setRejectedFolderId(null);
      setDraggingNodeIds(getDraggingNodeIds(node, draggedNodes));
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
      let rejectedFolderId = null;

      // Content nodes (card/image/sticky/widgets) can go into groups or
      // folders. Widgets and sticky cannot enter a folder, so when one of them
      // overlaps a folder it is rejected (red highlight) rather than absorbed.
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
        if (!targetFolderId && isRejectedFolderChildNode(node.type)) {
          rejectedFolderId = findAnyOverlappingFolder(
            node,
            useCanvasStore.getState().nodes
          )?.id ?? null;
        }
        // Folder takes precedence (matches onNodeDragStop ordering); when no
        // folder is under the cursor, the group acts as the drop target so the
        // dragged card is elevated above the group like it is above a folder.
        setDropTargetId(targetFolderId ?? targetGroupId);
      }
      // Folders can go into groups but NOT into other folders
      else if (node.type === 'folder') {
        const group = rf
          .getIntersectingNodes(node)
          .find((n) => n.type === 'group');
        targetGroupId = group?.id ?? null;
        // Elevate the dragged folder above the group it is about to enter.
        setDropTargetId(targetGroupId);
        // A folder dragged over another folder is rejected, not absorbed.
        rejectedFolderId = findAnyOverlappingFolder(
          node,
          useCanvasStore.getState().nodes
        )?.id ?? null;
      }
      // Groups cannot go into anything
      else if (node.type === 'group') {
        setDropTargetId(null);
        rejectedFolderId = findAnyOverlappingFolder(
          node,
          useCanvasStore.getState().nodes
        )?.id ?? null;
      } else {
        // Unknown node types: no drop target, no rejection.
        setDropTargetId(null);
      }
      setRejectedFolderId(rejectedFolderId);

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
        const repelled = applyDragRepulsion({
          nodes: highlighted,
          activeIds: draggingIds,
          origins: originsRef.current,
          paused,
          gap: REPULSION_GAP,
        });
        // When the dragged node cannot enter the folder it overlaps (widget,
        // sticky, folder, group), push it out so the folder reads as a hard
        // wall the cursor cannot pull it through — on top of the red reject
        // highlight. Repulsion would otherwise re-overlap the folder, so this
        // runs last and wins.
        if (rejectedFolderId) {
          return pushDraggedNodesOutOfFolder(
            repelled,
            draggingIds,
            rejectedFolderId
          );
        }
        return repelled;
      });
    },
    [rf, setNodes, findOverlappingFolder, findAnyOverlappingFolder]
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_, node, draggedNodes = []) => {
      setDropTargetId(null);
      setRejectedFolderId(null);
      setRepelAnimationActive(false);
      setDraggingNodeIds([]);

      const draggingIds = new Set<string>(draggedNodes.map((n) => n.id));
      draggingIds.add(node.id);

      // At drag stop React Flow snaps the store back to the pointer position,
      // which may sit on top of a folder the node cannot enter. Re-derive the
      // rejected folder and push the dragged node out so it doesn't settle
      // inside the folder.
      const rejectedFolderId = isRejectedFolderChildNode(node.type)
        ? (findAnyOverlappingFolder(
            node,
            useCanvasStore.getState().nodes
          )?.id ?? null)
        : null;
      const applyRejectPush = (nds: Node[]) =>
        rejectedFolderId
          ? pushDraggedNodesOutOfFolder(nds, draggingIds, rejectedFolderId)
          : nds;

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
          return applyRejectPush(sortNodesByParent(updated));
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
          return applyRejectPush(sortNodesByParent(updated));
        });
        setActiveGroupId(null);
        originsRef.current = null;
        return;
      }

      // Groups stay top-level — no nesting into other groups or folders
      if (node.type === 'group') {
        setNodes((nds) =>
          applyRejectPush(
            nds.map((n) =>
              n.type === 'group'
                ? { ...n, data: { ...n.data, active: false } }
                : n
            )
          )
        );
        setActiveGroupId(null);
      }
      originsRef.current = null;
    },
    [rf, setNodes, findOverlappingFolder, findAnyOverlappingFolder, restorePushedNodes]
  );

  return {
    dropTargetId,
    activeGroupId,
    rejectedFolderId,
    draggingNodeIds,
    repelAnimationActive,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  };
}
