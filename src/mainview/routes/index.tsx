import { createFileRoute } from '@tanstack/react-router';
import type { Connection, Node, ReactFlowInstance } from '@xyflow/react';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
} from '@xyflow/react';
import { useTheme } from 'better-themes';
import { AnimatePresence } from 'motion/react';

import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CanvasContextMenu } from '@/components/canvas/ContextMenu';
import { DeleteFolderConfirmDialog } from '@/components/canvas/DeleteFolderConfirmDialog';
import { DetachedNotesSidebar } from '@/components/canvas/DetachedNotesSidebar';
import ConnectionPreviewLine from '@/components/canvas/edges/ConnectionPreviewLine';
import { FocusedView } from '@/components/canvas/FocusedView';
import { FolderView } from '@/components/canvas/FolderView';
import { HelperLines } from '@/components/canvas/HelperLines';
import { ViewSwitcher } from '@/components/canvas/ViewSwitcher';
import { DocumentView } from '@/components/document/DocumentView';
import { Loader } from '@/components/layout/Loader';
import { SearchDialog } from '@/components/search/SearchDialog';
import { initialEdges, initialNodes } from '@/data/initialNodes';
import { useCanvasKeyboard } from '@/hooks/useCanvasKeyboard';
import { useCanvasPersistence } from '@/hooks/useCanvasPersistence';
import { useContextMenu } from '@/hooks/useContextMenu';
import { useHelperLines } from '@/hooks/useHelperLines';
import { useNodeCreation } from '@/hooks/useNodeCreation';
import { useNodeDrag } from '@/hooks/useNodeDrag';
import { edgeTypes, nodeTypes } from '@/lib/canvasConstants';
import {
  exportReactFlowCanvasToJson,
  exportReactFlowCanvasToPng,
  sanitizeExportFileName,
} from '@/lib/canvasExport';
import { isRpcAvailable, loadCanvas, rpcGetSettings } from '@/lib/rpc';
import {
  type ConnectionStartState,
  shouldReverseEdgeDirection,
} from '@/lib/shouldReverseEdgeDirection';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../paraglide/messages.js';

// ─── 画布颜色 ────────────────────────────────────────────────────────────────
// 亮色 / 暗色两套色板，所有颜色值集中定义，避免散落在 JSX 中。

/** 画布主背景色 */
const CANVAS_BG_LIGHT = '#EFF3F4';
const CANVAS_BG_DARK = '#141414';

/** 背景网格点颜色 */
const GRID_COLOR_LIGHT = '#D8DCDF';
const GRID_COLOR_DARK = 'rgba(255, 255, 255, 0.14)';

/** 小地图背景色 */
const MINIMAP_BG_LIGHT = 'rgba(255, 255, 255, 0.92)';
const MINIMAP_BG_DARK = 'rgba(28, 28, 28, 0.92)';

/** 小地图边框 */
const MINIMAP_BORDER_LIGHT = '1px solid rgba(0, 0, 0, 0.08)';
const MINIMAP_BORDER_DARK = '1px solid rgba(255, 255, 255, 0.08)';

/** 小地图遮罩（视口外区域的蒙层） */
const MINIMAP_MASK_LIGHT = 'rgba(240, 239, 237, 0.7)';
const MINIMAP_MASK_DARK = 'rgba(20, 20, 20, 0.7)';

/** 小地图节点填充色 */
const MINIMAP_NODE_COLOR = '#ddd';

/** 小地图节点描边色 */
const MINIMAP_NODE_STROKE_COLOR = '#999';

// ─────────────────────────────────────────────────────────────────────────────

export const Route = createFileRoute('/')({
  component: CanvasRoute,
});

const LAYOUT_MODE_STORAGE_KEY = 'ghostboard.layoutMode';

