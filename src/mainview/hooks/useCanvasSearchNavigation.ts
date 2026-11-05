import type { Node, ReactFlowInstance } from '@xyflow/react';
import type { RefObject } from 'react';
import { useEffect, useMemo } from 'react';
import { isFocusableNode } from '@/lib/canvasNodePredicates';
import { openFocusedItem } from '@/lib/focusedItem';
import {
  buildFolderExpansionNodes,
  type FolderExpandedChildData,
  isFolderExpandedChildNode,
} from '@/lib/folderExpansion';
import { VIEWPORT_PAN_MS, viewportMotion } from '@/lib/motion';
import { suppressViewportPersist } from '@/lib/viewportPersist';
import { useCanvasStore } from '@/store/canvasStore';
import {
  absoluteNodeCenter,
  absoluteNodePosition,
} from '../../shared/canvasGeometry';

const FALLBACK_NODE_WIDTH = 240;
const FALLBACK_NODE_HEIGHT = 160;

/**
 * Center a node that React Flow culled (no DOM element) and return the screen
 * rect it now occupies. The canvas fills the window, so after centering the
 * node sits in the middle of the viewport.
 */
function centerCulledNode(
  node: Node,
  inst: ReactFlowInstance<any, any> | null
): DOMRect | null {
  if (!(inst?.setCenter && inst.getViewport)) {
    return null;
  }
  const width = node.measured?.width ?? node.width ?? FALLBACK_NODE_WIDTH;
  const height = node.measured?.height ?? node.height ?? FALLBACK_NODE_HEIGHT;
  const zoom = inst.getViewport().zoom || 1;
  suppressViewportPersist(300);
  const position = absoluteNodePosition(node, useCanvasStore.getState().nodes);
  inst.setCenter(position.x + width / 2, position.y + height / 2, {
    duration: 0,
    zoom,
  });
  const screenWidth = width * zoom;
  const screenHeight = height * zoom;
  return new DOMRect(
    globalThis.innerWidth / 2 - screenWidth / 2,
    globalThis.innerHeight / 2 - screenHeight / 2,
    screenWidth,
    screenHeight
  );
}

/**
 * Cross-view search navigation: once the target view is hydrated, select and
 * center the searched node/edge, or open the owning folder and focus the
 * searched folder child. Lives in its own hook (and a render-null host
 * component in the canvas route) so its `nodes` subscription does not
 * re-render the whole canvas shell.
 */
