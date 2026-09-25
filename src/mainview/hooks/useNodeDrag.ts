import type { Node, OnNodeDrag, XYPosition } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
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
  type RepulsionMemory,
} from '@/lib/repulsion';
import {
  buildTopicIndex,
  collectTopicDescendants,
  collectTopicsBlockedByLock,
} from '@/lib/topicTree';
import { useCanvasStore } from '@/store/canvasStore';
import * as m from '../../paraglide/messages.js';
import { isTopicNodeType } from '../../shared/topic';

/**
 * "Content" here means a node that can be placed inside a Group or absorbed
 * into a Folder. Sourced from the canvas node registry via
 * `isCanvasContentNode`, so adding `asset` / `link` later flows through
 * automatically.
 */
const isContentNode = (node: Node) => isCanvasContentNode(node.type);

/** Window after drag stop in which drop-time moves (e.g. restored pushed
 *  nodes) still start a repel spring. */
const REPEL_SETTLE_MS = 240;

function deactivateGroupHighlight(node: Node): Node {
  if (node.type !== 'group' || !node.data.active) {
    return node;
  }
  return { ...node, data: { ...node.data, active: false } };
}

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

/**
 * Descendants that must travel with a dragged Topic, and where they started.
 *
 * A branch moves as one shape, so the followers are translated by the anchor's
 * delta instead of being solved individually — that keeps their relative
 * layout exactly as the tree layout left it. Nodes React Flow is already
 * dragging (the rest of a multi-select) are excluded so they are not moved
 * twice.
 */
interface TopicBranchFollow {
  anchorStart: XYPosition;
  /** A locked Topic in the branch pins the whole gesture: the anchor snaps
   *  back every frame rather than the branch moving without it. */
  blocked: boolean;
  starts: Map<string, XYPosition>;
}

function captureTopicBranchFollow(
  node: Node,
  draggedNodes: Node[]
): TopicBranchFollow | null {
  if (!isTopicNodeType(node.type)) {
    return null;
  }
  const { edges, nodes } = useCanvasStore.getState();
  const index = buildTopicIndex(nodes, edges);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const blocked = collectTopicsBlockedByLock(index, (id) =>
    Boolean((byId.get(id)?.data as { locked?: unknown } | undefined)?.locked)
  ).has(node.id);

  const alreadyDragged = new Set(draggedNodes.map((n) => n.id));
  alreadyDragged.add(node.id);
  const starts = new Map<string, XYPosition>();
  for (const id of collectTopicDescendants(index, node.id)) {
    const descendant = byId.get(id);
    if (descendant && !alreadyDragged.has(id)) {
      starts.set(id, descendant.position);
    }
  }
  if (starts.size === 0 && !blocked) {
    return null;
  }
  return { anchorStart: node.position, blocked, starts };
}

