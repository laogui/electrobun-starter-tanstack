import { createFileRoute } from '@tanstack/react-router';
import type {
  Connection,
  Node,
  NodeChange,
  ReactFlowInstance,
} from '@xyflow/react';
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
import * as motion from 'motion/react-m';

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { toast } from 'sonner';
import { CanvasToolbar } from '@/components/canvas/CanvasToolbar';
import { CanvasContextMenu } from '@/components/canvas/ContextMenu';
import { DeleteFolderConfirmDialog } from '@/components/canvas/DeleteFolderConfirmDialog';
import { DetachedNotesSidebar } from '@/components/canvas/DetachedNotesSidebar';
import { EmptyCanvasOverlay } from '@/components/canvas/EmptyCanvasOverlay';
import ConnectionPreviewLine from '@/components/canvas/edges/ConnectionPreviewLine';
import { FocusedView } from '@/components/canvas/FocusedView';
import { FolderEditDialog } from '@/components/canvas/FolderEditDialog';
import { FolderView } from '@/components/canvas/FolderView';
import { HelperLines } from '@/components/canvas/HelperLines';
import { LinkCreatePopover } from '@/components/canvas/LinkCreatePopover';
import { RecordingRecorder } from '@/components/canvas/RecordingRecorder';
import { ViewSwitcher } from '@/components/canvas/ViewSwitcher';
import { Loader } from '@/components/layout/Loader';
import { LibraryPopup } from '@/components/library/LibraryPopup';
import { SearchDialog } from '@/components/search/SearchDialog';
import { TagSidebar } from '@/components/tags/TagSidebar';
import { ZoomLevelProvider } from '@/contexts/ZoomLevelContext';
import {
  initialEdges,
  initialNodes,
  initialWidgetSeeds,
} from '@/data/initialNodes';
import type { RecordingResult } from '@/hooks/useAudioRecorder';
import { useCanvasKeyboard } from '@/hooks/useCanvasKeyboard';
import { useCanvasPersistence } from '@/hooks/useCanvasPersistence';
import { useCanvasViewportResize } from '@/hooks/useCanvasViewportResize';
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
  type CanvasExportDocument,
  collectWidgetIdsFromNodes,
  exportReactFlowCanvasToJson,
  exportReactFlowCanvasToPng,
  sanitizeExportFileName,
} from '@/lib/canvasExport';
import {
  buildImportedCanvasPayload,
  collectWidgetIdsFromCanvasExport,
} from '@/lib/canvasImport';
import { isFocusableNode } from '@/lib/canvasNodePredicates';
import { sanitizeForPersistence } from '@/lib/canvasNodeSerialization';
import { sortNodesByParent } from '@/lib/canvasUtils';
import {
  type CreatableCanvasNodeKind,
  createLinkNodeData,
  extractLinkUrl,
} from '@/lib/contentTypes';
import type { CanvasCreateRequest } from '@/lib/creatableNodes';
import {
  computeImageNodeSize,
  createImageDropPreview,
  isImageFile,
  isOsFileDrag,
  persistImportedImage,
  readCanvasExportJsonFile,
  readImageNaturalSize,
  revokeImageDropPreview,
} from '@/lib/importCanvasFiles';
import { saveRecording } from '@/lib/recordingFiles';
import { isRpcAvailable, loadCanvas, rpcSaveManifest } from '@/lib/rpc';
import {
  type ConnectionStartState,
  shouldReverseEdgeDirection,
} from '@/lib/shouldReverseEdgeDirection';
import { cn } from '@/lib/utils';
import { suppressViewportPersist } from '@/lib/viewportPersist';
import type { WidgetKind, WidgetRecord } from '@/lib/widgetTypes';
import type { CanvasBackgroundSetting } from '@/settingsClient';
import { useAppSettingsStore } from '@/store/appSettingsStore';
import { type CreateNodeOptions, useCanvasStore } from '@/store/canvasStore';
import { useWidgetStore, type WidgetStoreState } from '@/store/widgetStore';

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
const REACT_FLOW_SELECTED_NODE_Z_OFFSET = 1000;
// React Flow adds REACT_FLOW_SELECTED_NODE_Z_OFFSET to selected nodes. Use
// +1 more so a dragged card still renders above a selected container (folder
// or group) that was brought to front - regardless of which container type
// the card is about to drop onto.
const DRAGGING_OVER_CONTAINER_Z_OFFSET = REACT_FLOW_SELECTED_NODE_Z_OFFSET + 1;

