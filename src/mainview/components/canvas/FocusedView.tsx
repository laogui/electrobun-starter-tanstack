import { useReactFlow } from '@xyflow/react';
import { ArrowLeft } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import * as motion from 'motion/react-m';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { NoteEditorLoading } from '@/components/editor/NoteEditorLoading';
import { SaveIndicator } from '@/components/editor/SaveIndicator';
import type { BlockNoteSaveStatus } from '@/components/editor/useBlockNoteSaver';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { isFocusableNode } from '@/lib/canvasNodePredicates';
import { findSpecByNodeType } from '@/lib/canvasNodeRegistry';
import { getLinkHost } from '@/lib/contentTypes';
import { FLAGS } from '@/lib/flags';
import { cn } from '@/lib/utils';
import { suppressViewportPersist } from '@/lib/viewportPersist';
import type {
  ChecklistWidgetData,
  ChecklistWidgetItem,
} from '@/lib/widgetTypes';
import { isWidgetLoadError } from '@/lib/widgetTypes';
import { type FocusedItem, useCanvasStore } from '@/store/canvasStore';
import { useWidgetStore } from '@/store/widgetStore';

import * as m from '../../../paraglide/messages.js';
import { ChecklistFocusedView } from './ChecklistFocusedView';
import { ImageZoomPan } from './ImageZoomPan';
import { AssetContent } from './nodes/AssetNode';
import type { CardContentData, ChecklistItem } from './nodes/CardNode';
import { CardContent } from './nodes/CardNode';
import type { ImageData } from './nodes/ImageNode';
import { ImageContent } from './nodes/ImageNode';
import { LinkContent } from './nodes/LinkNode';

// Word/character counts derived from markdown body. Stripping fenced code,
const BlockNoteEditor = lazy(
  () => import('@/components/editor/BlockNoteEditor')
);

/** Matches folder-fan easing so open/close feels like one system. */
const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;
const CLOSE_DURATION_S = 0.26;
/**
 * Floor for the expand morph's starting scale. A tiny floor makes the panel
 * grow from a blurry, reflowed thumbnail; a gentle floor keeps the content
 * crisp so the open reads as a smooth settle rather than a zoom pop.
 */
const OPEN_MIN_SCALE = 0.86;

function getViewportSize() {
  return {
    height: typeof window === 'undefined' ? 768 : window.innerHeight,
    width: typeof window === 'undefined' ? 1024 : window.innerWidth,
  };
}

/**
 * FLIP-style expand metrics: the full-bleed shell scales up from the card's
 * center so the open path reads as "this card grew into focus mode".
 */
function getExpandFromRect(
  rect: DOMRect,
  viewport: { height: number; width: number }
) {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const transformOrigin = `${(centerX / viewport.width) * 100}% ${
    (centerY / viewport.height) * 100
  }%`;
  const scale = Math.max(
    OPEN_MIN_SCALE,
    Math.min(rect.width / viewport.width, rect.height / viewport.height, 0.92)
  );
  return { scale, transformOrigin };
}

interface FocusedViewProps {
  node: FocusedItem;
  onClose: () => void;
}

interface FolderChildEntry {
  data: Record<string, unknown>;
  id: string;
  type?: string;
}

interface NodeWithLayout {
  data?: unknown;
  height?: number;
  id: string;
  measured?: { width?: number; height?: number };
  position?: { x: number; y: number };
  style?: { height?: number | string; width?: number | string };
  type?: string;
  width?: number;
}

const DEFAULT_NAV_RECT_WIDTH = 320;
const DEFAULT_NAV_RECT_HEIGHT = 180;

function numericSize(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return;
}

function createRect(
  left: number,
  top: number,
  width: number,
  height: number
): DOMRect {
  return new DOMRect(left, top, width, height);
}

function rectForNode(node: NodeWithLayout): DOMRect {
  const registeredSize = node.type
    ? findSpecByNodeType(node.type)?.size
    : undefined;
  const width =
    node.measured?.width ??
    node.width ??
    numericSize(node.style?.width) ??
    registeredSize?.width ??
    DEFAULT_NAV_RECT_WIDTH;
  const height =
    node.measured?.height ??
    node.height ??
    numericSize(node.style?.height) ??
    registeredSize?.height ??
    DEFAULT_NAV_RECT_HEIGHT;
  return createRect(
    node.position?.x ?? 0,
    node.position?.y ?? 0,
    width,
    height
  );
}

