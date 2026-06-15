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
import { AnimatePresence, motion } from 'motion/react';

import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CanvasContextMenu } from '@/components/canvas/ContextMenu';
import { DeleteFolderConfirmDialog } from '@/components/canvas/DeleteFolderConfirmDialog';
import { DetachedNotesSidebar } from '@/components/canvas/DetachedNotesSidebar';
import { EmptyCanvasOverlay } from '@/components/canvas/EmptyCanvasOverlay';
import ConnectionPreviewLine from '@/components/canvas/edges/ConnectionPreviewLine';
import { FocusedView } from '@/components/canvas/FocusedView';
import { FolderEditDialog } from '@/components/canvas/FolderEditDialog';
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
import { ZoomLevelProvider } from '@/contexts/ZoomLevelContext';
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
import {
  createImageDropPreview,
  isImageFile,
  isOsFileDrag,
  persistImportedImage,
  revokeImageDropPreview,
} from '@/lib/importCanvasFiles';
import { isRpcAvailable, loadCanvas, rpcSaveManifest } from '@/lib/rpc';
import {
  type ConnectionStartState,
  shouldReverseEdgeDirection,
} from '@/lib/shouldReverseEdgeDirection';
import type { CanvasBackgroundSetting } from '@/settingsClient';
import { useAppSettingsStore } from '@/store/appSettingsStore';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../paraglide/messages.js';

// ─── 画布颜色 ────────────────────────────────────────────────────────────────
// 亮色 / 暗色两套色板，所有颜色值集中定义，避免散落在 JSX 中。

/** 画布主背景色 (light theme presets — selected via Settings → General). */
const CANVAS_BG_LIGHT_PRESETS = {
  default: '#EFF3F4',
  paper: '#F6F0E4', // warm beige
  mono: '#F4F4F4', // neutral gray
} as const satisfies Record<CanvasBackgroundSetting, string>;
const CANVAS_BG_DARK = '#141414';

/** 背景网格点颜色 */
const GRID_COLOR_LIGHT = '#D8DCDF';
const GRID_COLOR_DARK = 'rgba(255, 255, 255, 0.14)';
const CANVAS_GRID_SIZE = 24;

/** Layout for importing multiple files at once (drop / paste). */
const ASSET_DROP_GRID_COLS = 3;
const ASSET_DROP_GRID_GAP = 180;

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

