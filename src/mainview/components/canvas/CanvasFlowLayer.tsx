import type {
  Connection,
  EdgeChange,
  Node,
  NodeChange,
  OnMoveEnd,
  ReactFlowInstance,
} from '@xyflow/react';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  SelectionMode,
} from '@xyflow/react';
import type { RefObject } from 'react';
import { memo, useCallback, useMemo, useRef } from 'react';
import { CanvasViewportChrome } from '@/components/canvas/CanvasViewportChrome';
import ConnectionPreviewLine from '@/components/canvas/edges/ConnectionPreviewLine';
import { HelperLines } from '@/components/canvas/HelperLines';
import { SelectionAIToolbar } from '@/components/canvas/SelectionAIToolbar';
import type { useContextMenu } from '@/hooks/useContextMenu';
import { useHelperLines } from '@/hooks/useHelperLines';
import { useNodeDrag } from '@/hooks/useNodeDrag';
import { useRepelSpring } from '@/hooks/useRepelSpring';
import {
  defaultLabeledEdgeOptions,
  edgeTypes,
  nodeTypes,
} from '@/lib/canvasConstants';
import { isPinnedSticky } from '@/lib/canvasNodePredicates';
import { clearCanvasGraphSelection } from '@/lib/clearCanvasGraphSelection';
import { resolveEdgeMarkers } from '@/lib/edgeMarkers';
import {
  buildFolderExpansionNodes,
  FOLDER_EXPANSION_GAP,
  type FolderExpandedChildData,
  isFolderExpandedChildNode,
} from '@/lib/folderExpansion';
import { isNodeEntering } from '@/lib/motion';
import { persistAppSettingsPatch } from '@/lib/persistAppSettings';
import { applyDragRepulsion, captureRepulsionOrigins } from '@/lib/repulsion';
import { useAppSettingsStore } from '@/store/appSettingsStore';
import {
  previewTopicDraft,
  previewTopicEdits,
  useCanvasStore,
} from '@/store/canvasStore';

// ─── 画布颜色 ────────────────────────────────────────────────────────────────
// 亮色 / 暗色两套色板，所有颜色值集中定义，避免散落在 JSX 中。

/** 背景网格点颜色 */
const GRID_COLOR_LIGHT = '#D8DCDF';
const GRID_COLOR_DARK = 'rgba(255, 255, 255, 0.14)';
const CANVAS_GRID_SIZE = 24;
const REACT_FLOW_PRO_OPTIONS = { hideAttribution: true };
const REACT_FLOW_SELECTED_NODE_Z_OFFSET = 1000;
// React Flow adds REACT_FLOW_SELECTED_NODE_Z_OFFSET to selected nodes. Use
// +1 more so a dragged card still renders above a selected container (folder
// or group) that was brought to front - regardless of which container type
// the card is about to drop onto.
const DRAGGING_OVER_CONTAINER_Z_OFFSET = REACT_FLOW_SELECTED_NODE_Z_OFFSET + 1;

/** 小地图背景色 */
const MINIMAP_BG_LIGHT = 'rgba(255, 255, 255, 0.92)';
const MINIMAP_BG_DARK = 'rgba(28, 28, 28, 0.92)';

/** 小地图遮罩（视口外区域的蒙层） */
const MINIMAP_MASK_LIGHT = 'rgba(240, 239, 237, 0.7)';
const MINIMAP_MASK_DARK = 'rgba(20, 20, 20, 0.7)';

/** 小地图节点填充色 */
const MINIMAP_NODE_COLOR = '#ddd';

/** 小地图选中节点填充色 — unified with the canvas accent (hue 255). */
const MINIMAP_NODE_SELECTED_COLOR = 'hsl(255 60% 52%)';

/** 小地图节点描边色 */
const MINIMAP_NODE_STROKE_COLOR = '#999';

