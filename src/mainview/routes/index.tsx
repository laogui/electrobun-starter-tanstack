import { createFileRoute } from '@tanstack/react-router';
import type {
  Connection,
  Node,
  OnMoveEnd,
  ReactFlowInstance,
} from '@xyflow/react';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { useTheme } from 'better-themes';
import { AnimatePresence } from 'motion/react';
import * as motion from 'motion/react-m';

import {
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useReducer,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { CanvasFlowLayer } from '@/components/canvas/CanvasFlowLayer';
import { CanvasLoadErrorScreen } from '@/components/canvas/CanvasLoadErrorScreen';
import { CanvasPanels } from '@/components/canvas/CanvasPanels';
import { CanvasContextMenu } from '@/components/canvas/ContextMenu';
import { DeleteFolderConfirmDialog } from '@/components/canvas/DeleteFolderConfirmDialog';
import { EmptyCanvasOverlay } from '@/components/canvas/EmptyCanvasOverlay';
import { FocusedViewHost } from '@/components/canvas/FocusedViewHost';
import { runFocusTransition } from '@/components/canvas/focusTransition/runFocusTransition';
import { LinkCreatePopover } from '@/components/canvas/LinkCreatePopover';
import { RecordingRecorder } from '@/components/canvas/RecordingRecorder';
import { ViewSwitcher } from '@/components/canvas/ViewSwitcher';
import { Loader } from '@/components/layout/Loader';
import { resolveExtensionMessage } from '@/extensions/messages';
import { registerBuiltinCanvasTypes } from '@/extensions/registerBuiltins';
import {
  canvasTypeRegistry,
  useCanvasTypeRegistryRevision,
} from '@/extensions/registry';
import type { RecordingResult } from '@/hooks/useAudioRecorder';
import { useCanvasDragDrop } from '@/hooks/useCanvasDragDrop';
import { useCanvasExport } from '@/hooks/useCanvasExport';
import { useCanvasInit } from '@/hooks/useCanvasInit';
import { useCanvasKeyboard } from '@/hooks/useCanvasKeyboard';
import { useCanvasPersistence } from '@/hooks/useCanvasPersistence';
import { useCanvasSearchNavigation } from '@/hooks/useCanvasSearchNavigation';
import { useCanvasViewportResize } from '@/hooks/useCanvasViewportResize';
import { useContextMenu } from '@/hooks/useContextMenu';
import { useNodeCreation } from '@/hooks/useNodeCreation';
import {
  useEditableInteractionLock,
  useSpacePanMode,
} from '@/hooks/useSpacePanMode';
import { saveAssetFileWithProgressToast } from '@/lib/assetImportProgress';
import { prefetchBlockNoteForData } from '@/lib/blockNotePrefetch';
import { resolveCanvasBackground } from '@/lib/canvasBackground';
import { isFocusableNode, isLockedNode } from '@/lib/canvasNodePredicates';
import {
  type CreatableCanvasNodeKind,
  extractLinkUrl,
} from '@/lib/contentTypes';
import type { CanvasCreateRequest } from '@/lib/creatableNodes';
import { isFolderExpandedChildNode } from '@/lib/folderExpansion';
import { applyIfNodeUnchanged, captureNodeData } from '@/lib/nodeWriteGuard';
import { saveRecording } from '@/lib/recordingFiles';
import {
  type ConnectionStartState,
  shouldReverseEdgeDirection,
} from '@/lib/shouldReverseEdgeDirection';
import { cn } from '@/lib/utils';
import type { WidgetKind } from '@/lib/widgetTypes';
import { useAppSettingsStore } from '@/store/appSettingsStore';
import { type CreateNodeOptions, useCanvasStore } from '@/store/canvasStore';
import { useExtensionEnablementStore } from '@/store/extensionEnablementStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import { useWidgetStore } from '@/store/widgetStore';
import * as m from '../../paraglide/messages.js';
import {
  LINK_CANVAS_TYPE_ID,
  RECORDING_CANVAS_TYPE_ID,
} from '../../shared/extensions/builtinIds';
import { isExtensionInstanceLoadError } from '../../shared/extensions/instance';
import { normalizeRecordingState } from '../../shared/extensions/media/state';
import { normalizeLinkState } from '../../shared/extensions/web/link';

registerBuiltinCanvasTypes();

const FOLDER_EXPANSION_DURATION_MS = 520;
const FOLDER_COLLAPSE_DURATION_MS = 420;

function getFolderTransitionDuration(closing = false): number {
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return 20;
  }
  return closing ? FOLDER_COLLAPSE_DURATION_MS : FOLDER_EXPANSION_DURATION_MS;
}