/** Translate the branch followers to match how far the anchor has moved. */
function applyTopicBranchFollow(
  nodes: Node[],
  anchorId: string,
  follow: TopicBranchFollow
): Node[] {
  const anchor = nodes.find((n) => n.id === anchorId);
  if (!anchor) {
    return nodes;
  }
  if (follow.blocked) {
    return anchor.position.x === follow.anchorStart.x &&
      anchor.position.y === follow.anchorStart.y
      ? nodes
      : nodes.map((n) =>
          n.id === anchorId ? { ...n, position: follow.anchorStart } : n
        );
  }
  const dx = anchor.position.x - follow.anchorStart.x;
  const dy = anchor.position.y - follow.anchorStart.y;
  return nodes.map((n) => {
    const start = follow.starts.get(n.id);
    if (!start) {
      return n;
    }
    const x = start.x + dx;
    const y = start.y + dy;
    if (n.position.x === x && n.position.y === y) {
      return n;
    }
    return { ...n, position: { x, y } };
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
  /** True while dragging a single content/folder node — enables the render
   *  spring (`useRepelSpring`) that animates repelled neighbors. Group and
   *  multi-select drags are excluded. */
  const [repelAnimationActive, setRepelAnimationActive] = useState(false);
  /** Keeps the spring enabled briefly after drag stop so drop-time moves of
   *  pushed neighbors animate instead of snapping. */
  const repelSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  useEffect(
    () => () => {
      if (repelSettleTimerRef.current) {
        clearTimeout(repelSettleTimerRef.current);
      }
    },
    []
  );
  /** Per-gesture solver memory so neighbors keep their push side. */
  const repulsionMemoryRef = useRef<RepulsionMemory>(new Map());
  /** Node that started the current drag; helper-line snapping uses this, not changes[0]. */
  const dragAnchorIdRef = useRef<string | null>(null);
  const rf = useReactFlow();
  const findOverlappingGroup = useCallback(
    (node: Node) => {
      // Topics keep their committed dimensions in style and deliberately
      // ignore React Flow dimension changes. Passing such a node directly
      // makes getIntersectingNodes treat it as a zero-area rectangle, which
      // matches every group even when the node is outside it.
      const position = node.parentId
        ? (rf.getInternalNode(node.id)?.internals.positionAbsolute ??
          node.position)
        : node.position;
      return rf
        .getIntersectingNodes({ ...position, ...nodeSize(node) })
        .find((candidate) => candidate.type === 'group');
    },
    [rf]
  );
  /** Subtopics following the grabbed Topic for the length of one gesture. */
  const topicFollowRef = useRef<TopicBranchFollow | null>(null);

  /**
   * Top-level node positions captured on the first drag frame of a gesture.
   * The repulsion solver re-solves from these origins on every frame, which
   * keeps results path-independent and lets pushed nodes flow back to their
   * spot when the pressure is gone. `null` means "capture on next frame".
   */
  const originsRef = useRef<Map<string, Point> | null>(null);

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

  /** Find the folder whose bounds contain the dragged node's center. */
  const findOverlappingFolder = useCallback(
    (draggedNode: Node, allNodes: Node[]) => {
      if (!canAbsorbIntoFolder(draggedNode)) {
        return null;
      }
      return findAnyOverlappingFolder(draggedNode, allNodes);
    },
    [findAnyOverlappingFolder]
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
      dragAnchorIdRef.current = node.id;
      originsRef.current = null;
      repulsionMemoryRef.current.clear();
      if (repelSettleTimerRef.current) {
        clearTimeout(repelSettleTimerRef.current);
        repelSettleTimerRef.current = null;
      }
      topicFollowRef.current = captureTopicBranchFollow(node, draggedNodes);
      setRejectedFolderId(null);
      setDraggingNodeIds([
        ...getDraggingNodeIds(node, draggedNodes),
        ...(topicFollowRef.current?.starts.keys() ?? []),
      ]);
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
      // Subtopics leave the group with their ancestor. Detaching the anchor
      // alone would put the branch in two coordinate spaces at once, and a
      // tree is not allowed to straddle containers.
      const detachIds = new Set<string>([node.id]);
      const follow = topicFollowRef.current;
      if (follow && !follow.blocked) {
        for (const id of follow.starts.keys()) {
          detachIds.add(id);
        }
      }
      const shift = { x: abs.x - node.position.x, y: abs.y - node.position.y };
      setNodes((nds) =>
        sortNodesByParent(
          nds.map((n) => {
            if (n.type === 'group') {
              return deactivateGroupHighlight(n);
            }
            if (!detachIds.has(n.id)) {
              return n;
            }
            return {
              ...n,
              parentId: undefined,
              extent: undefined,
              position:
                n.id === node.id
                  ? abs
                  : { x: n.position.x + shift.x, y: n.position.y + shift.y },
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
      let rejectedFolderId: string | null = null;

      // Content nodes (card/image/sticky/widgets) can go into groups or
      // folders. Widgets and sticky cannot enter a folder, so when one of them
      // overlaps a folder it is rejected (red highlight) rather than absorbed.
      if (isContentNode(node)) {
        const group = findOverlappingGroup(node);
        targetGroupId = group?.id ?? null;
        const folder = findOverlappingFolder(
          node,
          useCanvasStore.getState().nodes
        );
        targetFolderId = folder?.id || null;
        if (
          !targetFolderId &&
          isRejectedFolderChildNode(
            node.type,
            node.data as Record<string, unknown>
          )
        ) {
          rejectedFolderId =
            findAnyOverlappingFolder(node, useCanvasStore.getState().nodes)
              ?.id ?? null;
        }
        // Folder takes precedence (matches onNodeDragStop ordering); when no
        // folder is under the cursor, the group acts as the drop target so the
        // dragged card is elevated above the group like it is above a folder.
        setDropTargetId(targetFolderId ?? targetGroupId);
      }
      // Folders can go into groups but NOT into other folders
      else if (node.type === 'folder') {
        const group = findOverlappingGroup(node);
        targetGroupId = group?.id ?? null;
        // Elevate the dragged folder above the group it is about to enter.
        setDropTargetId(targetGroupId);
        // A folder dragged over another folder is rejected, not absorbed.
        rejectedFolderId =
          findAnyOverlappingFolder(node, useCanvasStore.getState().nodes)?.id ??
          null;
      }
      // Groups cannot go into anything
      else if (node.type === 'group') {
        setDropTargetId(null);
        rejectedFolderId =
          findAnyOverlappingFolder(node, useCanvasStore.getState().nodes)?.id ??
          null;
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
        let highlightChanged = false;
        const highlightedNodes = nds.map((n) => {
          if (n.type !== 'group') {
            return n;
          }
          const nextActive = n.id === targetGroupId;
          if (Boolean(n.data.active) === nextActive) {
            return n;
          }
          highlightChanged = true;
          return { ...n, data: { ...n.data, active: nextActive } };
        });
        const highlighted = highlightChanged ? highlightedNodes : nds;

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

        // Subtopics ride along with their ancestor, and count as dragged so
        // repulsion leaves the branch's internal spacing alone.
        const follow = topicFollowRef.current;
        const withBranch = follow
          ? applyTopicBranchFollow(highlighted, node.id, follow)
          : highlighted;
        if (follow) {
          for (const id of follow.starts.keys()) {
            draggingIds.add(id);
          }
        }

        // Positions in the store are already live: React Flow dispatches the
        // position changes (including helper-line snapping) synchronously
        // before this callback runs.
        const repelled = applyDragRepulsion({
          nodes: withBranch,
          activeIds: draggingIds,
          origins: originsRef.current,
          paused,
          gap: REPULSION_GAP,
          memory: repulsionMemoryRef.current,
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
    [
      setNodes,
      findOverlappingGroup,
      findOverlappingFolder,
      findAnyOverlappingFolder,
    ]
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_, node, draggedNodes = []) => {
      setDropTargetId(null);
      setRejectedFolderId(null);
      if (repelSettleTimerRef.current) {
        clearTimeout(repelSettleTimerRef.current);
      }
      repelSettleTimerRef.current = setTimeout(() => {
        repelSettleTimerRef.current = null;
        setRepelAnimationActive(false);
      }, REPEL_SETTLE_MS);
      repulsionMemoryRef.current.clear();
      setDraggingNodeIds([]);
      dragAnchorIdRef.current = null;

      const draggingIds = new Set<string>(draggedNodes.map((n) => n.id));
      draggingIds.add(node.id);
      // React Flow's final snap moves the anchor one last time, so the branch
      // has to be re-translated before the ref is dropped.
      const topicFollow = topicFollowRef.current;
      topicFollowRef.current = null;
      if (topicFollow) {
        for (const id of topicFollow.starts.keys()) {
          draggingIds.add(id);
        }
        setNodes((nds) => applyTopicBranchFollow(nds, node.id, topicFollow));
        if (topicFollow.blocked) {
          toast.error(m.toast_topic_layout_locked());
        }
      }

      // At drag stop React Flow snaps the store back to the pointer position,
      // which may sit on top of a folder the node cannot enter. Re-derive the
      // rejected folder and push the dragged node out so it doesn't settle
      // inside the folder.
      const rejectedFolderId = isRejectedFolderChildNode(
        node.type,
        node.data as Record<string, unknown>
      )
        ? (findAnyOverlappingFolder(node, useCanvasStore.getState().nodes)
            ?.id ?? null)
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
              return nds.map(deactivateGroupHighlight);
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
                nextNodes.push(deactivateGroupHighlight(n));
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
          const liveNode = nds.find((n) => n.id === node.id) ?? node;
          const targetGroup = findOverlappingGroup(liveNode);

          const base = targetGroup ? restorePushedNodes(nds, draggingIds) : nds;
          const anchorAbs = liveNode.parentId
            ? (rf.getInternalNode(node.id)?.internals.positionAbsolute ??
              liveNode.position)
            : liveNode.position;
          const groupAbs = targetGroup
            ? (rf.getInternalNode(targetGroup.id)?.internals.positionAbsolute ??
              targetGroup.position)
            : { x: 0, y: 0 };
          const anchorNext = {
            x: anchorAbs.x - groupAbs.x,
            y: anchorAbs.y - groupAbs.y,
          };
          // A tree lives in one container, so subtopics change container along
          // with their ancestor. The branch is rigid: each follower shifts by
          // the same amount the anchor's coordinates did, which leaves the
          // layout identical on the other side of the move.
          const anchorBefore =
            base.find((n) => n.id === node.id)?.position ?? anchorNext;
          const branchShift = {
            x: anchorNext.x - anchorBefore.x,
            y: anchorNext.y - anchorBefore.y,
          };
          const followerIds = new Set(
            topicFollow?.blocked ? [] : (topicFollow?.starts.keys() ?? [])
          );

          const updated = base.map((n) => {
            const isAnchor = n.id === node.id;
            if (!(isAnchor || followerIds.has(n.id))) {
              return deactivateGroupHighlight(n);
            }
            const position = isAnchor
              ? anchorNext
              : {
                  x: n.position.x + branchShift.x,
                  y: n.position.y + branchShift.y,
                };
            if (targetGroup) {
              return {
                ...n,
                parentId: targetGroup.id,
                extent: 'parent' as const,
                position,
              };
            }
            return {
              ...n,
              parentId: undefined,
              extent: undefined,
              position,
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
          const targetGroup = findOverlappingGroup(node);

          const base = targetGroup ? restorePushedNodes(nds, draggingIds) : nds;
          const updated = base.map((n) => {
            if (n.id !== node.id) {
              return deactivateGroupHighlight(n);
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
        setNodes((nds) => applyRejectPush(nds.map(deactivateGroupHighlight)));
        setActiveGroupId(null);
      }
      originsRef.current = null;
    },
    [
      rf,
      setNodes,
      findOverlappingGroup,
      findOverlappingFolder,
      findAnyOverlappingFolder,
      restorePushedNodes,
    ]
  );

  return {
    dropTargetId,
    activeGroupId,
    rejectedFolderId,
    draggingNodeIds,
    dragAnchorIdRef,
    repelAnimationActive,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  };
}