export interface CanvasFlowLayerProps {
  canvasBackground: string;
  closeFolderWithTransition: () => void;
  closingFolderId: string | null;
  editableInteractionLocked: boolean;
  finishFolderClose: (folderId: string) => void;
  isDarkTheme: boolean;
  onConnect: (connection: Connection) => void;
  onConnectEnd: () => void;
  onConnectStart: (
    event: MouseEvent | TouchEvent,
    params: { handleId?: string | null; nodeId: string | null }
  ) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
  onEdgeContextMenu: ReturnType<typeof useContextMenu>['onEdgeContextMenu'];
  onEdgesChange: (changes: EdgeChange[]) => void;
  onFolderChildContextMenu: ReturnType<
    typeof useContextMenu
  >['onFolderChildContextMenu'];
  onMoveEnd: OnMoveEnd;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onNodeContextMenu: ReturnType<typeof useContextMenu>['onNodeContextMenu'];
  onNodeDoubleClick: (event: React.MouseEvent, node: Node) => void;
  onPaneContextMenu: ReturnType<typeof useContextMenu>['onPaneContextMenu'];
  rfInstance: RefObject<ReactFlowInstance<any, any> | null>;
  spacePanActive: boolean;
}

function nodeZIndex(node: Node): number {
  return typeof node.zIndex === 'number' ? node.zIndex : 0;
}

/**
 * The React Flow layer of the canvas route. It owns every subscription that
 * changes per drag frame (nodes, edges, drag/helper-line state, topic draft
 * previews) so the surrounding route shell does not re-render while the user
 * drags or edits the graph.
 */