export function useCanvasSearchNavigation({
  closingFolderId,
  hydrated,
  rfInstance,
}: {
  closingFolderId: string | null;
  hydrated: boolean;
  rfInstance: RefObject<ReactFlowInstance<any, any> | null>;
}): void {
  const nodes = useCanvasStore((s) => s.nodes);
  const focusedFolder = useCanvasStore((s) => s.focusedFolder);
  const focusedFolderId = focusedFolder?.id;
  const activeViewId = useCanvasStore((s) => s.activeViewId);
  const pendingSearchTarget = useCanvasStore((s) => s.pendingSearchTarget);
  const setPendingSearchTarget = useCanvasStore(
    (s) => s.setPendingSearchTarget
  );
  const setFocusedNode = useCanvasStore((s) => s.setFocusedNode);
  const setFocusedFolder = useCanvasStore((s) => s.setFocusedFolder);
  const setNodes = useCanvasStore((s) => s.setNodes);
  const setEdges = useCanvasStore((s) => s.setEdges);

  const folderExpansionNodes = useMemo(
    () =>
      focusedFolderId
        ? buildFolderExpansionNodes({
            allNodes: nodes,
            closing: closingFolderId === focusedFolderId,
            folderId: focusedFolderId,
          })
        : [],
    [closingFolderId, focusedFolderId, nodes]
  );

  // Cross-view search target: locate node or edge after hydration completes.
  useEffect(() => {
    if (!(hydrated && pendingSearchTarget)) {
      return;
    }
    if (pendingSearchTarget.viewId !== activeViewId) {
      return;
    }
    const searchTarget = pendingSearchTarget.target;
    if (searchTarget?.type === 'folder-child') {
      let waitTimeout: ReturnType<typeof setTimeout> | undefined;
      const clearPendingAfterWait = () => {
        waitTimeout = setTimeout(() => {
          setPendingSearchTarget(null);
        }, 2000);
      };
      const folder = nodes.find(
        (node) => node.id === searchTarget.folderId && node.type === 'folder'
      );
      if (!folder) {
        // A stale result should not leave the canvas blocked waiting for a
        // container that no longer exists.
        setPendingSearchTarget(null);
        return;
      }

      const rawChildren = Array.isArray(
        (folder.data as Record<string, unknown>).children
      )
        ? ((folder.data as Record<string, unknown>).children as Array<{
            id?: unknown;
          }>)
        : [];
      const childIsStored = rawChildren.some(
        (child) => child?.id === searchTarget.childId
      );
      if (!childIsStored) {
        setPendingSearchTarget(null);
        return;
      }

      if (focusedFolder?.id !== folder.id) {
        const folderElement = document.querySelector(
          `[data-id="${folder.id}"]`
        );
        // With onlyRenderVisibleElements an off-screen folder has no DOM node;
        // bring it on screen and derive its rect from the viewport instead.
        const rect =
          folderElement?.getBoundingClientRect() ??
          centerCulledNode(folder, rfInstance.current);
        if (!rect) {
          clearPendingAfterWait();
          return () => clearTimeout(waitTimeout);
        }
        setFocusedNode(null);
        setFocusedFolder({ id: folder.id, data: folder.data, rect });
        return;
      }

      const expandedChild = folderExpansionNodes.find(
        (node): node is Node<FolderExpandedChildData> =>
          isFolderExpandedChildNode(node) &&
          node.data.folderId === folder.id &&
          node.data.child.id === searchTarget.childId
      );
      if (!expandedChild) {
        clearPendingAfterWait();
        return () => clearTimeout(waitTimeout);
      }

      const childElement = document.querySelector(
        `[data-id="${expandedChild.id}"]`
      );
      const rect = childElement?.getBoundingClientRect();
      if (!rect) {
        clearPendingAfterWait();
        return () => clearTimeout(waitTimeout);
      }

      const child = expandedChild.data.child;
      if (isFocusableNode(child.type, child.data)) {
        openFocusedItem({
          id: child.id,
          folderId: folder.id,
          type: child.type,
          data: child.data,
          rect,
        });
      }
      // Non-focusable legacy children are still reachable: the owner Folder
      // remains open with the child visible for its in-place controls/menu.
      setPendingSearchTarget(null);
      return;
    }
    const targetId = pendingSearchTarget.nodeId ?? pendingSearchTarget.edgeId;
    if (!targetId) {
      setPendingSearchTarget(null);
      return;
    }
    const inst = rfInstance.current;
    if (pendingSearchTarget.nodeId) {
      const nodeId = pendingSearchTarget.nodeId;
      setNodes((prev) =>
        prev.map((n) => ({ ...n, selected: n.id === nodeId }))
      );
      const navigationNodes = nodes;
      const target = navigationNodes.find((node: Node) => node.id === nodeId);
      if (inst && target?.position) {
        const center = absoluteNodeCenter(target, navigationNodes);
        const viewport = inst.getViewport?.();
        const zoom = viewport?.zoom ?? 1;
        suppressViewportPersist(300);
        inst.setCenter?.(center.x, center.y, {
          ...viewportMotion(VIEWPORT_PAN_MS),
          zoom,
        });
      }
    } else if (pendingSearchTarget.edgeId) {
      const edgeId = pendingSearchTarget.edgeId;
      setEdges((prev) =>
        prev.map((e) => ({ ...e, selected: e.id === edgeId }))
      );
      const edge = useCanvasStore
        .getState()
        .edges.find((e) => e.id === edgeId) as
        | { source?: string; target?: string }
        | undefined;
      if (inst && edge?.source && edge.target) {
        const src = nodes.find((n) => n.id === edge.source);
        const tgt = nodes.find((n) => n.id === edge.target);
        if (src?.position && tgt?.position) {
          const source = absoluteNodeCenter(src, nodes);
          const target = absoluteNodeCenter(tgt, nodes);
          const cx = (source.x + target.x) / 2;
          const cy = (source.y + target.y) / 2;
          const zoom = inst.getViewport?.()?.zoom ?? 1;
          suppressViewportPersist(300);
          inst.setCenter?.(cx, cy, {
            ...viewportMotion(VIEWPORT_PAN_MS),
            zoom,
          });
        }
      }
    }
    setPendingSearchTarget(null);
  }, [
    hydrated,
    pendingSearchTarget,
    activeViewId,
    focusedFolder,
    folderExpansionNodes,
    nodes,
    setPendingSearchTarget,
    setFocusedFolder,
    setFocusedNode,
    setNodes,
    setEdges,
    rfInstance,
  ]);
}