// ─────────────────────────────────────────────────────────────────────────────

const WIDGET_CREATE_KINDS = new Set<CreatableCanvasNodeKind>([
  'checklist',
  'pomodoro',
  'reminder',
]);

function isWidgetCreateKind(kind: CreatableCanvasNodeKind): kind is WidgetKind {
  return WIDGET_CREATE_KINDS.has(kind);
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

  if (entry.type === 'extension') {
    const data = entry.data as
      | { canvasTypeId?: unknown; instanceId?: unknown }
      | undefined;
    if (
      data?.canvasTypeId === RECORDING_CANVAS_TYPE_ID &&
      typeof data.instanceId === 'string'
    ) {
      const record =
        useExtensionInstanceStore.getState().records[data.instanceId];
      if (record && !isExtensionInstanceLoadError(record)) {
        max = Math.max(max, readRecordingNumber(record.state));
      }
    }
  }

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

const MemoViewSwitcher = memo(ViewSwitcher);

/** Render-null host so search navigation's `nodes` subscription stays out of
 *  the canvas shell. */
function CanvasSearchNavigation(
  props: Parameters<typeof useCanvasSearchNavigation>[0]
) {
  useCanvasSearchNavigation(props);
  return null;
}

/** Empty-state overlay with a boolean selector, so the shell does not have to
 *  subscribe to the node list just to know whether it is empty. */
const CanvasEmptyState = memo(function CanvasEmptyState({
  onCreateNode,
  onOpenNoteLibrary,
}: {
  onCreateNode: (kind: CreatableCanvasNodeKind) => Promise<unknown>;
  onOpenNoteLibrary: () => void;
}) {
  const isEmpty = useCanvasStore(
    (s) =>
      !(
        (s.topicDraft && s.topicDraft.viewId === s.activeViewId) ||
        s.nodes.some(
          (node) => !(node.data as { detached?: unknown } | undefined)?.detached
        )
      )
  );
  if (!isEmpty) {
    return null;
  }
  return (
    <EmptyCanvasOverlay
      onCreateNote={async () => {
        await onCreateNode('card');
      }}
      onOpenNoteLibrary={onOpenNoteLibrary}
    />
  );
});

// The canvas route wires React Flow, drag/drop, keyboard shortcuts, and modals.
// react-doctor-disable-next-line react-doctor/no-giant-component
function CanvasComponent() {
  useCanvasTypeRegistryRevision();
  const connectionStartRef = useRef<ConnectionStartState>({
    handleId: null,
    nodeId: null,
  });
  // Last known pointer position (screen coords). Used to anchor pasted content
  // near the cursor, since paste events carry no coordinates of their own.
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const { theme, systemTheme } = useTheme();
  // `focusedNode` is deliberately NOT subscribed here: FocusedViewHost owns
  // it so opening a note does not re-render the route shell.
  const focusedFolder = useCanvasStore((s) => s.focusedFolder);
  const focusedFolderId = focusedFolder?.id;
  const createMenuOpen = useCanvasStore((s) => s.createMenuOpen);
  const setCreateMenuOpen = useCanvasStore((s) => s.setCreateMenuOpen);
  const setFocusedNode = useCanvasStore((s) => s.setFocusedNode);
  const setFocusedFolder = useCanvasStore((s) => s.setFocusedFolder);
  const applyEdgesChange = useCanvasStore((s) => s.applyEdgesChange);
  const addConnection = useCanvasStore((s) => s.addConnection);
  const deleteNodes = useCanvasStore((s) => s.deleteNodes);
  const beginTopicDraft = useCanvasStore((s) => s.beginTopicDraft);
  const undo = useCanvasStore((s) => s.undo);
  const rfInstance = useRef<ReactFlowInstance<any, any> | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const folderCloseTimerRef = useRef<number | null>(null);
  const folderUnlockTimerRef = useRef<number | null>(null);
  const [folderTransitionLocked, setFolderTransitionLocked] = useState(false);
  const [closingFolderId, setClosingFolderId] = useState<string | null>(null);
  const { screenToFlowPosition } = useReactFlow();
  const spacePanActive = useSpacePanMode();
  const editableInteractionLocked = useEditableInteractionLock();

  useEffect(() => {
    if (folderUnlockTimerRef.current !== null) {
      window.clearTimeout(folderUnlockTimerRef.current);
      folderUnlockTimerRef.current = null;
    }

    if (!focusedFolderId) {
      setFolderTransitionLocked(false);
      setClosingFolderId(null);
      return;
    }

    setFolderTransitionLocked(true);
    setClosingFolderId(null);
    folderUnlockTimerRef.current = window.setTimeout(() => {
      setFolderTransitionLocked(false);
      folderUnlockTimerRef.current = null;
    }, getFolderTransitionDuration());

    return () => {
      if (folderUnlockTimerRef.current !== null) {
        window.clearTimeout(folderUnlockTimerRef.current);
        folderUnlockTimerRef.current = null;
      }
    };
  }, [focusedFolderId]);

  useEffect(
    () => () => {
      if (folderCloseTimerRef.current !== null) {
        window.clearTimeout(folderCloseTimerRef.current);
      }
    },
    []
  );

  const finishFolderClose = useCallback(
    (folderId: string) => {
      if (useCanvasStore.getState().focusedFolder?.id !== folderId) {
        return;
      }
      if (folderCloseTimerRef.current !== null) {
        window.clearTimeout(folderCloseTimerRef.current);
        folderCloseTimerRef.current = null;
      }
      setFocusedFolder(null);
      setClosingFolderId(null);
      setFolderTransitionLocked(false);
    },
    [setFocusedFolder]
  );

  const closeFolderWithTransition = useCallback(() => {
    if (
      !focusedFolder ||
      folderTransitionLocked ||
      closingFolderId === focusedFolder.id
    ) {
      return;
    }
    const folderId = focusedFolder.id;
    setClosingFolderId(focusedFolder.id);
    setFolderTransitionLocked(true);
    // Motion completion owns the normal close path. This longer timer is only
    // a safety net for interrupted animations or an empty expansion.
    folderCloseTimerRef.current = window.setTimeout(() => {
      finishFolderClose(folderId);
    }, getFolderTransitionDuration(true) + 120);
  }, [
    closingFolderId,
    finishFolderClose,
    focusedFolder,
    folderTransitionLocked,
  ]);

  const { onCreateNode } = useNodeCreation({ rfInstance });
  const createExtensionNode = useCanvasStore((s) => s.createExtensionNode);
  const createWidgetRecord = useWidgetStore((s) => s.createWidget);
  const createExtensionInstance = useExtensionInstanceStore(
    (s) => s.createInstance
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
  const setPendingFolderDeleteIds = useCallback(
    (pendingFolderDeleteIds: string[] | null) => {
      setCanvasUi({ pendingFolderDeleteIds });
    },
    []
  );
  const onPointerMoveCanvas = useCallback((e: React.MouseEvent) => {
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const {
    createAssetsFromFiles,
    createLinkFromText,
    onDragEnterWindow,
    onDragLeaveWindow,
    onDragOverCanvas,
    onDropCanvas,
  } = useCanvasDragDrop({ rfInstance, setDragUi: setCanvasUi });
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
      // Pin the write-back to the file fields as they were when the picker
      // returned: a delete/undo/replace during the save drops the result.
      const expectation = captureNodeData(
        useCanvasStore.getState().nodes,
        target.nodeId,
        target.kind === 'image'
          ? ['imageFile', 'imageUrl', 'thumbnailFile']
          : ['attachmentFile']
      );
      if (!expectation) {
        return;
      }
      try {
        const saved = await saveAssetFileWithProgressToast(file);
        if (target.kind === 'image') {
          applyIfNodeUnchanged(useCanvasStore, expectation, {
            imageFile: saved.attachmentFile,
            imageUrl: undefined,
            thumbnailFile: saved.thumbnailFile,
            thumbnailUrl: saved.thumbnailUrl,
          });
        } else {
          applyIfNodeUnchanged(useCanvasStore, expectation, { ...saved });
        }
      } catch (error) {
        console.error('[canvas] replace file failed:', error);
        toast.error(m.toast_replace_failed());
      }
    },
    []
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
      const anchorCenter = lastRecordingAnchorRef.current;
      try {
        const data = await saveRecording({
          blob: result.blob,
          durationMs: result.durationMs,
          mimeType: result.mimeType,
          recordingNumber: number,
          ...(result.waveform ? { waveform: result.waveform } : {}),
        });
        const def = canvasTypeRegistry.get(RECORDING_CANVAS_TYPE_ID);
        const state = normalizeRecordingState(data);
        if (!def) {
          return;
        }
        const record = await createExtensionInstance({
          canvasTypeId: RECORDING_CANVAS_TYPE_ID,
          dataVersion: def.dataVersion,
          presentation: def.buildPresentation(state),
          state,
        });
        if (!record) {
          return;
        }
        await createExtensionNode(
          RECORDING_CANVAS_TYPE_ID,
          record.id,
          rfInstance.current,
          {
            size: def.surface.defaultSize,
            ...(anchorCenter ? { anchorCenter } : {}),
          }
        );
        // Close only after both save and node creation succeed so a failure
        // can still surface on the overlay (and never leaves a hung spinner).
        lastRecordingAnchorRef.current = undefined;
        lastRecordingKindRef.current = undefined;
        setRecorderNumber(null);
      } catch (error) {
        console.error('[index] Failed to save recording:', error);
        toast.error(m.toast_recording_save_failed());
        // Re-throw so RecordingRecorder can keep the overlay open and offer
        // retry instead of leaving the user with a silent no-op.
        throw error;
      }
    },
    [
      createExtensionInstance,
      createExtensionNode,
      recorderNumber,
      setRecorderNumber,
    ]
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

  // Unified create entry point shared with the canvas right-click menu. Plain
  // kinds are created immediately; `link` opens the URL popover, `asset` and
  // `image` open the file picker (image restricted to image files), and
  // `recording` opens the microphone dialog — mirroring the bottom create
  // menu's special flows.
  const requestCreate = useCallback(
    async (kind: CreatableCanvasNodeKind, request?: CanvasCreateRequest) => {
      if (kind === 'topic') {
        // A Topic starts as an editable draft, not a node: an abandoned one
        // leaves no empty node and no undo entry behind.
        beginTopicDraft(rfInstance.current, {
          ...(request?.anchorCenter
            ? { anchorCenter: request.anchorCenter }
            : {}),
        });
        return;
      }
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
      beginTopicDraft,
      createWidgetRecord,
      onCreateNode,
      openAssetFilePicker,
      openRecorder,
      setLinkPrompt,
    ]
  );

  const createFromBottomMenu = useCallback(
    async (kind: CreatableCanvasNodeKind, options?: CreateNodeOptions) => {
      if (kind === 'topic') {
        beginTopicDraft(rfInstance.current, {
          ...(options?.anchor ? { anchor: options.anchor } : {}),
          ...(options?.anchorCenter
            ? { anchorCenter: options.anchorCenter }
            : {}),
        });
        return;
      }
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
    [beginTopicDraft, createWidgetRecord, onCreateNode]
  );

  const createCanvasTypeWithState = useCallback(
    async (
      canvasTypeId: string,
      state: unknown,
      request?: CanvasCreateRequest & {
        size?: { height: number; width: number };
      }
    ) => {
      const def = canvasTypeRegistry.get(canvasTypeId);
      if (!def) {
        toast.error(resolveExtensionMessage('toast_extension_unknown_type'));
        return;
      }
      if (!useExtensionEnablementStore.getState().isEnabled(canvasTypeId)) {
        toast.error(resolveExtensionMessage('toast_extension_type_disabled'));
        return;
      }
      const presentation = def.buildPresentation(
        def.validateState(state) ? state : def.createInitialState()
      );
      const record = await createExtensionInstance({
        canvasTypeId,
        dataVersion: def.dataVersion,
        presentation,
        state,
      });
      if (!record) {
        toast.error(resolveExtensionMessage('toast_extension_create_failed'));
        return;
      }
      await createExtensionNode(canvasTypeId, record.id, rfInstance.current, {
        size: request?.size ?? def.surface.defaultSize,
        ...(request?.anchorCenter
          ? { anchorCenter: request.anchorCenter }
          : {}),
      });
    },
    [createExtensionInstance, createExtensionNode]
  );

  const requestCreateCanvasType = useCallback(
    async (canvasTypeId: string, request?: CanvasCreateRequest) => {
      const def = canvasTypeRegistry.get(canvasTypeId);
      if (!def) {
        toast.error(resolveExtensionMessage('toast_extension_unknown_type'));
        return;
      }
      const flow = def.createFlow ?? 'immediate';
      if (flow === 'url') {
        setLinkPrompt({
          anchorCenter: request?.anchorCenter,
          screen: request?.screen,
        });
        return;
      }
      if (flow === 'image') {
        openAssetFilePicker('image/*', request?.anchorCenter);
        return;
      }
      if (flow === 'file') {
        openAssetFilePicker('', request?.anchorCenter);
        return;
      }
      if (flow === 'recording') {
        openRecorder(request?.anchorCenter);
        return;
      }
      await createCanvasTypeWithState(
        canvasTypeId,
        def.createInitialState(),
        request
      );
    },
    [
      createCanvasTypeWithState,
      openAssetFilePicker,
      openRecorder,
      setLinkPrompt,
    ]
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

  const hydrated = useCanvasStore((s) => s._hydrated);
  const canvasLoadError = useCanvasStore((s) => s.canvasLoadError);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const activeViewId = useCanvasStore((s) => s.activeViewId);
  const views = useCanvasStore((s) => s.views);

  // One library: the "Library note" entries open the same Library popup as
  // the toolbar, where detached notes are placed back with one click.
  const setLibraryOpen = useCanvasStore((s) => s.setLibraryOpen);
  const onOpenNoteLibrary = useCallback(() => {
    setLibraryOpen(true);
  }, [setLibraryOpen]);

  const deleteNodesWithToast = useCallback(
    (ids: string[]) => {
      const deleted = deleteNodes(ids);
      if (deleted === 0) {
        return;
      }
      toast(
        deleted > 1
          ? m.toast_nodes_deleted({ count: deleted })
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
        .nodes.some(
          (node) =>
            idSet.has(node.id) && node.type === 'folder' && !isLockedNode(node)
        );

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
    onFolderChildContextMenu,
    onEdgeContextMenu,
    handleContextMenuAction,
  } = useContextMenu({
    onDeleteNodes: requestDeleteNodes,
    onReplaceNodeFile,
    onRequestCreate: requestCreate,
    onRequestCreateCanvasType: requestCreateCanvasType,
    rfInstance,
  });

  useCanvasPersistence();
  useCanvasViewportResize({
    containerRef: canvasContainerRef,
    enabled: hydrated,
    rfInstance,
  });

  useCanvasInit();

  useCanvasKeyboard({
    onCloseFolder: closeFolderWithTransition,
    onDeleteNodes: requestDeleteNodes,
    rfInstance,
  });

  const handleCanvasPaste = useEffectEvent((event: ClipboardEvent) => {
    if (
      !useCanvasStore.getState()._hydrated ||
      useCanvasStore.getState().focusedNode ||
      focusedFolder ||
      isEditablePasteTarget(event.target)
    ) {
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
      if (isFolderExpandedChildNode(node)) {
        const { child, folderId } = node.data;
        // Expanded children only open when the underlying kind is focusable
        // (e.g. cards/images). Widgets edit in place and must not open a note.
        if (!isFocusableNode(child.type, child.data)) {
          return;
        }
        prefetchBlockNoteForData(child.data);
        runFocusTransition(
          () => {
            setFocusedNode({
              id: child.id,
              folderId,
              type: child.type,
              data: child.data,
              rect,
            });
          },
          { direction: 'open', source: el }
        );
      } else if (node.type === 'folder') {
        setFocusedFolder({ id: node.id, data: node.data, rect });
      } else if (
        isFocusableNode(node.type, node.data as Record<string, unknown>)
      ) {
        prefetchBlockNoteForData(node.data as Record<string, unknown>);
        runFocusTransition(
          () => {
            setFocusedNode({
              id: node.id,
              type: node.type,
              data: node.data,
              rect,
            });
          },
          { direction: 'open', source: el }
        );
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
      if (state.focusedFolder?.id === node.id && node.type === 'folder') {
        closeFolderWithTransition();
        return;
      }
      const isOpenable =
        node.type === 'folder' ||
        (isFolderExpandedChildNode(node)
          ? isFocusableNode(node.data.child.type, node.data.child.data)
          : isFocusableNode(node.type, node.data as Record<string, unknown>));
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
    [closeFolderWithTransition, openNodeFocusedView]
  );

  // Double-click stays as a redundant open path in case a first click is
  // swallowed (e.g. by a drag threshold); for already-open nodes the plain
  // click handled it, so skip to avoid restarting the focus animation.
  const onNodeDoubleClick = useCallback(
    (_: any, node: Node) => {
      const state = useCanvasStore.getState();
      if (state.focusedFolder?.id === node.id && node.type === 'folder') {
        closeFolderWithTransition();
        return;
      }
      if (
        state.focusedNode?.id === node.id ||
        state.focusedFolder?.id === node.id
      ) {
        return;
      }
      openNodeFocusedView(node);
    },
    [closeFolderWithTransition, openNodeFocusedView]
  );

  // React Flow pushes every changed tracked prop into its store, so this must
  // stay referentially stable across drag-frame re-renders.
  const onMoveEnd = useCallback<OnMoveEnd>(
    (event, viewport) => {
      setViewport(viewport, { persist: event != null });
    },
    [setViewport]
  );

  const isDarkTheme =
    theme === 'dark' || (theme === 'system' && systemTheme === 'dark');
  const canvasBackgroundPreset = useAppSettingsStore((s) => s.canvasBackground);
  const canvasBackground = resolveCanvasBackground(
    canvasBackgroundPreset,
    isDarkTheme
  );
  const activeViewName =
    views.find((view) => view.id === activeViewId)?.name ?? 'Canvas';

  const { onExportCanvas, onExportCanvasJson, onExportMarkdown } =
    useCanvasExport({
      activeViewId,
      activeViewName,
      canvasBackground,
      rfInstance,
    });

  if (!hydrated && canvasLoadError) {
    return <CanvasLoadErrorScreen error={canvasLoadError} />;
  }

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
      <div
        aria-label={activeViewName}
        className={cn(
          'h-full w-full',
          focusedFolder && 'folder-expansion-active',
          focusedFolder?.id === closingFolderId && 'folder-expansion-closing'
        )}
        ref={canvasContainerRef}
        role="application"
        tabIndex={-1}
      >
        <CanvasFlowLayer
          canvasBackground={canvasBackground}
          closeFolderWithTransition={closeFolderWithTransition}
          closingFolderId={closingFolderId}
          editableInteractionLocked={editableInteractionLocked}
          finishFolderClose={finishFolderClose}
          isDarkTheme={isDarkTheme}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onConnectStart={onConnectStart}
          onDragOver={onDragOverCanvas}
          onDrop={onDropCanvas}
          onEdgeContextMenu={onEdgeContextMenu}
          onEdgesChange={onEdgesChange}
          onFolderChildContextMenu={onFolderChildContextMenu}
          onMoveEnd={onMoveEnd}
          onNodeClick={onNodeClick}
          onNodeContextMenu={onNodeContextMenu}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneContextMenu={onPaneContextMenu}
          rfInstance={rfInstance}
          spacePanActive={spacePanActive}
          suppressClickSelectRef={suppressClickSelectRef}
        />
      </div>

      <CanvasEmptyState
        onCreateNode={onCreateNode}
        onOpenNoteLibrary={onOpenNoteLibrary}
      />

      {recorderNumber !== null ? (
        <RecordingRecorder
          onCancel={closeRecorder}
          onComplete={handleRecordingComplete}
          recordingNumber={recorderNumber}
        />
      ) : null}

      <FocusedViewHost canvasContainerRef={canvasContainerRef} />

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

      <CanvasSearchNavigation
        closingFolderId={closingFolderId}
        hydrated={hydrated}
        rfInstance={rfInstance}
      />

      <CanvasPanels rfInstance={rfInstance} />

      <MemoViewSwitcher
        createMenuOpen={createMenuOpen}
        onCreateCanvasType={requestCreateCanvasType}
        onCreateNode={createFromBottomMenu}
        onExportCanvas={onExportCanvas}
        onExportCanvasJson={onExportCanvasJson}
        onExportMarkdown={onExportMarkdown}
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

      <input
        aria-label={m.a11y_import_asset_file()}
        className="hidden"
        onChange={onAssetFileInputChange}
        ref={assetFileInputRef}
        type="file"
      />
      <input
        aria-label={m.a11y_replace_asset_file()}
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
            await createCanvasTypeWithState(
              LINK_CANVAS_TYPE_ID,
              normalizeLinkState(data),
              linkPrompt.anchorCenter
                ? { anchorCenter: linkPrompt.anchorCenter }
                : undefined
            );
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