/** 小地图选中节点填充色 */
const MINIMAP_NODE_SELECTED_COLOR = '#3b82f6';

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
  // Last known pointer position (screen coords). Used to anchor pasted content
  // near the cursor, since paste events carry no coordinates of their own.
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
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
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const createLinkFromText = useCallback(
    async (
      text: string,
      options?: { anchorCenter?: { x: number; y: number } }
    ): Promise<boolean> => {
      const url = extractLinkUrl(text);
      if (!url) {
        return false;
      }
      const data = createLinkNodeData(url);
      if (!data) {
        return false;
      }
      await onCreateNode('link', {
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
        const col = index % ASSET_DROP_GRID_COLS;
        const row = Math.floor(index / ASSET_DROP_GRID_COLS);
        const position = {
          x: anchorCenter.x + col * ASSET_DROP_GRID_GAP,
          y: anchorCenter.y + row * ASSET_DROP_GRID_GAP,
        };

        if (isImageFile(file)) {
          const preview = createImageDropPreview(file);
          try {
            const nodeId = await onCreateNode('image', {
              anchorCenter: position,
              data: {
                imageUrl: preview.imageUrl,
                thumbnailUrl: preview.imageUrl,
                title: preview.title,
              },
              focusViewport: false,
            });
            if (!nodeId) {
              revokeImageDropPreview(preview.imageUrl);
              continue;
            }
            void persistImportedImage(nodeId, file, updateNodeData)
              .catch((error) => {
                console.error(
                  '[canvas] Failed to persist dropped image:',
                  error
                );
                toast.error('Image could not be saved.');
              })
              .finally(() => {
                revokeImageDropPreview(preview.imageUrl);
              });
          } catch (error) {
            revokeImageDropPreview(preview.imageUrl);
            console.error('[canvas] Failed to import dropped image:', error);
          }
          continue;
        }

        try {
          const data = await saveAssetFileWithProgressToast(file);
          await onCreateNode('asset', {
            anchorCenter: position,
            data: { ...data },
          });
        } catch (error) {
          console.error('[canvas] Failed to import dropped file:', error);
        }
      }
    },
    [onCreateNode, updateNodeData]
  );

  // Flow-space anchor for pasted content: prefer the last cursor position so
  // pastes land where the user is looking; fall back to the viewport center.
  const currentPasteAnchor = useCallback(() => {
    const screen = lastPointerRef.current ?? {
      x: globalThis.innerWidth / 2,
      y: globalThis.innerHeight / 2,
    };
    return screenToFlowPosition(screen);
  }, [screenToFlowPosition]);

  const [linkPrompt, setLinkPrompt] = useState<{
    anchorCenter?: { x: number; y: number };
    screen?: { x: number; y: number };
  } | null>(null);
  const assetFileInputRef = useRef<HTMLInputElement>(null);
  const pendingAssetAnchorRef = useRef<{ x: number; y: number } | undefined>(
    undefined
  );
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<{
    nodeId: string;
    kind: 'image' | 'asset';
  } | null>(null);

  const onReplaceNodeFile = useCallback(
    (nodeId: string, kind: 'image' | 'asset') => {
      replaceTargetRef.current = { nodeId, kind };
      const input = replaceFileInputRef.current;
      if (!input) {
        return;
      }
      input.accept = kind === 'image' ? 'image/*' : '';
      input.click();
    },
    []
  );

  const onReplaceFileInputChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      const target = replaceTargetRef.current;
      replaceTargetRef.current = null;
      if (!(file && target)) {
        return;
      }
      try {
        const saved = await saveAssetFileWithProgressToast(file);
        if (target.kind === 'image') {
          updateNodeData(target.nodeId, {
            imageFile: saved.attachmentFile,
            imageUrl: undefined,
            thumbnailFile: saved.thumbnailFile,
            thumbnailUrl: saved.thumbnailUrl,
          });
        } else {
          updateNodeData(target.nodeId, { ...saved });
        }
      } catch (error) {
        console.error('[canvas] replace file failed:', error);
        toast.error(m.toast_replace_failed());
      }
    },
    [updateNodeData]
  );

  // Unified create entry point shared with the canvas right-click menu. Plain
  // kinds are created immediately; `link` opens the URL popover and `asset`
  // opens the file picker, mirroring the bottom create menu's special flows.
  const requestCreate = useCallback(
    async (kind: CreatableCanvasNodeKind, request?: CanvasCreateRequest) => {
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
      await onCreateNode(
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
    onReplaceNodeFile,
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
        if (data) {
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

  useCanvasKeyboard({ onDeleteNodes: requestDeleteNodes, rfInstance });

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (focusedNode || focusedFolder || isEditablePasteTarget(event.target)) {
        return;
      }
      const clipboard = event.clipboardData;
      if (!clipboard) {
        return;
      }

      // Prefer clipboard files (including screenshots pasted as image/png).
      const files = Array.from(clipboard.files ?? []);
      if (files.length === 0) {
        for (const item of Array.from(clipboard.items ?? [])) {
          if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) {
              files.push(file);
            }
          }
        }
      }
      if (files.length > 0) {
        event.preventDefault();
        createAssetsFromFiles(files, currentPasteAnchor());
        return;
      }

      // preventDefault() must be called synchronously during the event
      // dispatch — gate on the sync URL extractor before kicking off the async
      // node creation so the browser does not also paste raw text.
      const text = clipboard.getData('text/plain') ?? '';
      if (extractLinkUrl(text)) {
        event.preventDefault();
        void createLinkFromText(text, { anchorCenter: currentPasteAnchor() });
      }
    };

    globalThis.addEventListener('paste', handlePaste);
    return () => {
      globalThis.removeEventListener('paste', handlePaste);
    };
  }, [
    createAssetsFromFiles,
    createLinkFromText,
    currentPasteAnchor,
    focusedFolder,
    focusedNode,
  ]);

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

  const openNodeFocusedView = useCallback(
    (node: Node) => {
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

  // Two-stage click model (mirrors StickyNode's slide-editor behavior): the
  // first click only selects; clicking a node that was already the sole
  // selection opens its focused view. Selection is sampled on pointerdown —
  // before React Flow applies this click's selection change — so a fresh
  // select-click never opens.
  const soleSelectionOnPointerDownRef = useRef<string | null>(null);
  const onCanvasPointerDownCapture = useCallback((e: React.PointerEvent) => {
    if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) {
      soleSelectionOnPointerDownRef.current = null;
      return;
    }
    const selectedNodes = useCanvasStore
      .getState()
      .nodes.filter((n) => n.selected);
    soleSelectionOnPointerDownRef.current =
      selectedNodes.length === 1 ? (selectedNodes[0]?.id ?? null) : null;
  }, []);

  const onNodeClick = useCallback(
    (e: React.MouseEvent, node: Node) => {
      if (
        e.shiftKey ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        !isFocusableNode(node.type) ||
        soleSelectionOnPointerDownRef.current !== node.id ||
        useCanvasStore.getState().focusedNode?.id === node.id
      ) {
        return;
      }
      openNodeFocusedView(node);
    },
    [openNodeFocusedView]
  );

  // Double-click remains the fast path when the node was not selected yet
  // (first click selects, the dblclick event then opens). Skip when the
  // two-stage click already opened this node so the animation never restarts.
  const onNodeDoubleClick = useCallback(
    (_: any, node: Node) => {
      const state = useCanvasStore.getState();
      if (
        state.focusedNode?.id === node.id ||
        state.focusedFolder?.id === node.id
      ) {
        return;
      }
      openNodeFocusedView(node);
    },
    [openNodeFocusedView]
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

  // Decorate nodes with render-only flags while keeping object identity stable
  // for unchanged nodes. Without the cache, every store update (including each
  // drag frame) would hand React Flow a brand-new object per node and force the
  // whole canvas to re-render.
  const decoratedNodesCacheRef = useRef(
    new Map<
      string,
      { isDropTarget: boolean; isHidden: boolean; result: Node; source: Node }
    >()
  );
  const nodesWithState = useMemo(() => {
    const cache = decoratedNodesCacheRef.current;
    const nextCache = new Map<
      string,
      { isDropTarget: boolean; isHidden: boolean; result: Node; source: Node }
    >();
    const result: Node[] = [];
    for (const node of nodes) {
      if ((node.data as Record<string, unknown>).detached) {
        continue;
      }
      const isHidden =
        focusedNode?.id === node.id || focusedFolder?.id === node.id;
      const isDropTarget = dropTargetId === node.id;
      const cached = cache.get(node.id);
      if (
        cached &&
        cached.source === node &&
        cached.isHidden === isHidden &&
        cached.isDropTarget === isDropTarget
      ) {
        nextCache.set(node.id, cached);
        result.push(cached.result);
        continue;
      }
      const locked = Boolean((node.data as { locked?: unknown }).locked);
      const decorated: Node = {
        ...node,
        data: { ...node.data, isHidden, isDropTarget },
        ...(locked
          ? {
              draggable: false,
              connectable: false,
              deletable: false,
              className: `${node.className ?? ''} is-locked`.trim(),
            }
          : {}),
      };
      nextCache.set(node.id, {
        isDropTarget,
        isHidden,
        result: decorated,
        source: node,
      });
      result.push(decorated);
    }
    decoratedNodesCacheRef.current = nextCache;
    return result;
  }, [nodes, focusedNode, focusedFolder, dropTargetId]);

  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragDepthRef = useRef(0);
  // Cursor position (screen coords) for the drop ghost; rAF-throttled because
  // `dragover` fires very frequently.
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragRafRef = useRef<number | null>(null);

  const onPointerMoveCanvas = useCallback((e: React.MouseEvent) => {
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  useEffect(
    () => () => {
      if (dragRafRef.current != null) {
        cancelAnimationFrame(dragRafRef.current);
      }
    },
    []
  );

  const onDragEnterWindow = useCallback((e: React.DragEvent) => {
    // Only react to OS file drags — internal drags (library notes / detached
    // chips) leave 'Files' off the dataTransfer types list on some platforms.
    if (!isOsFileDrag(e.dataTransfer)) {
      return;
    }
    dragDepthRef.current += 1;
    setIsDraggingFile(true);
  }, []);

  const onDragLeaveWindow = useCallback(() => {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingFile(false);
      setDragPos(null);
    }
  }, []);

  const onDropCanvas = useCallback(
    (e: React.DragEvent | DragEvent) => {
      // Reset overlay state on drop regardless of payload.
      dragDepthRef.current = 0;
      setIsDraggingFile(false);
      setDragPos(null);
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

      // Same as the paste handler: gate synchronously on the URL extractor.
      // The previous `if (createLinkFromText(...))` check was effectively a
      // no-op because the async function always returned a truthy Promise.
      const text = getDroppedText(dataTransfer ?? null);
      if (extractLinkUrl(text)) {
        e.preventDefault();
        void createLinkFromText(text, { anchorCenter: position });
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
    const { clientX, clientY } = e as React.DragEvent;
    if (dragRafRef.current == null) {
      dragRafRef.current = requestAnimationFrame(() => {
        dragRafRef.current = null;
        setDragPos({ x: clientX, y: clientY });
      });
    }
    const dataTransfer = (e as React.DragEvent).dataTransfer;
    if (dataTransfer) {
      const hasFilePayload = isOsFileDrag(dataTransfer);
      if (hasFilePayload) {
        setIsDraggingFile(true);
      }
      const types = Array.from(dataTransfer.types);
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
  const canvasBackgroundPreset = useAppSettingsStore((s) => s.canvasBackground);
  const canvasSnapToGrid = useAppSettingsStore((s) => s.canvasSnapToGrid);
  const canvasBackground = isDarkTheme
    ? CANVAS_BG_DARK
    : (CANVAS_BG_LIGHT_PRESETS[canvasBackgroundPreset] ??
      CANVAS_BG_LIGHT_PRESETS.default);
  const gridColor = isDarkTheme ? GRID_COLOR_DARK : GRID_COLOR_LIGHT;
  const miniMapBackground = isDarkTheme ? MINIMAP_BG_DARK : MINIMAP_BG_LIGHT;
  const miniMapBorder = isDarkTheme
    ? MINIMAP_BORDER_DARK
    : MINIMAP_BORDER_LIGHT;
  const miniMapMask = isDarkTheme ? MINIMAP_MASK_DARK : MINIMAP_MASK_LIGHT;
  const miniMapNodeColor = useCallback(
    (node: Node) =>
      node.selected ? MINIMAP_NODE_SELECTED_COLOR : MINIMAP_NODE_COLOR,
    []
  );
  const activeViewName =
    views.find((view) => view.id === activeViewId)?.name ?? 'Canvas';

  const onExportCanvas = useCallback(async () => {
    const instance = rfInstance.current;
    if (!instance) {
      toast.error(m.toast_canvas_not_ready());
      return;
    }

    try {
      const exported = await exportReactFlowCanvasToPng({
        backgroundColor: canvasBackground,
        fileName: sanitizeExportFileName(activeViewName),
        instance,
      });
      if (exported) {
        toast.success(m.toast_png_exported());
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : m.toast_export_failed();
      toast.error(message);
    }
  }, [activeViewName, canvasBackground]);

  const onExportCanvasJson = useCallback(async () => {
    const instance = rfInstance.current;
    if (!instance) {
      toast.error(m.toast_canvas_not_ready());
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
        toast.success(m.toast_json_exported());
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : m.toast_export_failed();
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
    <div
      className="relative h-screen w-screen overflow-hidden bg-[#EFF3F4] font-sans dark:bg-[#141414]"
      onDragEnter={onDragEnterWindow}
      onDragLeave={onDragLeaveWindow}
      onMouseMove={onPointerMoveCanvas}
      onPointerDownCapture={onCanvasPointerDownCapture}
    >
      <ZoomLevelProvider>
        <ReactFlow
          connectionLineComponent={ConnectionPreviewLine}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={30}
          defaultEdgeOptions={{ type: 'labeledEdge', zIndex: 1 }}
          defaultViewport={savedViewport ?? undefined}
          disableKeyboardA11y
          edges={edges}
          edgeTypes={edgeTypes}
          elevateEdgesOnSelect
          fitView={!savedViewport}
          maxZoom={4}
          minZoom={0.1}
          nodes={nodesWithState}
          nodesDraggable={!(spacePanActive || editableInteractionLocked)}
          nodesFocusable={false}
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
          panOnDrag={spacePanActive}
          panOnScroll={true}
          proOptions={{ hideAttribution: true }}
          selectionMode={SelectionMode.Partial}
          selectionOnDrag={!(spacePanActive || editableInteractionLocked)}
          snapGrid={[CANVAS_GRID_SIZE, CANVAS_GRID_SIZE]}
          snapToGrid={canvasSnapToGrid}
          style={{ backgroundColor: canvasBackground }}
          zoomOnPinch={true}
        >
          <Background
            color={gridColor}
            gap={CANVAS_GRID_SIZE}
            size={1.5}
            variant={BackgroundVariant.Dots}
          />
          <Controls position="bottom-left" />
          <HelperLines horizontal={helperLineH} vertical={helperLineV} />
          <MiniMap
            maskColor={miniMapMask}
            nodeColor={miniMapNodeColor}
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
      </ZoomLevelProvider>

      {nodesWithState.length === 0 ? (
        <EmptyCanvasOverlay
          onCreateNote={async () => {
            await onCreateNode('card');
          }}
          onOpenNoteLibrary={onOpenNoteLibrary}
        />
      ) : null}

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

      <FolderEditDialog />

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
      <input
        className="hidden"
        onChange={onReplaceFileInputChange}
        ref={replaceFileInputRef}
        type="file"
      />

      {linkPrompt ? (
        <LinkCreatePopover
          onClose={() => {
            setLinkPrompt(null);
          }}
          onCreate={async (data) => {
            await onCreateNode('link', {
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

      <AnimatePresence>
        {isDraggingFile ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="pointer-events-none fixed inset-0 z-[200] bg-blue-500/10 backdrop-blur-[2px]"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          >
            {dragPos ? (
              <div
                className="absolute flex items-center gap-2 rounded-xl border-2 border-blue-400 border-dashed bg-white/90 px-4 py-2.5 font-medium text-blue-600 text-sm shadow-xl dark:bg-neutral-900/90 dark:text-blue-300"
                style={{
                  left: dragPos.x,
                  top: dragPos.y,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                {m.drop_to_add()}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="rounded-2xl border-2 border-blue-400 border-dashed bg-white/90 px-8 py-6 font-medium text-blue-600 text-lg shadow-xl dark:bg-neutral-900/90 dark:text-blue-300">
                  {m.drop_to_add()}
                </div>
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
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
