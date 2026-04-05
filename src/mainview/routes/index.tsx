import { useState, useCallback, useMemo, useRef } from 'react';
import { createFileRoute } from "@tanstack/react-router";
import { ReactFlow, Background, MiniMap, applyEdgeChanges, addEdge, ConnectionMode, ReactFlowProvider, type ReactFlowInstance } from '@xyflow/react';
import type { Node, Connection, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AnimatePresence } from 'motion/react';
import { FocusedView } from '@/components/canvas/FocusedView';
import { FolderView } from '@/components/canvas/FolderView';
import { CreateMenu } from '@/components/canvas/CreateMenu';
import { HelperLines } from '@/components/canvas/HelperLines';
import { CanvasContextMenu } from '@/components/canvas/ContextMenu';
import { CanvasUpdateProvider } from '@/components/canvas/CanvasContext';
import { initialNodes } from '@/data/initialNodes';
import { nodeTypes } from '@/lib/canvasConstants';
import { useNodeDrag } from '@/hooks/useNodeDrag';
import { useHelperLines } from '@/hooks/useHelperLines';
import { useCanvasKeyboard } from '@/hooks/useCanvasKeyboard';
import { useContextMenu } from '@/hooks/useContextMenu';
import { useNodeCreation } from '@/hooks/useNodeCreation';

export const Route = createFileRoute("/")({
  component: CanvasRoute,
});

function CanvasComponent() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [focusedNode, setFocusedNode] = useState<any>(null);
  const [focusedFolder, setFocusedFolder] = useState<any>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const rfInstance = useRef<ReactFlowInstance<any, any> | null>(null);
  const nodeIdCounter = useRef(100);
  const clipboardRef = useRef<any[]>([]);

  const updateNodeData = useCallback(
    (nodeId: string, updates: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n,
        ),
      );
    },
    [setNodes],
  );

  const { dropTargetId, onNodeDragStart, onNodeDrag, onNodeDragStop } =
    useNodeDrag({ setNodes });

  const { helperLineH, helperLineV, onNodesChange } =
    useHelperLines({ setNodes });

  const { contextMenu, setContextMenu, onPaneContextMenu, onNodeContextMenu, handleContextMenuAction } =
    useContextMenu({ setNodes, setEdges, setFocusedNode, setFocusedFolder, rfInstance, clipboardRef, nodeIdCounter });

  const { onCreateNode } =
    useNodeCreation({ setNodes, rfInstance, nodeIdCounter });

  useCanvasKeyboard({
    focusedNode, focusedFolder, setFocusedNode, setFocusedFolder,
    setNodes, setEdges, setCreateMenuOpen, clipboardRef,
  });

  const onEdgesChange = useCallback(
    (changes: any) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, type: 'smoothstep' }, eds)),
    []
  );

  const onNodeDoubleClick = useCallback((_: any, node: Node) => {
    const el = document.querySelector(`[data-id="${node.id}"]`);
    const rect = el?.getBoundingClientRect();
    if (!rect) return;
    if (node.type === 'folder') {
      setFocusedFolder({ id: node.id, data: node.data, rect });
    } else {
      setFocusedNode({ id: node.id, data: node.data, rect });
    }
  }, []);

  const nodesWithState = useMemo(() => {
    return nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        isHidden: (focusedNode?.id === node.id) || (focusedFolder?.id === node.id),
        isDropTarget: dropTargetId === node.id,
      }
    }));
  }, [nodes, focusedNode, focusedFolder, dropTargetId]);

  return (
    <div className="w-screen h-screen bg-stone-50 font-sans overflow-hidden">
      <CanvasUpdateProvider value={updateNodeData}>
        <ReactFlow
          nodes={nodesWithState}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={onNodeDoubleClick}
          defaultEdgeOptions={{ type: 'smoothstep', animated: false }}
          connectionMode={ConnectionMode.Loose}
          onPaneContextMenu={onPaneContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onInit={(instance) => { rfInstance.current = instance; }}
          nodeTypes={nodeTypes}
          panOnScroll={true}
          selectionOnDrag={false}
          zoomOnPinch={true}
          minZoom={0.1}
          maxZoom={4}
          proOptions={{ hideAttribution: true }}
          fitView
        >
          <Background color="#ddd" gap={24} size={2} />
          <HelperLines horizontal={helperLineH} vertical={helperLineV} />
          <MiniMap
            position="bottom-right"
            nodeStrokeColor="#999"
            nodeColor="#ddd"
            maskColor="rgba(240, 239, 237, 0.7)"
            style={{ borderRadius: 8 }}
            pannable
            zoomable
          />
        </ReactFlow>
      </CanvasUpdateProvider>

      <AnimatePresence>
        {focusedFolder && (
          <FolderView
            folder={focusedFolder}
            onClose={() => setFocusedFolder(null)}
            onCardDoubleClick={(child: any, rect: any) => {
              setFocusedNode({ id: child.id, data: child.data, rect });
            }}
          />
        )}
        {focusedNode && (
          <FocusedView
            node={focusedNode}
            onClose={() => setFocusedNode(null)}
          />
        )}
      </AnimatePresence>

      <CreateMenu onCreateNode={onCreateNode} open={createMenuOpen} setOpen={setCreateMenuOpen} />
      <CanvasContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
        onAction={handleContextMenuAction}
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
