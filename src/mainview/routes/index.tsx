import { useState, useCallback, useMemo, useRef } from 'react';
import { createFileRoute } from "@tanstack/react-router";
import { ReactFlow, Background, MiniMap, applyNodeChanges, applyEdgeChanges, type ReactFlowInstance } from '@xyflow/react';
import type { NodeChange, NodePositionChange, Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AnimatePresence } from 'motion/react';
import CardNode from '@/components/canvas/nodes/CardNode';
import FolderNode from '@/components/canvas/nodes/FolderNode';
import { FocusedView } from '@/components/canvas/FocusedView';
import { FolderView } from '@/components/canvas/FolderView';
import { CreateMenu } from '@/components/canvas/CreateMenu';
import { HelperLines } from '@/components/canvas/HelperLines';
import { initialNodes } from '@/data/initialNodes';
import { getHelperLines } from '@/lib/getHelperLines';

export const Route = createFileRoute("/")({
  component: CanvasComponent,
});

const nodeTypes = {
  card: CardNode,
  folder: FolderNode,
};

function CanvasComponent() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState([]);
  
  const [focusedNode, setFocusedNode] = useState<any>(null);
  const [focusedFolder, setFocusedFolder] = useState<any>(null);
  const [helperLineH, setHelperLineH] = useState<number | undefined>();
  const [helperLineV, setHelperLineV] = useState<number | undefined>();
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const rfInstance = useRef<ReactFlowInstance | null>(null);
  let nodeIdCounter = useRef(100);

  const CARD_W = 350, CARD_H = 450, FOLDER_W = 350, FOLDER_H = 350;

  const findOverlappingFolder = useCallback((draggedNode: Node, allNodes: typeof nodes) => {
    if (draggedNode.type !== 'card') return null;
    const dx = draggedNode.position.x + CARD_W / 2;
    const dy = draggedNode.position.y + CARD_H / 2;
    return allNodes.find(n =>
      n.type === 'folder' &&
      n.id !== draggedNode.id &&
      dx >= n.position.x && dx <= n.position.x + FOLDER_W &&
      dy >= n.position.y && dy <= n.position.y + FOLDER_H
    ) || null;
  }, []);

  const onNodeDrag = useCallback((_: any, node: Node) => {
    setNodes(nds => {
      const folder = findOverlappingFolder(node, nds);
      setDropTargetId(folder?.id || null);
      return nds;
    });
  }, [findOverlappingFolder]);

  const onNodeDragStop = useCallback((_: any, node: Node) => {
    setDropTargetId(null);
    if (node.type !== 'card') return;

    setNodes(nds => {
      const folder = findOverlappingFolder(node, nds);
      if (!folder) return nds;

      const cardNode = nds.find(n => n.id === node.id);
      if (!cardNode) return nds;

      const childEntry = {
        id: cardNode.id,
        type: 'card' as const,
        data: { ...cardNode.data },
      };
      delete childEntry.data.setFocusedNode;
      delete childEntry.data.setFocusedFolder;
      delete childEntry.data.isHidden;

      return nds
        .filter(n => n.id !== node.id)
        .map(n => {
          if (n.id !== folder.id) return n;
          const children = [...(n.data.children || []), childEntry];
          return {
            ...n,
            data: {
              ...n.data,
              children,
              title: `${children.length} items`,
            },
          };
        });
    });
  }, [findOverlappingFolder]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const positionChange = changes.find(
        (c): c is NodePositionChange => c.type === 'position' && c.dragging === true
      );

      if (positionChange?.position) {
        setNodes((nds) => {
          const { horizontal, vertical, snapPosition } = getHelperLines(positionChange, nds);
          setHelperLineH(horizontal);
          setHelperLineV(vertical);

          if (snapPosition.x !== undefined) {
            positionChange.position!.x = snapPosition.x;
          }
          if (snapPosition.y !== undefined) {
            positionChange.position!.y = snapPosition.y;
          }

          return applyNodeChanges(changes, nds);
        });
      } else {
        setHelperLineH(undefined);
        setHelperLineV(undefined);
        setNodes((nds) => applyNodeChanges(changes, nds));
      }
    },
    []
  );

  const onEdgesChange = useCallback(
    (changes: any) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const nodesWithState = useMemo(() => {
    return nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        setFocusedNode,
        setFocusedFolder,
        isHidden: (focusedNode?.id === node.id) || (focusedFolder?.id === node.id),
        isDropTarget: dropTargetId === node.id
      }
    }));
  }, [nodes, focusedNode, focusedFolder, dropTargetId]);

  const onCreateNode = useCallback((type: 'card' | 'folder') => {
    const id = `new-${++nodeIdCounter.current}`;
    const viewport = rfInstance.current?.getViewport();
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const zoom = viewport?.zoom ?? 1;
    const flowX = ((cx - (viewport?.x ?? 0)) / zoom) - (type === 'card' ? CARD_W : FOLDER_W) / 2;
    const flowY = ((cy - (viewport?.y ?? 0)) / zoom) - (type === 'card' ? CARD_H : FOLDER_H) / 2;

    const newNode: any = type === 'card'
      ? {
          id,
          type: 'card',
          position: { x: flowX, y: flowY },
          data: { type: 'text', title: '', content: '', color: 'bg-white' },
        }
      : {
          id,
          type: 'folder',
          position: { x: flowX, y: flowY },
          data: { title: '0 items', subtitle: '', children: [] },
        };

    setNodes(nds => [...nds, newNode]);
  }, []);

  return (
    <div className="w-screen h-screen bg-stone-50 font-sans overflow-hidden">
      <ReactFlow 
        nodes={nodesWithState} 
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
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

      <CreateMenu onCreateNode={onCreateNode} />
    </div>
  );
}
