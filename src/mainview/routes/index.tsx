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
} from '@xyflow/react';
import { useTheme } from 'better-themes';
import { AnimatePresence } from 'motion/react';

import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { CanvasContextMenu } from '@/components/canvas/ContextMenu';
import ConnectionPreviewLine from '@/components/canvas/edges/ConnectionPreviewLine';
import { FocusedView } from '@/components/canvas/FocusedView';
import { FolderView } from '@/components/canvas/FolderView';
import { HelperLines } from '@/components/canvas/HelperLines';
import { ViewSwitcher } from '@/components/canvas/ViewSwitcher';
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
import { isRpcAvailable, loadCanvas, rpcSaveManifest } from '@/lib/rpc';
import { sanitizeForPersistence } from '@/lib/sanitize';
import {
  type ConnectionStartState,
  shouldReverseEdgeDirection,
} from '@/lib/shouldReverseEdgeDirection';
import { useCanvasStore } from '@/store/canvasStore';

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
  const rfInstance = useRef<ReactFlowInstance<any, any> | null>(null);

  const { dropTargetId, onNodeDragStart, onNodeDrag, onNodeDragStop } =
    useNodeDrag();

  const { helperLineH, helperLineV, onNodesChange } = useHelperLines();

  const {
    contextMenu,
    setContextMenu,
    onPaneContextMenu,
    onNodeContextMenu,
    onEdgeContextMenu,
    handleContextMenuAction,
  } = useContextMenu({ rfInstance });

  const { onCreateNode } = useNodeCreation({ rfInstance });

  const hydrate = useCanvasStore((s) => s.hydrate);
  const hydrated = useCanvasStore((s) => s._hydrated);
  const activeViewId = useCanvasStore((s) => s.activeViewId);
  const pendingSearchTarget = useCanvasStore((s) => s.pendingSearchTarget);
  const setPendingSearchTarget = useCanvasStore(
    (s) => s.setPendingSearchTarget
  );
  const setNodes = useCanvasStore((s) => s.setNodes);
  const moveFolderChildToCanvas = useCanvasStore(
    (s) => s.moveFolderChildToCanvas
  );

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
        if (data && data.nodes.length > 0) {
          hydrate(data.nodes, data.edges);
        } else if (await isRpcAvailable()) {
          // First run: seed workspace with initialNodes + initialEdges
          const sanitized = sanitizeForPersistence(initialNodes, initialEdges);
          await rpcSaveManifest(activeViewId, sanitized.nodes, sanitized.edges);
          hydrate(initialNodes, initialEdges);
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

  useCanvasKeyboard();

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
      nodes.map((node) => ({
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

  const isDarkTheme =
    theme === 'dark' || (theme === 'system' && systemTheme === 'dark');
  const canvasBackground = isDarkTheme ? CANVAS_BG_DARK : CANVAS_BG_LIGHT;
  const gridColor = isDarkTheme ? GRID_COLOR_DARK : GRID_COLOR_LIGHT;
  const miniMapBackground = isDarkTheme ? MINIMAP_BG_DARK : MINIMAP_BG_LIGHT;
  const miniMapBorder = isDarkTheme
    ? MINIMAP_BORDER_DARK
    : MINIMAP_BORDER_LIGHT;
  const miniMapMask = isDarkTheme ? MINIMAP_MASK_DARK : MINIMAP_MASK_LIGHT;

  if (!hydrated) {
    return (
      <div className="h-screen w-screen bg-[#EFF3F4] dark:bg-[#141414]">
        <Loader />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#EFF3F4] font-sans dark:bg-[#141414]">
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
              setFocusedNode({ id: child.id, data: child.data, rect });
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

      <ViewSwitcher
        createMenuOpen={createMenuOpen}
        onCreateNode={onCreateNode}
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
  return (
    <ReactFlowProvider>
      <CanvasComponent />
    </ReactFlowProvider>
  );
}