function loadLayoutModeFromStorage(
  viewId: string
): 'canvas' | 'document' | null {
  try {
    const raw = localStorage.getItem(`${LAYOUT_MODE_STORAGE_KEY}.${viewId}`);
    if (raw === 'document' || raw === 'canvas') {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

function persistLayoutMode(viewId: string, mode: 'canvas' | 'document') {
  try {
    localStorage.setItem(`${LAYOUT_MODE_STORAGE_KEY}.${viewId}`, mode);
  } catch {
    // Ignore storage failures (private mode etc.)
  }
}

function useLayoutModePersistence() {
  const layoutMode = useCanvasStore((s) => s.layoutMode);
  const setLayoutMode = useCanvasStore((s) => s.setLayoutMode);
  const activeViewId = useCanvasStore((s) => s.activeViewId);

  // Keep latest mode/setter accessible from the load effect without retriggering it.
  const latest = useRef({ layoutMode, setLayoutMode });
  latest.current = { layoutMode, setLayoutMode };

  useEffect(() => {
    let cancelled = false;
    const stored = loadLayoutModeFromStorage(activeViewId);
    if (stored) {
      if (stored !== latest.current.layoutMode) {
        latest.current.setLayoutMode(stored);
      }
      return () => {
        cancelled = true;
      };
    }

    // Decision 16: no per-view override yet → fall back to the user's
    // app-wide default (settings.json `defaultLayoutMode`, default `canvas`).
    rpcGetSettings()
      .then((settings) => {
        if (cancelled) {
          return;
        }
        const fallback: 'canvas' | 'document' =
          settings?.defaultLayoutMode === 'document' ? 'document' : 'canvas';
        if (fallback !== latest.current.layoutMode) {
          latest.current.setLayoutMode(fallback);
        }
      })
      .catch(() => {
        // Settings RPC unavailable (browser dev mode) — keep current mode.
      });

    return () => {
      cancelled = true;
    };
  }, [activeViewId]);

  useEffect(() => {
    persistLayoutMode(activeViewId, layoutMode);
  }, [activeViewId, layoutMode]);
}

function CanvasComponent() {
  const connectionStartRef = useRef<ConnectionStartState>({
    handleId: null,
    nodeId: null,
  });
  const { theme, systemTheme } = useTheme();
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const focusedNode = useCanvasStore((s) => s.focusedNode);
  const focusedFolder = useCanvasStore((s) => s.focusedFolder);
  const createMenuOpen = useCanvasStore((s) => s.createMenuOpen);
  const setCreateMenuOpen = useCanvasStore((s) => s.setCreateMenuOpen);
  const setFocusedNode = useCanvasStore((s) => s.setFocusedNode);
  const setFocusedFolder = useCanvasStore((s) => s.setFocusedFolder);
  const applyEdgesChange = useCanvasStore((s) => s.applyEdgesChange);
  const addConnection = useCanvasStore((s) => s.addConnection);
  const deleteNodes = useCanvasStore((s) => s.deleteNodes);
  const undo = useCanvasStore((s) => s.undo);
  const rfInstance = useRef<ReactFlowInstance<any, any> | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  const { dropTargetId, onNodeDragStart, onNodeDrag, onNodeDragStop } =
    useNodeDrag();

  const { helperLineH, helperLineV, onNodesChange } = useHelperLines();

  const { onCreateNode } = useNodeCreation({ rfInstance });

  const hydrate = useCanvasStore((s) => s.hydrate);
  const hydrated = useCanvasStore((s) => s._hydrated);
  const activeViewId = useCanvasStore((s) => s.activeViewId);
  const views = useCanvasStore((s) => s.views);
  const pendingSearchTarget = useCanvasStore((s) => s.pendingSearchTarget);
  const setPendingSearchTarget = useCanvasStore(
    (s) => s.setPendingSearchTarget
  );
  const setNodes = useCanvasStore((s) => s.setNodes);
  const moveFolderChildToCanvas = useCanvasStore(
    (s) => s.moveFolderChildToCanvas
  );
  const pinNoteToCanvas = useCanvasStore((s) => s.pinNoteToCanvas);

  const [detachedSidebarOpen, setDetachedSidebarOpen] = useState(false);
  const [pendingFolderDeleteIds, setPendingFolderDeleteIds] = useState<
    string[] | null
  >(null);

  const onOpenNoteLibrary = useCallback(() => {
    setDetachedSidebarOpen(true);
  }, []);

  const deleteNodesWithToast = useCallback(
    (ids: string[]) => {
      deleteNodes(ids);
      toast(
        ids.length > 1
          ? m.toast_nodes_deleted({ count: ids.length })
          : m.toast_node_deleted(),
        { action: { label: m.toast_undo(), onClick: () => undo() } }
      );
    },
    [deleteNodes, undo]
  );

  const requestDeleteNodes = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids);
      const hasFolder = useCanvasStore
        .getState()
        .nodes.some((node) => idSet.has(node.id) && node.type === 'folder');

      if (hasFolder) {
        setPendingFolderDeleteIds(ids);
        return;
      }

      deleteNodesWithToast(ids);
    },
    [deleteNodesWithToast]
  );

  const {
    contextMenu,
    setContextMenu,
    onPaneContextMenu,
    onNodeContextMenu,
    onEdgeContextMenu,
    handleContextMenuAction,
  } = useContextMenu({ onDeleteNodes: requestDeleteNodes, rfInstance });

  useCanvasPersistence();

  // Cross-view search target: locate node after hydration completes.
  useEffect(() => {
    if (!(hydrated && pendingSearchTarget)) {
      return;
    }
    if (pendingSearchTarget.viewId !== activeViewId) {
      return;
    }
    const targetId = pendingSearchTarget.nodeId ?? pendingSearchTarget.edgeId;
    if (!targetId) {
      setPendingSearchTarget(null);
      return;
    }
    if (pendingSearchTarget.nodeId) {
      const nodeId = pendingSearchTarget.nodeId;
      setNodes((prev) =>
        prev.map((n) => ({ ...n, selected: n.id === nodeId }))
      );
      const inst = rfInstance.current;
      const target = inst
        ?.getNodes?.()
        ?.find((n: { id: string }) => n.id === nodeId) as
        | {
            position?: { x: number; y: number };
            measured?: { width?: number; height?: number };
            width?: number;
            height?: number;
          }
        | undefined;
      if (inst && target?.position) {
        const w = target.measured?.width ?? target.width ?? 240;
        const h = target.measured?.height ?? target.height ?? 160;
        const viewport = inst.getViewport?.();
        const zoom = viewport?.zoom ?? 1;
        inst.setCenter?.(target.position.x + w / 2, target.position.y + h / 2, {
          zoom,
          duration: 240,
        });
      }
    }
    setPendingSearchTarget(null);
  }, [
    hydrated,
    pendingSearchTarget,
    activeViewId,
    setPendingSearchTarget,
    setNodes,
  ]);

  useEffect(() => {
    if (hydrated) {
      return;
    }
    loadCanvas(activeViewId)
      .then(async (data) => {
        if (data) {
          // Respect what the manifest contains — including empty arrays for
          // canvases the user just created via "New Canvas → Blank Canvas".
          // First-run seeding for the default view now happens on the bun
          // side in `initWorkspace`.
          hydrate(data.nodes, data.edges);
        } else if (await isRpcAvailable()) {
          // RPC is up but no manifest exists for this view — start blank.
          hydrate([], []);
        } else {
          // Browser/dev fallback (no Electrobun RPC): hydrate in-memory with
          // the initial data so the canvas is usable for debugging without persistence.
          hydrate(initialNodes, initialEdges);
        }
      })
      .catch((error) => {
        console.error('[persistence] Failed to load canvas:', error);
      });
  }, [hydrate, hydrated, activeViewId]);

  useCanvasKeyboard({ onDeleteNodes: requestDeleteNodes });

  const onEdgesChange = useCallback(
    (changes: any) => {
      applyEdgesChange(changes);
    },
    [applyEdgesChange]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      addConnection(connection, {
        reverseVisualDirection: shouldReverseEdgeDirection(
          connectionStartRef.current,
          connection
        ),
      });
    },
    [addConnection]
  );

  const onConnectStart = useCallback(
    (
      _event: MouseEvent | TouchEvent,
      params: { handleId?: string | null; nodeId: string | null }
    ) => {
      connectionStartRef.current = {
        handleId: params.handleId ?? null,
        nodeId: params.nodeId,
      };
    },
    []
  );

  const onConnectEnd = useCallback(() => {
    connectionStartRef.current = {
      handleId: null,
      nodeId: null,
    };
  }, []);

  const onNodeDoubleClick = useCallback(
    (_: any, node: Node) => {
      const el = document.querySelector(`[data-id="${node.id}"]`);
      const rect = el?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      if (node.type === 'folder') {
        setFocusedFolder({ id: node.id, data: node.data, rect });
      } else if (node.type === 'card' || node.type === 'image') {
        setFocusedNode({ id: node.id, type: node.type, data: node.data, rect });
      }
    },
    [setFocusedNode, setFocusedFolder]
  );

  const onNodeClick = useCallback(
    (_: any, node: Node) => {
      if (node.type !== 'folder') {
        return;
      }
      const el = document.querySelector(`[data-id="${node.id}"]`);
      const rect = el?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      setFocusedFolder({ id: node.id, data: node.data, rect });
    },
    [setFocusedFolder]
  );

  const onMoveFolderChildOut = useCallback(
    (child: { id: string }, rect: DOMRect) => {
      if (!focusedFolder) {
        return;
      }
      const viewport = rfInstance.current?.getViewport();
      const zoom = viewport?.zoom ?? 1;
      moveFolderChildToCanvas(focusedFolder.id, child.id, {
        anchorCenter: {
          x: (rect.left + rect.width / 2 - (viewport?.x ?? 0)) / zoom,
          y: (rect.top + rect.height / 2 - (viewport?.y ?? 0)) / zoom,
        },
      });
    },
    [focusedFolder, moveFolderChildToCanvas]
  );

  const nodesWithState = useMemo(
    () =>
      nodes
        .filter((node) => !(node.data as Record<string, unknown>).detached)
        .map((node) => ({
          ...node,
          data: {
            ...node.data,
            isHidden:
              focusedNode?.id === node.id || focusedFolder?.id === node.id,
            isDropTarget: dropTargetId === node.id,
          },
        })),
    [nodes, focusedNode, focusedFolder, dropTargetId]
  );

  const onDropDetachedNote = useCallback(
    (e: React.DragEvent | DragEvent) => {
      const nodeId = (e as React.DragEvent).dataTransfer?.getData(
        'application/ghostboard-detached-note'
      );
      if (!nodeId) {
        return;
      }
      e.preventDefault();
      const position = screenToFlowPosition({
        x: (e as React.DragEvent).clientX,
        y: (e as React.DragEvent).clientY,
      });
      pinNoteToCanvas(nodeId, position);
    },
    [pinNoteToCanvas, screenToFlowPosition]
  );

  const onDragOverCanvas = useCallback((e: React.DragEvent | DragEvent) => {
    e.preventDefault();
    if ((e as React.DragEvent).dataTransfer) {
      (e as React.DragEvent).dataTransfer.dropEffect = 'move';
    }
  }, []);

  const isDarkTheme =
    theme === 'dark' || (theme === 'system' && systemTheme === 'dark');
  const canvasBackground = isDarkTheme ? CANVAS_BG_DARK : CANVAS_BG_LIGHT;
  const gridColor = isDarkTheme ? GRID_COLOR_DARK : GRID_COLOR_LIGHT;
  const miniMapBackground = isDarkTheme ? MINIMAP_BG_DARK : MINIMAP_BG_LIGHT;
  const miniMapBorder = isDarkTheme
    ? MINIMAP_BORDER_DARK
    : MINIMAP_BORDER_LIGHT;
  const miniMapMask = isDarkTheme ? MINIMAP_MASK_DARK : MINIMAP_MASK_LIGHT;
  const activeViewName =
    views.find((view) => view.id === activeViewId)?.name ?? 'Canvas';

  const onExportCanvas = useCallback(async () => {
    const instance = rfInstance.current;
    if (!instance) {
      toast.error('画布尚未准备好，暂时无法导出。');
      return;
    }

    try {
      const exported = await exportReactFlowCanvasToPng({
        backgroundColor: canvasBackground,
        fileName: sanitizeExportFileName(activeViewName),
        instance,
      });
      if (exported) {
        toast.success('PNG 已导出。');
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'PNG 导出失败，请重试。';
      toast.error(message);
    }
  }, [activeViewName, canvasBackground]);

  const onExportCanvasJson = useCallback(async () => {
    const instance = rfInstance.current;
    if (!instance) {
      toast.error('画布尚未准备好，暂时无法导出。');
      return;
    }

    try {
      const exported = await exportReactFlowCanvasToJson({
        edges,
        fileName: sanitizeExportFileName(activeViewName),
        nodes,
        viewId: activeViewId,
        viewName: activeViewName,
        viewport: instance.getViewport?.(),
      });
      if (exported) {
        toast.success('JSON 已导出。');
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'JSON 导出失败，请重试。';
      toast.error(message);
    }
  }, [activeViewId, activeViewName, edges, nodes]);

  if (!hydrated) {
    return (
      <div className="h-screen w-screen bg-[#EFF3F4] dark:bg-[#141414]">
        <Loader />
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#EFF3F4] font-sans dark:bg-[#141414]">
      <ReactFlow
        connectionLineComponent={ConnectionPreviewLine}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={30}
        defaultEdgeOptions={{ type: 'labeledEdge', zIndex: 1 }}
        edges={edges}
        edgeTypes={edgeTypes}
        elevateEdgesOnSelect
        fitView
        maxZoom={4}
        minZoom={0.1}
        nodes={nodesWithState}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onConnectStart={onConnectStart}
        onDragOver={onDragOverCanvas}
        onDrop={onDropDetachedNote}
        onEdgeContextMenu={onEdgeContextMenu}
        onEdgesChange={onEdgesChange}
        onInit={(instance) => {
          rfInstance.current = instance;
        }}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeDrag={onNodeDrag}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodesChange={onNodesChange}
        onPaneContextMenu={onPaneContextMenu}
        panOnDrag={false}
        panOnScroll={true}
        proOptions={{ hideAttribution: true }}
        selectionMode={SelectionMode.Partial}
        selectionOnDrag={true}
        style={{ backgroundColor: canvasBackground }}
        zoomOnPinch={true}
      >
        <Background
          color={gridColor}
          gap={24}
          size={1.5}
          variant={BackgroundVariant.Dots}
        />
        <Controls position="bottom-left" />
        <HelperLines horizontal={helperLineH} vertical={helperLineV} />
        <MiniMap
          maskColor={miniMapMask}
          nodeColor={MINIMAP_NODE_COLOR}
          nodeStrokeColor={MINIMAP_NODE_STROKE_COLOR}
          pannable
          position="bottom-right"
          style={{
            backgroundColor: miniMapBackground,
            border: miniMapBorder,
            borderRadius: 8,
          }}
          zoomable
        />
      </ReactFlow>

      <AnimatePresence>
        {focusedFolder ? (
          <FolderView
            folder={focusedFolder}
            onCardClick={(child: any, rect: any) => {
              setFocusedNode({
                id: child.id,
                folderId: focusedFolder.id,
                type: child.type,
                data: child.data,
                rect,
              });
            }}
            onClose={() => {
              setFocusedFolder(null);
            }}
            onMoveChildOut={onMoveFolderChildOut}
          />
        ) : null}
        {focusedNode ? (
          <FocusedView
            node={focusedNode}
            onClose={() => {
              setFocusedNode(null);
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {detachedSidebarOpen ? (
          <DetachedNotesSidebar
            onClose={() => {
              setDetachedSidebarOpen(false);
            }}
          />
        ) : null}
      </AnimatePresence>

      {pendingFolderDeleteIds ? (
        <DeleteFolderConfirmDialog
          onCancel={() => {
            setPendingFolderDeleteIds(null);
          }}
          onConfirm={() => {
            deleteNodesWithToast(pendingFolderDeleteIds);
            setPendingFolderDeleteIds(null);
          }}
          open
        />
      ) : null}

      <ViewSwitcher
        createMenuOpen={createMenuOpen}
        onCreateNode={onCreateNode}
        onExportCanvas={onExportCanvas}
        onExportCanvasJson={onExportCanvasJson}
        onOpenNoteLibrary={onOpenNoteLibrary}
        setCreateMenuOpen={setCreateMenuOpen}
      />
      <CanvasContextMenu
        menu={contextMenu}
        onAction={handleContextMenuAction}
        onClose={() => {
          setContextMenu(null);
        }}
      />
      <SearchDialog rfInstance={rfInstance} />
    </div>
  );
}

function CanvasRoute() {
  useLayoutModePersistence();
  const layoutMode = useCanvasStore((s) => s.layoutMode);

  return (
    <>
      {layoutMode === 'document' ? (
        <DocumentView />
      ) : (
        <ReactFlowProvider>
          <CanvasComponent />
        </ReactFlowProvider>
      )}
    </>
  );
}
