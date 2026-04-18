import { createFileRoute } from '@tanstack/react-router';
import type { Connection, Node, ReactFlowInstance } from '@xyflow/react';
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import { useTheme } from 'better-themes';
import { AnimatePresence } from 'motion/react';

import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { CanvasContextMenu } from '@/components/canvas/ContextMenu';
import { FocusedView } from '@/components/canvas/FocusedView';
import { FolderView } from '@/components/canvas/FolderView';
import { HelperLines } from '@/components/canvas/HelperLines';
import { ViewSwitcher } from '@/components/canvas/ViewSwitcher';
import { useCanvasKeyboard } from '@/hooks/useCanvasKeyboard';
import { useCanvasPersistence } from '@/hooks/useCanvasPersistence';
import { useContextMenu } from '@/hooks/useContextMenu';
import { useHelperLines } from '@/hooks/useHelperLines';
import { useNodeCreation } from '@/hooks/useNodeCreation';
import { useNodeDrag } from '@/hooks/useNodeDrag';
import { edgeTypes, nodeTypes } from '@/lib/canvasConstants';
import { isRpcAvailable, loadCanvas, rpcSaveManifest } from '@/lib/rpc';
import { sanitizeForPersistence } from '@/lib/sanitize';
import { useCanvasStore } from '@/store/canvasStore';

export const Route = createFileRoute('/')({
  component: CanvasRoute,
});

function CanvasComponent() {
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

  useCanvasPersistence();

  useEffect(() => {
    if (hydrated) {
      return;
    }
    loadCanvas(activeViewId)
      .then(async (data) => {
        if (data && data.nodes.length > 0) {
          hydrate(data.nodes, data.edges);
        } else if (await isRpcAvailable()) {
          // First run: seed workspace with initialNodes
          const { nodes, edges } = useCanvasStore.getState();
          const sanitized = sanitizeForPersistence(nodes, edges);
          await rpcSaveManifest(activeViewId, sanitized.nodes, sanitized.edges);
          // Mark hydration complete so persistence hook doesn't skip the first real edit
          hydrate(nodes, edges);
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
      addConnection(connection);
    },
    [addConnection]
  );

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
  const canvasBackground = isDarkTheme ? '#141414' : '#f5f5f4';
  const gridColor = isDarkTheme ? 'rgba(255, 255, 255, 0.14)' : '#d6d3d1';
  const miniMapBackground = isDarkTheme
    ? 'rgba(28, 28, 28, 0.92)'
    : 'rgba(255, 255, 255, 0.92)';
  const miniMapBorder = isDarkTheme
    ? '1px solid rgba(255, 255, 255, 0.08)'
    : '1px solid rgba(0, 0, 0, 0.08)';
  const miniMapMask = isDarkTheme
    ? 'rgba(20, 20, 20, 0.7)'
    : 'rgba(240, 239, 237, 0.7)';

  return (
    <div className="h-screen w-screen overflow-hidden bg-stone-50 font-sans dark:bg-[#141414]">
      <ReactFlow
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
        onEdgeContextMenu={onEdgeContextMenu}
        onEdgesChange={onEdgesChange}
        onInit={(instance) => {
          rfInstance.current = instance;
        }}
        onNodeContextMenu={onNodeContextMenu}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeDrag={onNodeDrag}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodesChange={onNodesChange}
        onPaneContextMenu={onPaneContextMenu}
        panOnScroll={true}
        proOptions={{ hideAttribution: true }}
        selectionOnDrag={false}
        style={{ backgroundColor: canvasBackground }}
        zoomOnPinch={true}
      >
        <Background color={gridColor} gap={24} size={2} />
        <Controls position="bottom-left" />
        <HelperLines horizontal={helperLineH} vertical={helperLineV} />
        <MiniMap
          maskColor={miniMapMask}
          nodeColor="#ddd"
          nodeStrokeColor="#999"
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