function nodeZIndex(node: Node): number {
  return typeof node.zIndex === 'number' ? node.zIndex : 0;
}

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

/** 小地图选中节点填充色 — unified with the canvas accent (hue 255). */
const MINIMAP_NODE_SELECTED_COLOR = 'hsl(255 60% 52%)';

/** 小地图节点描边色 */
const MINIMAP_NODE_STROKE_COLOR = '#999';

// ─────────────────────────────────────────────────────────────────────────────

const WIDGET_CREATE_KINDS = new Set<CreatableCanvasNodeKind>([
  'checklist',
  'pomodoro',
  'reminder',
]);

function isWidgetCreateKind(kind: CreatableCanvasNodeKind): kind is WidgetKind {
  return WIDGET_CREATE_KINDS.has(kind);
}

async function materializeInitialWidgetSeeds(
  nodes: Node[],
  createWidgetRecord: (
    kind: WidgetKind,
    title?: string
  ) => Promise<WidgetRecord | null>,
  updateWidgetRecord: WidgetStoreState['updateWidget'],
  saveWidgetNow: WidgetStoreState['saveWidgetNow']
): Promise<Node[]> {
  const seededNodes: Node[] = [];
  for (const node of nodes) {
    if (node.type !== 'widget') {
      seededNodes.push(node);
      continue;
    }
    const seed = initialWidgetSeeds[node.id];
    if (!seed) {
      seededNodes.push(node);
      continue;
    }
    const existingWidgetId =
      typeof node.data.widgetId === 'string' ? node.data.widgetId : '';
    if (existingWidgetId) {
      seededNodes.push(node);
      continue;
    }

    const widget = await createWidgetRecord(seed.kind, seed.title);
    if (!widget) {
      throw new Error(`Failed to create initial widget for node ${node.id}.`);
    }
    updateWidgetRecord(
      widget.id,
      (current) => ({
        ...current,
        title: seed.title,
        data: seed.data,
        updatedAt: new Date().toISOString(),
      }),
      { recordHistory: false }
    );
    await saveWidgetNow(widget.id);

    seededNodes.push({
      ...node,
      data: {
        ...node.data,
        widgetId: widget.id,
        kind: widget.kind,
      },
    });
  }
  return seededNodes;
}

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

interface RecordingNumberEntry {
  data?: unknown;
  type?: string;
}