function domRectForItem(item: FocusedItem): DOMRect {
  const el =
    typeof document === 'undefined'
      ? null
      : (document.querySelector(
          `[data-id="${item.id}"]`
        ) as HTMLElement | null);
  return el?.getBoundingClientRect() ?? item.rect;
}

function generateChecklistWidgetItemId(): string {
  return `item_${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeChecklistWidgetItems(
  items: ChecklistItem[] | undefined
): ChecklistWidgetItem[] {
  return (items ?? []).map((item) => {
    const source = item as ChecklistItem & Partial<ChecklistWidgetItem>;
    return {
      id:
        typeof source.id === 'string' && source.id
          ? source.id
          : generateChecklistWidgetItemId(),
      text: typeof source.text === 'string' ? source.text : '',
      checked: Boolean(source.checked),
      ...(source.isHeader ? { isHeader: true } : {}),
      ...(typeof source.createdAt === 'string'
        ? { createdAt: source.createdAt }
        : {}),
      ...(typeof source.completedAt === 'string'
        ? { completedAt: source.completedAt }
        : {}),
    };
  });
}

// This orchestrates focus navigation and delegates the per-kind editing UI below.
// react-doctor-disable-next-line react-doctor/no-giant-component
export const FocusedView = ({ node, onClose }: FocusedViewProps) => {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const commitNodeData = useCanvasStore((s) => s.commitNodeData);
  const updateFolderChildData = useCanvasStore((s) => s.updateFolderChildData);
  const commitFolderChildData = useCanvasStore((s) => s.commitFolderChildData);
  const nodes = useCanvasStore((s) => s.nodes);
  const setFocusedNode = useCanvasStore((s) => s.setFocusedNode);
  const folderId =
    typeof node.folderId === 'string' ? node.folderId : undefined;
  const noteIdRaw = node.data.noteId;
  const noteId = typeof noteIdRaw === 'string' ? noteIdRaw : undefined;
  const colorRaw = node.data.color;
  const color = typeof colorRaw === 'string' ? colorRaw : undefined;
  const titleRaw = node.data.title;
  const title = typeof titleRaw === 'string' ? titleRaw : undefined;
  const contentRaw = node.data.content;
  const content = typeof contentRaw === 'string' ? contentRaw : undefined;
  const dataTypeRaw = node.data.type;
  const isFolderChild = Boolean(folderId);
  const widgetId =
    node.type === 'widget' && typeof node.data.widgetId === 'string'
      ? node.data.widgetId
      : undefined;
  const widgetRecord = useWidgetStore((s) =>
    widgetId ? s.records[widgetId] : undefined
  );
  const updateWidget = useWidgetStore((s) => s.updateWidget);
  const checklistWidgetRecord =
    widgetRecord &&
    !isWidgetLoadError(widgetRecord) &&
    widgetRecord.kind === 'checklist'
      ? widgetRecord
      : null;
  const checklistWidgetFocusedData: CardContentData | null =
    checklistWidgetRecord
      ? {
          ...(node.data as CardContentData),
          type: 'checklist',
          title: checklistWidgetRecord.title,
          items: (checklistWidgetRecord.data as ChecklistWidgetData).items,
        }
      : null;

  const updateFocusedData = useCallback(
    (updates: Record<string, unknown>) => {
      if (folderId) {
        updateFolderChildData(folderId, node.id, updates);
        return;
      }
      updateNodeData(node.id, updates);
    },
    [folderId, node.id, updateFolderChildData, updateNodeData]
  );

  const commitFocusedData = useCallback(
    (updates: Record<string, unknown>) => {
      if (folderId) {
        commitFolderChildData(folderId, node.id, updates);
        return;
      }
      commitNodeData(node.id, updates);
    },
    [commitFolderChildData, commitNodeData, folderId, node.id]
  );

  const commitChecklistWidgetData = useCallback(
    (updates: Partial<CardContentData>) => {
      if (!widgetId) {
        return;
      }
      updateWidget(widgetId, (current) => {
        if (current.kind !== 'checklist') {
          return current;
        }
        const currentData = current.data as ChecklistWidgetData;
        return {
          ...current,
          title:
            typeof updates.title === 'string' ? updates.title : current.title,
          data: {
            ...currentData,
            ...(updates.items
              ? { items: normalizeChecklistWidgetItems(updates.items) }
              : {}),
          },
          updatedAt: new Date().toISOString(),
        };
      });
    },
    [updateWidget, widgetId]
  );

  const handleLinkUrlChange = useCallback(
    (url: string) => {
      commitFocusedData({
        url,
        title: getLinkHost(url) || url,
        description: undefined,
        faviconUrl: undefined,
        imageUrl: undefined,
        siteName: undefined,
        unfurlError: undefined,
        unfurlStatus: 'idle',
      });
    },
    [commitFocusedData]
  );

  const focusableItems = useMemo<FocusedItem[]>(() => {
    if (folderId) {
      const folder = nodes.find((candidate) => candidate.id === folderId);
      const children = ((folder?.data as Record<string, unknown> | undefined)
        ?.children ?? []) as FolderChildEntry[];
      const items: FocusedItem[] = [];
      for (const child of children) {
        if (!isFocusableNode(child.type)) {
          continue;
        }
        items.push({
          id: child.id,
          folderId,
          type: child.type,
          data: child.data,
          rect: node.rect,
        });
      }
      return items;
    }

    const items: FocusedItem[] = [];
    for (const candidate of nodes) {
      if (
        !isFocusableNode(candidate.type) ||
        (candidate.data as Record<string, unknown> | undefined)?.detached
      ) {
        continue;
      }
      items.push({
        id: candidate.id,
        type: candidate.type,
        data: candidate.data as Record<string, unknown>,
        rect: rectForNode(candidate as NodeWithLayout),
      });
    }
    return items;
  }, [folderId, node.rect, nodes]);

  const currentIndex = focusableItems.findIndex(
    (item) => item.id === node.id && item.folderId === folderId
  );
  const previousItem =
    currentIndex > 0 ? focusableItems[currentIndex - 1] : undefined;
  const nextItem =
    currentIndex >= 0 && currentIndex < focusableItems.length - 1
      ? focusableItems[currentIndex + 1]
      : undefined;

  const handleNavigate = useCallback(
    (item: FocusedItem) => {
      // Navigating to the *same* node (e.g. a stray re-click) used to recompute
      // a fresh DOMRect via getBoundingClientRect, which gave focusedNode a new
      // object identity and rippled into unnecessary re-renders + keyboard
      // listener rebuilds. Keep the existing rect when the target is unchanged.
      if (item.id === node.id && item.folderId === folderId) {
        return;
      }
      const latestNode = item.folderId
        ? null
        : nodes.find((candidate) => candidate.id === item.id);
      const latestItem = latestNode
        ? {
            id: latestNode.id,
            type: latestNode.type,
            data: latestNode.data as Record<string, unknown>,
            rect: rectForNode(latestNode as NodeWithLayout),
          }
        : item;
      setFocusedNode({
        ...latestItem,
        rect: domRectForItem(latestItem),
      });
    },
    [nodes, setFocusedNode, node.id, folderId]
  );

  const isText =
    node.type !== 'widget' &&
    node.type !== 'image' &&
    (dataTypeRaw === 'text' || dataTypeRaw == null) &&
    FLAGS.focusedNoteEditor;
  const isImage = node.type === 'image';
  const isChecklist =
    !isImage &&
    node.type !== 'asset' &&
    node.type !== 'link' &&
    dataTypeRaw === 'checklist';
  // Full-bleed surfaces own their entire layout; the others render inside the
  // centered detail shell.
  const isChecklistWidget = Boolean(checklistWidgetFocusedData && widgetId);
  const isFullBleed = isText || isChecklist || isChecklistWidget || isImage;
  const chromeButtonClass = isImage
    ? 'bg-white/10 text-zinc-300 hover:bg-white/20'
    : 'bg-black/5 text-zinc-600 hover:bg-black/10 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/20';

  const [saveStatus, setSaveStatus] = useState<BlockNoteSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const didToastOnErrorRef = useRef(false);
  const shouldReduceMotion = useReducedMotion();

  // Origin for the expand/collapse morph. Recomputed when navigating to a
  // sibling so close shrinks back toward the currently focused card.
  const expandMetrics = useMemo(() => {
    const viewport = getViewportSize();
    return getExpandFromRect(node.rect, viewport);
  }, [node.rect]);

  const handleSaveStatusChange = useCallback(
    (status: BlockNoteSaveStatus, savedAt: Date | null) => {
      setSaveStatus(status);
      if (status === 'saved') {
        setLastSavedAt(savedAt);
        didToastOnErrorRef.current = false;
      } else if (status === 'error' && !didToastOnErrorRef.current) {
        didToastOnErrorRef.current = true;
        toast.error(m.toast_save_failed());
      }
    },
    []
  );

  const { setCenter, getViewport, getNodes } = useReactFlow();

  const handleClose = useCallback(() => {
    const rfNodes = getNodes();
    const targetId = folderId ?? node.id;
    const rfNode = rfNodes.find((n) => n.id === targetId) as
      | NodeWithLayout
      | undefined;
    if (rfNode?.position) {
      const w =
        rfNode.measured?.width ??
        rfNode.width ??
        numericSize(rfNode.style?.width) ??
        DEFAULT_NAV_RECT_WIDTH;
      const h =
        rfNode.measured?.height ??
        rfNode.height ??
        numericSize(rfNode.style?.height) ??
        DEFAULT_NAV_RECT_HEIGHT;
      const cx = rfNode.position.x + w / 2;
      const cy = rfNode.position.y + h / 2;
      const vp = getViewport();
      const screenL = -vp.x / vp.zoom;
      const screenT = -vp.y / vp.zoom;
      const screenR = screenL + window.innerWidth / vp.zoom;
      const screenB = screenT + window.innerHeight / vp.zoom;
      if (cx < screenL || cx > screenR || cy < screenT || cy > screenB) {
        suppressViewportPersist(50);
        setCenter(cx, cy, { zoom: vp.zoom, duration: 0 });
      }
    }
    onClose();
  }, [getNodes, getViewport, setCenter, folderId, node.id, onClose]);

  useBodyScrollLock();

  // Cmd/Ctrl + ←/→ navigate to the previous / next focusable item.
  const handleNavigationKey = useEffectEvent((event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey)) {
      return;
    }
    if (event.key === 'ArrowLeft' && previousItem) {
      event.preventDefault();
      handleNavigate(previousItem);
      return;
    }
    if (event.key === 'ArrowRight' && nextItem) {
      event.preventDefault();
      handleNavigate(nextItem);
    }
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      handleNavigationKey(event);
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, []);

  // Fallback ESC handler
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => {
      document.removeEventListener('keydown', handler, true);
    };
  }, [handleClose]);

  const openTransition = shouldReduceMotion
    ? { duration: 0.1 }
    : {
        default: {
          type: 'spring' as const,
          stiffness: 240,
          damping: 30,
          mass: 0.9,
        },
        opacity: { duration: 0.18, ease: EASE_OUT_QUINT },
      };
  const closeTransition = {
    duration: shouldReduceMotion ? 0.08 : CLOSE_DURATION_S,
    ease: EASE_OUT_QUINT,
  };
  const chromeTransition = {
    delay: shouldReduceMotion ? 0 : 0.16,
    duration: shouldReduceMotion ? 0.08 : 0.22,
    ease: EASE_OUT_QUINT,
  };

  // Root must be a motion node so AnimatePresence can run the exit morph.
  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'fixed inset-0 z-60 flex overflow-hidden',
        isImage ? 'bg-zinc-950' : 'bg-white dark:bg-zinc-950'
      )}
      exit={{
        opacity: 0,
        scale: shouldReduceMotion ? 1 : expandMetrics.scale,
        transition: closeTransition,
      }}
      initial={
        shouldReduceMotion
          ? { opacity: 0, scale: 1 }
          : { opacity: 0, scale: expandMetrics.scale }
      }
      style={{ transformOrigin: expandMetrics.transformOrigin }}
      transition={openTransition}
    >
      {/* Floating Back Button (positioned below macOS traffic lights) */}
      <motion.button
        animate={{ opacity: 1 }}
        aria-label={m.focused_close()}
        className={cn(
          'absolute top-12 left-6 z-70 flex size-8 items-center justify-center rounded-full transition-colors',
          chromeButtonClass
        )}
        initial={{ opacity: 0 }}
        onClick={(e) => {
          e.stopPropagation();
          handleClose();
        }}
        transition={chromeTransition}
        type="button"
      >
        <ArrowLeft size={16} />
      </motion.button>

      {/* Floating image caption (lightbox mode) */}
      {isImage && title ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-70 flex justify-center">
          <span className="max-w-[70vw] truncate rounded-full bg-white/10 px-4 py-1.5 text-sm text-white/90 backdrop-blur-md">
            {title}
          </span>
        </div>
      ) : null}

      {/* Floating Save Status (bottom right) */}
      {isText && saveStatus !== 'idle' ? (
        <div className="absolute right-6 bottom-6 z-70 text-xs text-zinc-400">
          <SaveIndicator lastSavedAt={lastSavedAt} status={saveStatus} />
        </div>
      ) : null}

      {/* Content Area */}
      <div
        className="flex h-full w-full justify-center overflow-hidden"
        onClick={handleClose}
        role="presentation"
      >
        <div
          className={cn(
            isFullBleed && 'h-full w-full',
            !isFullBleed &&
              (node.type === 'asset'
                ? 'h-full w-full max-w-6xl p-4 pt-16 md:p-10 md:pt-16'
                : 'h-full w-full max-w-4xl p-4 pt-16 md:p-12 md:pt-16')
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className={
              isFullBleed
                ? 'h-full w-full'
                : 'h-full w-full overflow-hidden rounded-[32px] border border-black/5 bg-white shadow-2xl dark:border-white/5 dark:bg-zinc-900'
            }
          >
            {node.type === 'image' ? (
              <ImageZoomPan>
                <ImageContent
                  data={node.data as unknown as ImageData}
                  isFocused={true}
                />
              </ImageZoomPan>
            ) : node.type === 'asset' ? (
              <AssetContent data={node.data} isFocused={true} />
            ) : node.type === 'link' ? (
              <LinkContent
                data={node.data}
                isFocused={true}
                onUrlChange={handleLinkUrlChange}
              />
            ) : isChecklistWidget && checklistWidgetFocusedData ? (
              <ChecklistFocusedView
                data={checklistWidgetFocusedData}
                onCommit={commitChecklistWidgetData}
              />
            ) : isText ? (
              <Suspense
                fallback={<NoteEditorLoading color={color} title={title} />}
              >
                <BlockNoteEditor
                  color={color}
                  data={node.data}
                  key={node.id}
                  markdown={content}
                  nodeId={node.id}
                  noteId={noteId}
                  onMarkdownChange={(markdown) => {
                    updateFocusedData({
                      content: markdown,
                      previewBlocks: undefined,
                      previewExcerpt: undefined,
                      previewHtml: undefined,
                      previewVersion: undefined,
                    });
                  }}
                  onPreviewUpdate={
                    isFolderChild ? updateFocusedData : undefined
                  }
                  onSaveStatusChange={handleSaveStatusChange}
                  onTitleChange={(nextTitle) => {
                    updateFocusedData({ title: nextTitle });
                  }}
                  title={title}
                />
              </Suspense>
            ) : isChecklist ? (
              <ChecklistFocusedView
                data={node.data as unknown as CardContentData}
                onCommit={(updates) => {
                  commitFocusedData(updates);
                }}
              />
            ) : (
              <CardContent
                data={node.data as unknown as CardContentData}
                isFocused={true}
                onChange={(newData) => {
                  commitFocusedData(newData);
                }}
              />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
