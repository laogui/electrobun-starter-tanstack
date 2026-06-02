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
import { LibraryButton } from '@/components/canvas/LibraryButton';
import { LinkCreatePopover } from '@/components/canvas/LinkCreatePopover';
import { ViewSwitcher } from '@/components/canvas/ViewSwitcher';
import { Loader } from '@/components/layout/Loader';
import { LibraryPopup } from '@/components/library/LibraryPopup';
import { SearchDialog } from '@/components/search/SearchDialog';
import { TagSidebar } from '@/components/tags/TagSidebar';
import { TagSidebarButton } from '@/components/tags/TagSidebarButton';
import { initialEdges, initialNodes } from '@/data/initialNodes';
import { useCanvasKeyboard } from '@/hooks/useCanvasKeyboard';
import { useCanvasPersistence } from '@/hooks/useCanvasPersistence';
import { useContextMenu } from '@/hooks/useContextMenu';
import { useHelperLines } from '@/hooks/useHelperLines';
import { useNodeCreation } from '@/hooks/useNodeCreation';
import { useNodeDrag } from '@/hooks/useNodeDrag';
import {
  useEditableInteractionLock,
  useSpacePanMode,
} from '@/hooks/useSpacePanMode';
import { saveAssetFileWithProgressToast } from '@/lib/assetImportProgress';
import { edgeTypes, nodeTypes } from '@/lib/canvasConstants';
import {
  exportReactFlowCanvasToJson,
  exportReactFlowCanvasToPng,
  sanitizeExportFileName,
} from '@/lib/canvasExport';
import { isFocusableNode } from '@/lib/canvasNodePredicates';
import { sanitizeForPersistence } from '@/lib/canvasNodeSerialization';
import {
  type CreatableCanvasNodeKind,
  createLinkNodeData,
  extractLinkUrl,
} from '@/lib/contentTypes';
import type { CanvasCreateRequest } from '@/lib/creatableNodes';
import { isRpcAvailable, loadCanvas, rpcSaveManifest } from '@/lib/rpc';
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

/**
 * One-shot sweep that removes legacy `ghostboard.layoutMode.<viewId>` keys
 * left behind by the previous document-mode persistence. Safe to run on every
 * mount: once cleared, subsequent runs find nothing to do.
 */
const LEGACY_LAYOUT_MODE_KEY_PREFIX = 'ghostboard.layoutMode.';

function sweepLegacyLayoutModeStorage(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(LEGACY_LAYOUT_MODE_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures (private mode etc.)
  }
}

function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

function getDroppedText(dataTransfer: DataTransfer | null): string {
  if (!dataTransfer) {
    return '';
  }
  return (
    dataTransfer.getData('text/uri-list') ||
    dataTransfer.getData('text/plain') ||
    dataTransfer.getData('text')
  );
}