function readRecordingNumber(data: unknown): number {
  const value = (data as { recordingNumber?: unknown } | undefined)
    ?.recordingNumber;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function maxRecordingNumberFromEntry(entry: RecordingNumberEntry): number {
  let max = entry.type === 'recording' ? readRecordingNumber(entry.data) : 0;

  if (entry.type === 'folder') {
    const children = (entry.data as { children?: unknown } | undefined)
      ?.children;
    if (Array.isArray(children)) {
      for (const child of children as RecordingNumberEntry[]) {
        max = Math.max(max, maxRecordingNumberFromEntry(child));
      }
    }
  }

  return max;
}

function maxRecordingNumberFromNodes(nodes: Node[]): number {
  return nodes.reduce(
    (max, node) => Math.max(max, maxRecordingNumberFromEntry(node)),
    0
  );
}

interface CanvasUiState {
  detachedSidebarOpen: boolean;
  dragPos: { x: number; y: number } | null;
  isDraggingFile: boolean;
  linkPrompt: {
    anchorCenter?: { x: number; y: number };
    screen?: { x: number; y: number };
  } | null;
  pendingFolderDeleteIds: string[] | null;
  recorderNumber: number | null;
}

const initialCanvasUiState: CanvasUiState = {
  detachedSidebarOpen: false,
  dragPos: null,
  isDraggingFile: false,
  linkPrompt: null,
  pendingFolderDeleteIds: null,
  recorderNumber: null,
};

function canvasUiReducer(
  state: CanvasUiState,
  patch: Partial<CanvasUiState>
): CanvasUiState {
  return { ...state, ...patch };
}

// The canvas route wires React Flow, drag/drop, keyboard shortcuts, and modals.
// react-doctor-disable-next-line react-doctor/no-giant-component
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
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const { screenToFlowPosition } = useReactFlow();
  const spacePanActive = useSpacePanMode();
  const editableInteractionLocked = useEditableInteractionLock();

  const {
    dropTargetId,
    activeGroupId,
    draggingNodeIds,
    repelAnimationActive,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  } = useNodeDrag();

  const { helperLineH, helperLineV, onNodesChange } = useHelperLines();

  const { onCreateNode } = useNodeCreation({ rfInstance });
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const createWidgetRecord = useWidgetStore((s) => s.createWidget);
  const updateWidgetRecord = useWidgetStore((s) => s.updateWidget);
  const saveWidgetNow = useWidgetStore((s) => s.saveWidgetNow);

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

  const importCanvasExportDocument = useCallback(
    async (
      document_: CanvasExportDocument,
      anchorCenter: { x: number; y: number }
    ) => {
      const widgetIdMap = new Map<string, string>();
      const allWidgetIds = collectWidgetIdsFromCanvasExport(document_);
      for (const widgetId of allWidgetIds) {
        const sourceWidget = document_.widgets?.[widgetId];
        if (!sourceWidget) {
          continue;
        }

        // Imported widgets must be independent of the source canvas, matching
        // duplicate/paste semantics for widget-backed nodes.
        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        const createdWidget = await createWidgetRecord(
          sourceWidget.kind,
          sourceWidget.title
        );
        if (!createdWidget) {
          continue;
        }

        const now = new Date().toISOString();
        updateWidgetRecord(
          createdWidget.id,
          () => ({
            ...sourceWidget,
            id: createdWidget.id,
            createdAt: now,
            updatedAt: now,
          }),
          { recordHistory: false }
        );
        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        await saveWidgetNow(createdWidget.id);
        widgetIdMap.set(widgetId, createdWidget.id);
      }

      const skippedWidgetCount = allWidgetIds.length - widgetIdMap.size;

      const state = useCanvasStore.getState();
      const imported = buildImportedCanvasPayload(
        document_,
        anchorCenter,
        state.nodes,
        state.edges,
        widgetIdMap
      );
      if (imported.nodes.length === 0) {
        toast.error('Canvas JSON did not contain importable nodes.');
        return;
      }

      state.saveSnapshot();
      state.setNodes((prev) =>
        sortNodesByParent([
          ...prev.map((node) => ({ ...node, selected: false })),
          ...imported.nodes,
        ])
      );
      state.setEdges((prev) => [...prev, ...imported.edges]);
      if (skippedWidgetCount > 0) {
        toast.warning(
          `Skipped ${skippedWidgetCount} widget(s) that could not be imported.`
        );
      } else {
        toast.success('Canvas JSON imported.');
      }
    },
    [createWidgetRecord, saveWidgetNow, updateWidgetRecord]
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

        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        const canvasExportDocument = await readCanvasExportJsonFile(file);
        if (canvasExportDocument) {
          try {
            // Keep dropped files inserted in visual grid order.
            // react-doctor-disable-next-line react-doctor/async-await-in-loop
            await importCanvasExportDocument(canvasExportDocument, position);
          } catch (error) {
            console.error('[canvas] Failed to import canvas JSON:', error);
            toast.error('Canvas JSON could not be imported.');
          }
          continue;
        }

        if (isImageFile(file)) {
          const preview = createImageDropPreview(file);
          // Size the card to the image's aspect ratio (clamped) before it is
          // created, so the thumbnail shows in full. A failed read falls back
          // to the registry default size.
          // react-doctor-disable-next-line react-doctor/async-await-in-loop
          const naturalSize = await readImageNaturalSize(preview.imageUrl);
          const size = naturalSize
            ? computeImageNodeSize(naturalSize.width, naturalSize.height)
            : undefined;
          try {
            // Keep dropped files inserted in visual grid order.
            // react-doctor-disable-next-line react-doctor/async-await-in-loop
            const nodeId = await onCreateNode('image', {
              anchorCenter: position,
              ...(size ? { size } : {}),
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
            persistImportedImage(nodeId, file, updateNodeData)
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
          // Keep dropped files inserted in visual grid order.
          // react-doctor-disable-next-line react-doctor/async-await-in-loop
          const data = await saveAssetFileWithProgressToast(file);
          // Keep dropped files inserted in visual grid order.
          // react-doctor-disable-next-line react-doctor/async-await-in-loop
          await onCreateNode('asset', {
            anchorCenter: position,
            data: { ...data },
          });
        } catch (error) {
          console.error('[canvas] Failed to import dropped file:', error);
        }
      }
    },
    [importCanvasExportDocument, onCreateNode, updateNodeData]
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

  const [canvasUi, setCanvasUi] = useReducer(
    canvasUiReducer,
    initialCanvasUiState
  );
  const {
    detachedSidebarOpen,
    dragPos,
    isDraggingFile,
    linkPrompt,
    pendingFolderDeleteIds,
    recorderNumber,
  } = canvasUi;
  const setLinkPrompt = useCallback(
    (linkPrompt: CanvasUiState['linkPrompt']) => {
      setCanvasUi({ linkPrompt });
    },
    []
  );
  const setRecorderNumber = useCallback((recorderNumber: number | null) => {
    setCanvasUi({ recorderNumber });
  }, []);
  const setDetachedSidebarOpen = useCallback((detachedSidebarOpen: boolean) => {
    setCanvasUi({ detachedSidebarOpen });
  }, []);
  const setPendingFolderDeleteIds = useCallback(
    (pendingFolderDeleteIds: string[] | null) => {
      setCanvasUi({ pendingFolderDeleteIds });
    },
    []
  );
  const setDragState = useCallback(
    (patch: Pick<CanvasUiState, 'dragPos' | 'isDraggingFile'>) => {
      setCanvasUi(patch);
    },
    []
  );
  const lastRecordingAnchorRef = useRef<{ x: number; y: number } | undefined>(
    undefined
  );
  const lastRecordingKindRef = useRef<CreatableCanvasNodeKind | undefined>(
    undefined
  );
  const reservedRecordingNumberRef = useRef(0);
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

  const closeRecorder = useCallback(() => {
    lastRecordingAnchorRef.current = undefined;
    lastRecordingKindRef.current = undefined;
    setRecorderNumber(null);
  }, [setRecorderNumber]);

  const openRecorder = useCallback(
    (anchorCenter?: { x: number; y: number }) => {
      lastRecordingAnchorRef.current = anchorCenter;
      lastRecordingKindRef.current = 'recording';
      const maxNumber = Math.max(
        reservedRecordingNumberRef.current,
        maxRecordingNumberFromNodes(useCanvasStore.getState().nodes)
      );
      const nextNumber = maxNumber + 1;
      reservedRecordingNumberRef.current = nextNumber;
      setRecorderNumber(nextNumber);
      setCreateMenuOpen(false);
    },
    [setCreateMenuOpen, setRecorderNumber]
  );

  const handleRecordingComplete = useCallback(
    async (result: RecordingResult) => {
      const number = recorderNumber ?? 1;
      setRecorderNumber(null);
      const targetKind = lastRecordingKindRef.current ?? 'recording';
      const anchorCenter = lastRecordingAnchorRef.current;
      lastRecordingAnchorRef.current = undefined;
      lastRecordingKindRef.current = undefined;
      try {
        const data = await saveRecording({
          blob: result.blob,
          durationMs: result.durationMs,
          mimeType: result.mimeType,
          recordingNumber: number,
        });
        await onCreateNode(targetKind, {
          ...(anchorCenter ? { anchorCenter } : {}),
          data: { ...data },
        });
      } catch (error) {
        console.error('[index] Failed to save recording:', error);
        toast.error(m.toast_recording_save_failed());
      }
    },
    [onCreateNode, recorderNumber, setRecorderNumber]
  );

  // Opens the shared hidden file input used by asset/image creation. The
  // picked file flows through `onAssetFileInputChange` into
  // `createAssetsFromFiles`, whose image branch sizes the card to the
  // image's aspect ratio and persists it.
  const openAssetFilePicker = useCallback(
    (accept: string, anchorCenter?: { x: number; y: number }) => {
      pendingAssetAnchorRef.current = anchorCenter;
      const input = assetFileInputRef.current;
      if (!input) {
        return;
      }
      input.accept = accept;
      input.click();
    },
    []
  );

  // Bottom create menu's "Image" entry: pick a file first, then create the
  // card at the viewport center (the picker-change handler's default anchor).
  const openImagePicker = useCallback(() => {
    openAssetFilePicker('image/*');
  }, [openAssetFilePicker]);

  // Unified create entry point shared with the canvas right-click menu. Plain
  // kinds are created immediately; `link` opens the URL popover, `asset` and
  // `image` open the file picker (image restricted to image files), and
  // `recording` opens the microphone dialog — mirroring the bottom create
  // menu's special flows.
  const requestCreate = useCallback(
    async (kind: CreatableCanvasNodeKind, request?: CanvasCreateRequest) => {
      if (kind === 'link') {
        setLinkPrompt({
          anchorCenter: request?.anchorCenter,
          screen: request?.screen,
        });
        return;
      }
      if (kind === 'asset' || kind === 'image') {
        openAssetFilePicker(
          kind === 'image' ? 'image/*' : '',
          request?.anchorCenter
        );
        return;
      }
      if (kind === 'recording') {
        openRecorder(request?.anchorCenter);
        return;
      }
      if (isWidgetCreateKind(kind)) {
        const widget = await createWidgetRecord(kind);
        if (!widget) {
          toast.error(m.toast_widget_create_failed());
          return;
        }
        await onCreateNode(kind, {
          ...(request?.anchorCenter
            ? { anchorCenter: request.anchorCenter }
            : {}),
          data: { widgetId: widget.id, kind: widget.kind },
        });
        return;
      }
      await onCreateNode(
        kind,
        request?.anchorCenter
          ? { anchorCenter: request.anchorCenter }
          : undefined
      );
    },
    [
      createWidgetRecord,
      onCreateNode,
      openAssetFilePicker,
      openRecorder,
      setLinkPrompt,
    ]
  );

  const createFromBottomMenu = useCallback(
    async (kind: CreatableCanvasNodeKind, options?: CreateNodeOptions) => {
      if (isWidgetCreateKind(kind)) {
        const widget = await createWidgetRecord(kind);
        if (!widget) {
          toast.error(m.toast_widget_create_failed());
          return;
        }
        await onCreateNode(kind, {
          ...options,
          data: {
            ...(options?.data ?? {}),
            widgetId: widget.id,
            kind: widget.kind,
          },
        });
        return;
      }
      if (options) {
        await onCreateNode(kind, options);
        return;
      }
      await onCreateNode(kind);
    },
    [createWidgetRecord, onCreateNode]
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
  const sessionViewport = useCanvasStore((s) => s.sessionViewport);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const activeViewId = useCanvasStore((s) => s.activeViewId);
  const hydrateWidgets = useWidgetStore((s) => s.hydrate);
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

  const onOpenNoteLibrary = useCallback(() => {
    setDetachedSidebarOpen(true);
  }, [setDetachedSidebarOpen]);

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
    [deleteNodesWithToast, setPendingFolderDeleteIds]
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
  useCanvasViewportResize({
    containerRef: canvasContainerRef,
    enabled: hydrated,
    rfInstance,
  });

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
        suppressViewportPersist(300);
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
          suppressViewportPersist(300);
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
          // Viewport is session-only; loadCanvas no longer carries camera state.
          hydrate(data.nodes, data.edges);
          // Always hydrate (even when widgets is absent/empty) so switching to
          // a canvas with zero widgets still prunes records from the previous
          // view. Pass the referenced id set so unreferenced entries are dropped.
          const referencedWidgetIds = new Set(
            collectWidgetIdsFromNodes(data.nodes as unknown as Node[])
          );
          hydrateWidgets(data.widgets ?? {}, referencedWidgetIds);
        } else if (await isRpcAvailable()) {
          if (cancelled) {
            return;
          }
          // First run: seed workspace with initialNodes + initialEdges.
          // fitView frames the seed nodes; the user's first pan/zoom fills the
          // session camera cache for this view.
          const seededNodes = await materializeInitialWidgetSeeds(
            initialNodes,
            createWidgetRecord,
            updateWidgetRecord,
            saveWidgetNow
          );
          const sanitized = sanitizeForPersistence(seededNodes, initialEdges);
          await rpcSaveManifest(activeViewId, sanitized.nodes, sanitized.edges);
          if (!cancelled) {
            hydrate(seededNodes, initialEdges);
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
  }, [
    hydrate,
    hydrateWidgets,
    hydrated,
    activeViewId,
    createWidgetRecord,
    updateWidgetRecord,
    saveWidgetNow,
  ]);

  useCanvasKeyboard({ onDeleteNodes: requestDeleteNodes, rfInstance });

  const handleCanvasPaste = useEffectEvent((event: ClipboardEvent) => {
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
      createLinkFromText(text, { anchorCenter: currentPasteAnchor() }).catch(
        (error) => {
          console.error('[canvas] Failed to create pasted link:', error);
        }
      );
    }
  });

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      handleCanvasPaste(event);
    };
    globalThis.addEventListener('paste', handlePaste);
    return () => {
      globalThis.removeEventListener('paste', handlePaste);
    };
  }, []);

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

  // Single-click-to-open model: a plain (no-modifier) click on a node opens
  // its focused view directly. Selection is reserved for marquee drag and
  // modifier-clicks, so a plain click must NOT leave the node selected. We
  // detect a plain node press on pointerdown and suppress the pure-selection
  // changes React Flow would otherwise emit for it (see handleNodesChange).
  // Marquee starts on the pane (not a node) and modifier-clicks are allowed
  // through, so both keep working.
  const suppressClickSelectRef = useRef(false);
  const onCanvasPointerDownCapture = useCallback((e: React.PointerEvent) => {
    const hasModifier = e.shiftKey || e.metaKey || e.ctrlKey || e.altKey;
    const onNode = Boolean(
      (e.target as Element | null)?.closest?.('.react-flow__node')
    );
    suppressClickSelectRef.current = onNode && !hasModifier;
  }, []);

  const onNodeClick = useCallback(
    (e: React.MouseEvent, node: Node) => {
      // Modifier-clicks toggle selection (handled by React Flow); only a plain
      // click opens. Folders open their focused view too. Skip nodes that have
      // no focused view and the one that is already open.
      const state = useCanvasStore.getState();
      const isOpenable = node.type === 'folder' || isFocusableNode(node.type);
      const alreadyOpen =
        state.focusedNode?.id === node.id ||
        state.focusedFolder?.id === node.id;
      if (
        e.shiftKey ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        !isOpenable ||
        alreadyOpen
      ) {
        return;
      }
      openNodeFocusedView(node);
    },
    [openNodeFocusedView]
  );

  // Double-click stays as a redundant open path in case a first click is
  // swallowed (e.g. by a drag threshold); for already-open nodes the plain
  // click handled it, so skip to avoid restarting the focus animation.
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

  // Drop the pure-selection changes a plain node click produces so clicking a
  // node opens it without selecting it. Batches that also carry position/
  // dimension changes (drags, resizes) and marquee/modifier selections pass
  // through untouched. A dropped batch clears the flag; mixed batches (e.g.
  // drags) leave it set, but that is harmless — the next pointerdown resets it
  // before any selection change can be misattributed.
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (
        suppressClickSelectRef.current &&
        changes.length > 0 &&
        changes.every((change) => change.type === 'select')
      ) {
        suppressClickSelectRef.current = false;
        return;
      }
      onNodesChange(changes);
    },
    [onNodesChange]
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
  const decoratedNodesCacheRef = useRef<Map<
    string,
    {
      dragZIndex: number | undefined;
      folderPeekClass: string;
      isDropTarget: boolean;
      isHidden: boolean;
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
  const nodesWithState = useMemo(() => {
    const cache = decoratedNodesCache;
    const nextCache = new Map<
      string,
      {
        dragZIndex: number | undefined;
        folderPeekClass: string;
        isDropTarget: boolean;
        isHidden: boolean;
        result: Node;
        source: Node;
      }
    >();
    const result: Node[] = [];
    for (const node of nodes) {
      if ((node.data as Record<string, unknown>).detached) {
        continue;
      }
      const isHidden = focusedNode?.id === node.id;
      const folderPeekClass = focusedFolder
        ? focusedFolder.id === node.id
          ? 'folder-peek-anchor'
          : 'folder-peek-muted'
        : '';
      const isDropTarget = dropTargetId === node.id;
      const dragZIndex = draggingOverContainerIds?.has(node.id)
        ? dragLayerZIndex
        : undefined;
      const cached = cache.get(node.id);
      if (
        cached &&
        cached.source === node &&
        cached.isHidden === isHidden &&
        cached.folderPeekClass === folderPeekClass &&
        cached.isDropTarget === isDropTarget &&
        cached.dragZIndex === dragZIndex
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
      ]
        .filter(Boolean)
        .join(' ');
      const decorated: Node = {
        ...node,
        data: { ...node.data, isHidden, isDropTarget },
        ...(dragZIndex === undefined ? {} : { zIndex: dragZIndex }),
        ...(className ? { className } : {}),
        ...(locked
          ? {
              draggable: false,
              connectable: false,
              deletable: false,
            }
          : {}),
      };
      nextCache.set(node.id, {
        dragZIndex,
        folderPeekClass,
        isDropTarget,
        isHidden,
        result: decorated,
        source: node,
      });
      result.push(decorated);
    }
    decoratedNodesCacheRef.current = nextCache;
    return result;
  }, [
    nodes,
    focusedNode,
    focusedFolder,
    dropTargetId,
    decoratedNodesCache,
    draggingOverContainerIds,
    dragLayerZIndex,
  ]);

  const dragDepthRef = useRef(0);
  // Cursor position (screen coords) for the drop ghost; rAF-throttled because
  // `dragover` fires very frequently.
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
    setCanvasUi({ isDraggingFile: true });
  }, []);

  const onDragLeaveWindow = useCallback(() => {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDragState({ dragPos: null, isDraggingFile: false });
    }
  }, [setDragState]);

  const onDropCanvas = useCallback(
    (e: React.DragEvent | DragEvent) => {
      // Reset overlay state on drop regardless of payload.
      dragDepthRef.current = 0;
      setDragState({ dragPos: null, isDraggingFile: false });
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
        createLinkFromText(text, { anchorCenter: position }).catch((error) => {
          console.error('[canvas] Failed to create dropped link:', error);
        });
      }
    },
    [
      createAssetsFromFiles,
      createLinkFromText,
      pinNoteToCanvas,
      screenToFlowPosition,
      setDragState,
    ]
  );

  const onDragOverCanvas = useCallback((e: React.DragEvent | DragEvent) => {
    e.preventDefault();
    const { clientX, clientY } = e as React.DragEvent;
    if (dragRafRef.current == null) {
      dragRafRef.current = requestAnimationFrame(() => {
        dragRafRef.current = null;
        setCanvasUi({ dragPos: { x: clientX, y: clientY } });
      });
    }
    const dataTransfer = (e as React.DragEvent).dataTransfer;
    if (dataTransfer) {
      const hasFilePayload = isOsFileDrag(dataTransfer);
      if (hasFilePayload) {
        setCanvasUi({ isDraggingFile: true });
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
        widgets: useWidgetStore.getState().records,
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
      className={cn(
        'relative h-screen w-screen overflow-hidden bg-[#EFF3F4] font-sans dark:bg-[#141414]',
        repelAnimationActive && 'canvas-repel-anim'
      )}
      onDragEnter={onDragEnterWindow}
      onDragLeave={onDragLeaveWindow}
      onMouseMove={onPointerMoveCanvas}
      onPointerDownCapture={onCanvasPointerDownCapture}
    >
      <ZoomLevelProvider>
        <div
          aria-hidden={focusedFolder ? true : undefined}
          aria-label={activeViewName}
          className={cn('h-full w-full', focusedFolder && 'folder-peek-active')}
          inert={focusedFolder ? true : undefined}
          ref={canvasContainerRef}
          role="application"
        >
          <ReactFlow
            connectionLineComponent={ConnectionPreviewLine}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={30}
            defaultEdgeOptions={{ type: 'labeledEdge', zIndex: 1 }}
            defaultViewport={sessionViewport ?? undefined}
            disableKeyboardA11y
            edges={edges}
            edgeTypes={edgeTypes}
            elevateEdgesOnSelect
            fitView={!sessionViewport}
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
            onMoveEnd={(event, viewport) => {
              setViewport(viewport, { persist: event != null });
            }}
            onNodeClick={onNodeClick}
            onNodeContextMenu={onNodeContextMenu}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeDrag={onNodeDrag}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onNodesChange={handleNodesChange}
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
            <Controls
              className="canvas-floating-surface"
              position="bottom-left"
            />
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
        </div>
      </ZoomLevelProvider>

      {nodesWithState.length === 0 ? (
        <EmptyCanvasOverlay
          onCreateNote={async () => {
            await onCreateNode('card');
          }}
          onOpenNoteLibrary={onOpenNoteLibrary}
        />
      ) : null}

      {recorderNumber !== null ? (
        <RecordingRecorder
          onCancel={closeRecorder}
          onComplete={handleRecordingComplete}
          recordingNumber={recorderNumber}
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

      <CanvasToolbar />
      <LibraryPopup rfInstance={rfInstance} />

      <TagSidebar />

      <ViewSwitcher
        createMenuOpen={createMenuOpen}
        onCreateNode={createFromBottomMenu}
        onExportCanvas={onExportCanvas}
        onExportCanvasJson={onExportCanvasJson}
        onOpenImagePicker={openImagePicker}
        onOpenNoteLibrary={onOpenNoteLibrary}
        onOpenRecorder={openRecorder}
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
        aria-label="Import asset file"
        className="hidden"
        onChange={onAssetFileInputChange}
        ref={assetFileInputRef}
        type="file"
      />
      <input
        aria-label="Replace asset file"
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
            className="pointer-events-none fixed inset-0 z-[200] bg-accent/10 backdrop-blur-[2px]"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          >
            {dragPos ? (
              <div
                className="absolute flex items-center gap-2 rounded-xl border-2 border-accent border-dashed bg-white/90 px-4 py-2.5 font-medium text-accent-strong text-sm shadow-xl dark:bg-neutral-900/90"
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
                <div className="rounded-2xl border-2 border-accent border-dashed bg-white/90 px-8 py-6 font-medium text-accent-strong text-lg shadow-xl dark:bg-neutral-900/90">
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