// react-doctor-disable-next-line react-doctor/no-giant-component
function CanvasFlowLayerComponent({
  canvasBackground,
  closeFolderWithTransition,
  closingFolderId,
  editableInteractionLocked,
  finishFolderClose,
  isDarkTheme,
  onConnect,
  onConnectEnd,
  onConnectStart,
  onDragOver,
  onDrop,
  onEdgeContextMenu,
  onEdgesChange,
  onFolderChildContextMenu,
  onMoveEnd,
  onNodeClick,
  onNodeContextMenu,
  onNodeDoubleClick,
  onPaneContextMenu,
  rfInstance,
  spacePanActive,
}: CanvasFlowLayerProps) {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const topicDraft = useCanvasStore((s) => s.topicDraft);
  const topicEditPreviews = useCanvasStore((s) => s.topicEditPreviews);
  const activeViewId = useCanvasStore((s) => s.activeViewId);
  const focusedNodeId = useCanvasStore((s) => s.focusedNode?.id);
  const focusedFolderId = useCanvasStore((s) => s.focusedFolder?.id);
  const sessionViewport = useCanvasStore((s) => s.sessionViewport);
  const canvasShowMinimap = useAppSettingsStore((s) => s.canvasShowMinimap);
  const interactive = !(
    spacePanActive ||
    editableInteractionLocked ||
    focusedFolderId
  );

  const {
    dropTargetId,
    activeGroupId,
    draggingNodeIds,
    repelAnimationActive,
    rejectedFolderId,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    dragAnchorIdRef,
  } = useNodeDrag();

  const canvasSnapToGrid = useAppSettingsStore((s) => s.canvasSnapToGrid);
  const { helperLineH, helperLineV, onNodesChange } = useHelperLines(
    canvasSnapToGrid ? CANVAS_GRID_SIZE : undefined,
    dragAnchorIdRef
  );

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

  // Click model: a click on a card opens it and never selects it; selection
  // comes only from a marquee drag on the pane. React Flow still emits a
  // select-only batch when a card is pressed, so a press on a node arms this
  // flag and that batch is dropped (clearing any marquee selection instead).
  // The flag disarms right after the click finishes, so keyboard or marquee
  // selections later are never mistaken for it.
  const suppressClickSelectRef = useRef(false);
  const onPointerDownCapture = useCallback((event: React.PointerEvent) => {
    const onNode = Boolean(
      (event.target as Element | null)?.closest?.('.react-flow__node')
    );
    suppressClickSelectRef.current = onNode;
    if (!onNode) {
      return;
    }
    window.addEventListener(
      'pointerup',
      () => {
        setTimeout(() => {
          suppressClickSelectRef.current = false;
        }, 0);
      },
      { once: true }
    );
  }, []);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (
        suppressClickSelectRef.current &&
        changes.length > 0 &&
        changes.every((change) => change.type === 'select')
      ) {
        suppressClickSelectRef.current = false;
        clearCanvasGraphSelection();
        return;
      }
      onNodesChange(changes);
    },
    [onNodesChange]
  );

  // The in-flight Topic draft is rendered like a node but lives outside the
  // store's `nodes`, so it never reaches persistence, history, selection, or
  // the node count. It joins the graph only when the first title is committed.
  const topicPreview = useMemo(() => {
    const draft = previewTopicDraft(nodes, edges, topicDraft, activeViewId);
    return {
      ...draft,
      nodes: previewTopicEdits(draft.nodes, topicEditPreviews),
    };
  }, [nodes, edges, topicDraft, activeViewId, topicEditPreviews]);

  const renderEdges = useMemo(
    () => resolveEdgeMarkers(topicPreview.edges, topicPreview.nodes),
    [topicPreview.edges, topicPreview.nodes]
  );

  const renderSourceNodes = useMemo(() => {
    const baseNodes = topicPreview.nodes;
    if (!(focusedFolderId && folderExpansionNodes.length > 0)) {
      return baseNodes;
    }
    const combined = [...baseNodes, ...folderExpansionNodes];
    return applyDragRepulsion({
      activeIds: new Set(folderExpansionNodes.map((node) => node.id)),
      gap: FOLDER_EXPANSION_GAP,
      nodes: combined,
      origins: captureRepulsionOrigins(baseNodes),
      paused: closingFolderId === focusedFolderId,
    });
  }, [
    closingFolderId,
    focusedFolderId,
    folderExpansionNodes,
    topicPreview.nodes,
  ]);

  // Decorate nodes with render-only flags while keeping object identity stable
  // for unchanged nodes. Without the cache, every store update (including each
  // drag frame) would hand React Flow a brand-new object per node and force the
  // whole canvas to re-render.
  const decoratedNodesCacheRef = useRef<Map<
    string,
    {
      expansionChildren: FolderExpandedChildData[] | undefined;
      folderPeekClass: string;
      isClosing: boolean;
      isDropTarget: boolean;
      isExpanded: boolean;
      isOpenInPanel: boolean;
      isRejectingDrop: boolean;
      renderZIndex: number | undefined;
      result: Node;
      source: Node;
    }
  > | null>(null);
  decoratedNodesCacheRef.current ??= new Map();
  const decoratedNodesCache = decoratedNodesCacheRef.current;
  const draggingOverContainerIds = useMemo(() => {
    if (!((dropTargetId || activeGroupId) && draggingNodeIds.length > 0)) {
      return null;
    }
    return new Set(draggingNodeIds);
  }, [dropTargetId, activeGroupId, draggingNodeIds]);
  const dragLayerZIndex = useMemo(() => {
    if (!draggingOverContainerIds) {
      return;
    }
    // React Flow adds 1000 to selected nodes by default. Use +1001 so a
    // dragged card still renders above a selected container (folder/group)
    // that was brought front.
    return (
      Math.max(0, ...nodes.map(nodeZIndex)) + DRAGGING_OVER_CONTAINER_Z_OFFSET
    );
  }, [nodes, draggingOverContainerIds]);
  const folderAnchorZIndex = useMemo(() => {
    if (!(focusedFolderId && folderExpansionNodes.length > 0)) {
      return;
    }
    return Math.max(...folderExpansionNodes.map(nodeZIndex)) + 1;
  }, [focusedFolderId, folderExpansionNodes]);
  const folderExpansionChildren = useMemo(
    () =>
      folderExpansionNodes.map((node) => node.data as FolderExpandedChildData),
    [folderExpansionNodes]
  );
  const nodesWithState = useMemo(() => {
    const cache = decoratedNodesCache;
    const nextCache = new Map<
      string,
      {
        expansionChildren: FolderExpandedChildData[] | undefined;
        folderPeekClass: string;
        isClosing: boolean;
        isDropTarget: boolean;
        isExpanded: boolean;
        isOpenInPanel: boolean;
        isRejectingDrop: boolean;
        renderZIndex: number | undefined;
        result: Node;
        source: Node;
      }
    >();
    const result: Node[] = [];
    for (const node of renderSourceNodes) {
      if ((node.data as Record<string, unknown>).detached) {
        continue;
      }
      const isExpansionChild = isFolderExpandedChildNode(node);
      // The card open in the side panel stays visible, outlined.
      const isOpenInPanel = !isExpansionChild && focusedNodeId === node.id;
      const folderPeekClass = focusedFolderId
        ? focusedFolderId === node.id
          ? 'folder-peek-anchor'
          : isExpansionChild
            ? ''
            : 'folder-peek-muted'
        : '';
      const isExpanded = focusedFolderId === node.id;
      const isClosing = isExpanded && closingFolderId === node.id;
      const expansionChildren = isExpanded
        ? folderExpansionChildren
        : undefined;
      const isDropTarget = dropTargetId === node.id;
      const isRejectingDrop = rejectedFolderId === node.id;
      const renderZIndex = isExpanded
        ? folderAnchorZIndex
        : draggingOverContainerIds?.has(node.id)
          ? dragLayerZIndex
          : undefined;
      const cached = cache.get(node.id);
      const sameRenderData =
        cached &&
        cached.source.type === node.type &&
        cached.source.data === node.data &&
        cached.isOpenInPanel === isOpenInPanel &&
        cached.folderPeekClass === folderPeekClass &&
        cached.expansionChildren === expansionChildren &&
        cached.isExpanded === isExpanded &&
        cached.isClosing === isClosing &&
        cached.isDropTarget === isDropTarget &&
        cached.isRejectingDrop === isRejectingDrop &&
        (node.type !== 'folder' ||
          (cached.result.data.onCollapseComplete === finishFolderClose &&
            cached.result.data.onExpandedChildContextMenu ===
              onFolderChildContextMenu));
      if (
        sameRenderData &&
        cached.source === node &&
        cached.renderZIndex === renderZIndex
      ) {
        nextCache.set(node.id, cached);
        result.push(cached.result);
        continue;
      }
      const locked = Boolean((node.data as { locked?: unknown }).locked);
      const className = [
        node.className,
        locked ? 'is-locked' : '',
        folderPeekClass,
        isOpenInPanel ? 'is-open-in-panel' : '',
        isNodeEntering(node.id) ? 'node-entering' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const decorated: Node = {
        ...node,
        // Position changes must not invalidate memoized card/extension content.
        data: sameRenderData
          ? cached.result.data
          : {
              ...node.data,
              isDropTarget,
              isRejectingDrop,
              ...(node.type === 'folder'
                ? {
                    expansionChildren,
                    isExpanded,
                    isClosing,
                    onCollapseComplete: finishFolderClose,
                    onExpandedChildContextMenu: onFolderChildContextMenu,
                  }
                : {}),
            },
        ...(renderZIndex === undefined ? {} : { zIndex: renderZIndex }),
        ...(className ? { className } : {}),
        ...(locked
          ? {
              draggable: false,
              connectable: false,
              deletable: false,
            }
          : {}),
        ...(isPinnedSticky(node) ? { draggable: false } : {}),
      };
      nextCache.set(node.id, {
        expansionChildren,
        folderPeekClass,
        isClosing,
        isDropTarget,
        isExpanded,
        isOpenInPanel,
        isRejectingDrop,
        renderZIndex,
        result: decorated,
        source: node,
      });
      result.push(decorated);
    }
    decoratedNodesCacheRef.current = nextCache;
    return result;
  }, [
    renderSourceNodes,
    // The memo body only reads `focusedNodeId` (to outline the open card on
    // canvas), so depending on the whole object would re-run this O(n) loop on
    // every rect/data change to the focused item even though the id is stable.
    focusedNodeId,
    focusedFolderId,
    closingFolderId,
    dropTargetId,
    rejectedFolderId,
    decoratedNodesCache,
    draggingOverContainerIds,
    dragLayerZIndex,
    folderAnchorZIndex,
    folderExpansionChildren,
    finishFolderClose,
    onFolderChildContextMenu,
  ]);
  const displayNodes = useRepelSpring(
    nodesWithState,
    repelAnimationActive,
    draggingNodeIds
  );

  // Cull off-screen nodes/edges, except while an inline editor has focus:
  // panning a focused sticky/topic/input off screen would unmount it before
  // its blur-commit runs. MiniMap, marquee selection, keyboard navigation and
  // getIntersectingNodes read React Flow's internal node lookup, not the DOM,
  // so they are unaffected; unmeasured nodes are always rendered by React
  // Flow so fitView still sees their size.
  const cullOffscreen = !editableInteractionLocked;
  const gridColor = isDarkTheme ? GRID_COLOR_DARK : GRID_COLOR_LIGHT;
  const miniMapBackground = isDarkTheme ? MINIMAP_BG_DARK : MINIMAP_BG_LIGHT;
  const miniMapMask = isDarkTheme ? MINIMAP_MASK_DARK : MINIMAP_MASK_LIGHT;
  const miniMapNodeColor = useCallback(
    (node: Node) =>
      node.selected ? MINIMAP_NODE_SELECTED_COLOR : MINIMAP_NODE_COLOR,
    []
  );
  const onInit = useCallback(
    (instance: ReactFlowInstance<any, any>) => {
      rfInstance.current = instance;
    },
    [rfInstance]
  );
  const onPaneClick = useCallback(() => {
    if (useCanvasStore.getState().focusedFolder) {
      closeFolderWithTransition();
    }
  }, [closeFolderWithTransition]);
  const onShowMinimapChange = useCallback((show: boolean) => {
    persistAppSettingsPatch({ canvasShowMinimap: show }).catch(() => undefined);
  }, []);

  return (
    <ReactFlow
      connectionLineComponent={ConnectionPreviewLine}
      connectionMode={ConnectionMode.Loose}
      connectionRadius={30}
      defaultEdgeOptions={defaultLabeledEdgeOptions}
      defaultViewport={sessionViewport ?? undefined}
      disableKeyboardA11y
      edges={renderEdges}
      edgeTypes={edgeTypes}
      elevateEdgesOnSelect
      fitView={!sessionViewport}
      maxZoom={4}
      minZoom={0.1}
      multiSelectionKeyCode={null}
      nodes={displayNodes}
      nodesDraggable={interactive}
      nodesFocusable={false}
      nodeTypes={nodeTypes}
      onConnect={onConnect}
      onConnectEnd={onConnectEnd}
      onConnectStart={onConnectStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onEdgeContextMenu={onEdgeContextMenu}
      onEdgesChange={onEdgesChange}
      onInit={onInit}
      onlyRenderVisibleElements={cullOffscreen}
      onMoveEnd={onMoveEnd}
      onNodeClick={onNodeClick}
      onNodeContextMenu={onNodeContextMenu}
      onNodeDoubleClick={onNodeDoubleClick}
      onNodeDrag={onNodeDrag}
      onNodeDragStart={onNodeDragStart}
      onNodeDragStop={onNodeDragStop}
      onNodesChange={handleNodesChange}
      onPaneClick={onPaneClick}
      onPaneContextMenu={onPaneContextMenu}
      onPointerDownCapture={onPointerDownCapture}
      panOnDrag={spacePanActive}
      panOnScroll={true}
      proOptions={REACT_FLOW_PRO_OPTIONS}
      selectionMode={SelectionMode.Partial}
      selectionOnDrag={interactive}
      selectNodesOnDrag={false}
      style={{ backgroundColor: canvasBackground }}
      zoomOnDoubleClick={false}
      zoomOnPinch={true}
    >
      <Background
        color={gridColor}
        gap={CANVAS_GRID_SIZE}
        size={1.5}
        variant={BackgroundVariant.Dots}
      />
      <HelperLines horizontal={helperLineH} vertical={helperLineV} />
      <SelectionAIToolbar />
      <CanvasViewportChrome
        backgroundColor={miniMapBackground}
        maskColor={miniMapMask}
        nodeColor={miniMapNodeColor}
        nodeStrokeColor={MINIMAP_NODE_STROKE_COLOR}
        onShowMinimapChange={onShowMinimapChange}
        showMinimap={canvasShowMinimap}
      />
    </ReactFlow>
  );
}

export const CanvasFlowLayer = memo(CanvasFlowLayerComponent);