function getDroppedFiles(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer?.files?.length) {
    return [];
  }
  return Array.from(dataTransfer.files).filter((file) => file.size >= 0);
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
  const spacePanActive = useSpacePanMode();
  const editableInteractionLocked = useEditableInteractionLock();

  const { dropTargetId, onNodeDragStart, onNodeDrag, onNodeDragStop } =
    useNodeDrag();

  const { helperLineH, helperLineV, onNodesChange } = useHelperLines();

  const { onCreateNode } = useNodeCreation({ rfInstance });

  const createLinkFromText = useCallback(
    (
      text: string,
      options?: { anchorCenter?: { x: number; y: number } }
    ): boolean => {
      const url = extractLinkUrl(text);
      if (!url) {
        return false;
      }
      const data = createLinkNodeData(url);
      if (!data) {
        return false;
      }
      onCreateNode('link', {
        ...options,
        data: { ...data },
      });
      return true;
    },
    [onCreateNode]
  );

  const createAssetsFromFiles = useCallback(
    async (files: File[], anchorCenter: { x: number; y: number }) => {
      for (const [index, file] of files.entries()) {
        try {
          const data = await saveAssetFileWithProgressToast(file);
          onCreateNode('asset', {
            anchorCenter: {
              x: anchorCenter.x + index * 28,
              y: anchorCenter.y + index * 28,
            },
            data: { ...data },
          });
        } catch (error) {
          console.error('[canvas] Failed to import dropped file:', error);
        }
      }
    },
    [onCreateNode]
  );

  const [linkPrompt, setLinkPrompt] = useState<{
    anchorCenter?: { x: number; y: number };
    screen?: { x: number; y: number };
  } | null>(null);
  const assetFileInputRef = useRef<HTMLInputElement>(null);
  const pendingAssetAnchorRef = useRef<{ x: number; y: number } | undefined>(
    undefined
  );

  // Unified create entry point shared with the canvas right-click menu. Plain
  // kinds are created immediately; `link` opens the URL popover and `asset`
  // opens the file picker, mirroring the bottom create menu's special flows.
  const requestCreate = useCallback(
    (kind: CreatableCanvasNodeKind, request?: CanvasCreateRequest) => {
      if (kind === 'link') {
        setLinkPrompt({
          anchorCenter: request?.anchorCenter,
          screen: request?.screen,
        });
        return;
      }
      if (kind === 'asset') {
        pendingAssetAnchorRef.current = request?.anchorCenter;
        assetFileInputRef.current?.click();
        return;
      }
      onCreateNode(
        kind,
        request?.anchorCenter
          ? { anchorCenter: request.anchorCenter }
          : undefined
      );
    },
    [onCreateNode]
  );

  const onAssetFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) {
        return;
      }
      const anchor =
        pendingAssetAnchorRef.current ??
        screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
      pendingAssetAnchorRef.current = undefined;
      createAssetsFromFiles([file], anchor);
    },
    [createAssetsFromFiles, screenToFlowPosition]
  );

  const hydrate = useCanvasStore((s) => s.hydrate);
  const hydrated = useCanvasStore((s) => s._hydrated);
  const savedViewport = useCanvasStore((s) => s.viewport);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const activeViewId = useCanvasStore((s) => s.activeViewId);
  const views = useCanvasStore((s) => s.views);
  const pendingSearchTarget = useCanvasStore((s) => s.pendingSearchTarget);
  const setPendingSearchTarget = useCanvasStore(
    (s) => s.setPendingSearchTarget
  );
  const setNodes = useCanvasStore((s) => s.setNodes);
  const setEdges = useCanvasStore((s) => s.setEdges);
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
  } = useContextMenu({
    onDeleteNodes: requestDeleteNodes,
    onRequestCreate: requestCreate,
    rfInstance,
  });

  useCanvasPersistence();

  // Cross-view search target: locate node or edge after hydration completes.
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
    const inst = rfInstance.current;
    if (pendingSearchTarget.nodeId) {
      const nodeId = pendingSearchTarget.nodeId;
      setNodes((prev) =>
        prev.map((n) => ({ ...n, selected: n.id === nodeId }))
      );
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
    } else if (pendingSearchTarget.edgeId) {
      const edgeId = pendingSearchTarget.edgeId;
      setEdges((prev) =>
        prev.map((e) => ({ ...e, selected: e.id === edgeId }))
      );
      const edge = inst
        ?.getEdges?.()
        ?.find((e: { id: string }) => e.id === edgeId) as
        | { source?: string; target?: string }
        | undefined;
      if (inst && edge?.source && edge.target) {
        const nodes = (inst.getNodes?.() ?? []) as Array<{
          id: string;
          position?: { x: number; y: number };
          measured?: { width?: number; height?: number };
          width?: number;
          height?: number;
        }>;
        const src = nodes.find((n) => n.id === edge.source);
        const tgt = nodes.find((n) => n.id === edge.target);
        if (src?.position && tgt?.position) {
          const sw = src.measured?.width ?? src.width ?? 240;
          const sh = src.measured?.height ?? src.height ?? 160;
          const tw = tgt.measured?.width ?? tgt.width ?? 240;
          const th = tgt.measured?.height ?? tgt.height ?? 160;
          const cx = (src.position.x + sw / 2 + (tgt.position.x + tw / 2)) / 2;
          const cy = (src.position.y + sh / 2 + (tgt.position.y + th / 2)) / 2;
          const zoom = inst.getViewport?.()?.zoom ?? 1;
          inst.setCenter?.(cx, cy, { zoom, duration: 240 });
        }
      }
    }
    setPendingSearchTarget(null);
  }, [
    hydrated,
    pendingSearchTarget,
    activeViewId,
    setPendingSearchTarget,
    setNodes,
    setEdges,
  ]);

  useEffect(() => {
    if (hydrated) {
      return;
    }
    // Track whether this effect invocation has been superseded by a newer one
    // (e.g. activeViewId changed while loadCanvas was in flight). Without this,
    // a stale promise could hydrate the wrong canvas data.
    let cancelled = false;
    loadCanvas(activeViewId)
      .then(async (data) => {
        if (cancelled) {
          return;
        }
        if (data && data.nodes.length > 0) {
          hydrate(data.nodes, data.edges, data.viewport ?? null);
        } else if (await isRpcAvailable()) {
          if (cancelled) {
            return;
          }
          // First run: seed workspace with initialNodes + initialEdges.
          // Don't persist a viewport yet — fitView frames the seed nodes,
          // and the user's first pan/zoom will save the real viewport.
          const sanitized = sanitizeForPersistence(initialNodes, initialEdges);
          await rpcSaveManifest(activeViewId, sanitized.nodes, sanitized.edges);
          if (!cancelled) {
            hydrate(initialNodes, initialEdges);
          }
        } else {
          // Browser/dev fallback (no Electrobun RPC): hydrate in-memory with
          // the initial data so the canvas is usable for debugging without persistence.
          hydrate(initialNodes, initialEdges);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('[persistence] Failed to load canvas:', error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hydrate, hydrated, activeViewId]);

  useCanvasKeyboard({ onDeleteNodes: requestDeleteNodes });

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (focusedNode || focusedFolder || isEditablePasteTarget(event.target)) {
        return;
      }
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (createLinkFromText(text)) {
        event.preventDefault();
      }
    };

    globalThis.addEventListener('paste', handlePaste);
    return () => {
      globalThis.removeEventListener('paste', handlePaste);
    };
  }, [createLinkFromText, focusedFolder, focusedNode]);

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
      } else if (isFocusableNode(node.type)) {
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

  const onDropCanvas = useCallback(
    (e: React.DragEvent | DragEvent) => {
      const dataTransfer = (e as React.DragEvent).dataTransfer;
      const position = screenToFlowPosition({
        x: (e as React.DragEvent).clientX,
        y: (e as React.DragEvent).clientY,
      });
      const nodeId = dataTransfer?.getData(
        'application/ghostboard-detached-note'
      );
      if (nodeId) {
        e.preventDefault();
        pinNoteToCanvas(nodeId, position);
        return;
      }

      const files = getDroppedFiles(dataTransfer ?? null);
      if (files.length > 0) {
        e.preventDefault();
        createAssetsFromFiles(files, position);
        return;
      }

      const text = getDroppedText(dataTransfer ?? null);
      if (createLinkFromText(text, { anchorCenter: position })) {
        e.preventDefault();
      }
    },
    [
      createAssetsFromFiles,
      createLinkFromText,
      pinNoteToCanvas,
      screenToFlowPosition,
    ]
  );

  const onDragOverCanvas = useCallback((e: React.DragEvent | DragEvent) => {
    e.preventDefault();
    const dataTransfer = (e as React.DragEvent).dataTransfer;
    if (dataTransfer) {
      const types = Array.from(dataTransfer.types);
      const hasFilePayload =
        types.includes('Files') || (dataTransfer.files?.length ?? 0) > 0;
      const hasLinkPayload =
        types.includes('text/uri-list') ||
        types.includes('text/plain') ||
        types.includes('text');
      dataTransfer.dropEffect =
        hasFilePayload || hasLinkPayload ? 'copy' : 'move';
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
        defaultViewport={savedViewport ?? undefined}
        edges={edges}
        edgeTypes={edgeTypes}
        elevateEdgesOnSelect
        fitView={!savedViewport}
        maxZoom={4}
        minZoom={0.1}
        nodes={nodesWithState}
        nodesDraggable={!(spacePanActive || editableInteractionLocked)}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onConnectStart={onConnectStart}
        onDragOver={onDragOverCanvas}
        onDrop={onDropCanvas}
        onEdgeContextMenu={onEdgeContextMenu}
        onEdgesChange={onEdgesChange}
        onInit={(instance) => {
          rfInstance.current = instance;
        }}
        onMoveEnd={(_, viewport) => {
          setViewport(viewport);
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
        selectionOnDrag={!editableInteractionLocked}
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

      <LibraryButton />
      <LibraryPopup rfInstance={rfInstance} />

      <TagSidebarButton />
      <TagSidebar />

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

      <input
        className="hidden"
        onChange={onAssetFileInputChange}
        ref={assetFileInputRef}
        type="file"
      />

      {linkPrompt ? (
        <LinkCreatePopover
          onClose={() => {
            setLinkPrompt(null);
          }}
          onCreate={(data) => {
            onCreateNode('link', {
              ...(linkPrompt.anchorCenter
                ? { anchorCenter: linkPrompt.anchorCenter }
                : {}),
              data: { ...data },
            });
            setLinkPrompt(null);
          }}
          screen={linkPrompt.screen}
        />
      ) : null}
    </div>
  );
}

function CanvasRoute() {
  useEffect(() => {
    sweepLegacyLayoutModeStorage();
  }, []);

  return (
    <ReactFlowProvider>
      <CanvasComponent />
    </ReactFlowProvider>
  );
}
