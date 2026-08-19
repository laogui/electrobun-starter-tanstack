import { Layers3, Play } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import * as motion from 'motion/react-m';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import type { FocusedItem } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';

import * as m from '../../../paraglide/messages.js';
import {
  type ExtensionInstanceLoadError,
  type ExtensionInstanceRecord,
  isExtensionInstanceLoadError,
} from '../../../shared/extensions/instance';
import { CanvasContextMenu, type ContextMenuState } from './ContextMenu';
import { FolderChildPreview } from './FolderChildPreview';
import { calculateFolderFanLayout } from './folderFanLayout';

export interface FolderChild {
  data: Record<string, unknown>;
  id: string;
  type: string;
}

interface ActiveChildMenu {
  menu: NonNullable<ContextMenuState>;
  rect: DOMRect;
}

type FanEntry =
  | { child: FolderChild; kind: 'child' }
  | { kind: 'more'; remaining: number };

const MAX_VISIBLE_CHILDREN = 8;
const PAGED_CHILDREN = 7;
const PREVIEW_WIDTH = 280;
const PREVIEW_HEIGHT = PREVIEW_WIDTH * 1.28;
const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const getViewportSize = () => ({
  height: typeof window === 'undefined' ? 768 : window.innerHeight,
  width: typeof window === 'undefined' ? 1024 : window.innerWidth,
});

function useViewportSize() {
  const [viewport, setViewport] = useState(getViewportSize);

  useEffect(() => {
    const updateViewport = () => {
      setViewport(getViewportSize());
    };
    window.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  return viewport;
}

const FolderChildContent = ({ child }: { child: FolderChild }) => (
  <FolderChildPreview child={child} />
);

function getChildLabel(
  child: FolderChild,
  instances: Record<
    string,
    ExtensionInstanceRecord | ExtensionInstanceLoadError
  >
): string {
  if (child.type === 'extension') {
    const instanceId =
      typeof child.data.instanceId === 'string' ? child.data.instanceId : '';
    const record = instanceId ? instances[instanceId] : undefined;
    if (record && !isExtensionInstanceLoadError(record)) {
      const presentationTitle = record.presentation.title.trim();
      if (presentationTitle) {
        return presentationTitle;
      }
      const subtitle = record.presentation.subtitle?.trim();
      if (subtitle) {
        return subtitle;
      }
    }
  }
  const title = child.data.title;
  if (typeof title === 'string' && title.trim()) {
    return title.trim();
  }
  const fileName = child.data.fileName;
  if (typeof fileName === 'string' && fileName.trim()) {
    return fileName.trim();
  }
  return m.folder_view_untitled_item();
}

interface FolderViewProps {
  folder: FocusedItem;
  onCardClick?: (child: FolderChild, rect: DOMRect) => void;
  onClose: () => void;
  onMoveChildOut?: (child: FolderChild, rect: DOMRect) => void;
}

export const FolderView = ({
  folder,
  onClose,
  onCardClick,
  onMoveChildOut,
}: FolderViewProps) => {
  const extensionRecords = useExtensionInstanceStore((s) => s.records);
  const childrenRaw = folder.data.children;
  const children: FolderChild[] = useMemo(
    () => (Array.isArray(childrenRaw) ? (childrenRaw as FolderChild[]) : []),
    [childrenRaw]
  );
  const count = children.length;
  const viewport = useViewportSize();
  const shouldReduceMotion = useReducedMotion();
  const pageSize = count > MAX_VISIBLE_CHILDREN ? PAGED_CHILDREN : count || 1;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const [page, setPage] = useState(0);
  const pageStart = page * pageSize;
  const pageChildren = children.slice(pageStart, pageStart + pageSize);
  const remainingAfterPage = Math.max(
    0,
    count - pageStart - pageChildren.length
  );
  const entries: FanEntry[] = useMemo(() => {
    const childEntries = pageChildren.map(
      (child): FanEntry => ({ child, kind: 'child' })
    );
    if (totalPages <= 1) {
      return childEntries;
    }
    const remaining =
      remainingAfterPage > 0 ? remainingAfterPage : Math.min(pageSize, count);
    return [...childEntries, { kind: 'more', remaining }];
  }, [count, pageChildren, pageSize, remainingAfterPage, totalPages]);
  const layout = useMemo(
    () =>
      calculateFolderFanLayout({
        folderRect: folder.rect,
        slotCount: entries.length,
        viewport,
      }),
    [entries.length, folder.rect, viewport]
  );
  const folderCenterX = folder.rect.left + folder.rect.width / 2;
  const folderCenterY = folder.rect.top + folder.rect.height / 2;
  const folderTitle =
    typeof folder.data.title === 'string' && folder.data.title.trim()
      ? folder.data.title.trim()
      : m.menu_folder();

  const layerRef = useRef<HTMLDivElement>(null);
  const entryRefs = useRef<Array<HTMLDivElement | null>>([]);
  const hasMountedRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [raisedIndex, setRaisedIndex] = useState<number | null>(null);
  const [childMenu, setChildMenu] = useState<ActiveChildMenu | null>(null);
  const [draggedChildId, setDraggedChildId] = useState<string | null>(null);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  useEffect(() => {
    if (page < 0) {
      return;
    }
    setActiveIndex(0);
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      layerRef.current?.focus({ preventScroll: true });
      return;
    }
    entryRefs.current[0]?.focus({ preventScroll: true });
  }, [page]);

  const focusEntry = useCallback(
    (nextIndex: number) => {
      if (entries.length === 0) {
        return;
      }
      const normalized = (nextIndex + entries.length) % entries.length;
      setActiveIndex(normalized);
      queueMicrotask(() => {
        entryRefs.current[normalized]?.focus();
      });
    },
    [entries.length]
  );

  const showNextPage = useCallback(() => {
    setPage((current) => (current + 1) % totalPages);
  }, [totalPages]);

  const openChild = useCallback(
    (child: FolderChild, element: HTMLElement) => {
      onCardClick?.(child, element.getBoundingClientRect());
    },
    [onCardClick]
  );

  const handleEntryKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, index: number) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        focusEntry(index + 1);
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        focusEntry(index - 1);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        focusEntry(0);
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        focusEntry(entries.length - 1);
        return;
      }
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      event.preventDefault();
      const entry = entries[index];
      if (entry?.kind === 'more') {
        showNextPage();
      } else if (entry?.kind === 'child') {
        openChild(entry.child, event.currentTarget);
      }
    },
    [entries, focusEntry, openChild, showNextPage]
  );

  const handleChildMenuAction = useCallback(
    (action: string, childId?: string) => {
      if (action !== 'move-out' || !childId || !childMenu) {
        return;
      }
      const child = children.find((item) => item.id === childId);
      if (!child) {
        return;
      }
      onMoveChildOut?.(child, childMenu.rect);
      setChildMenu(null);
    },
    [childMenu, children, onMoveChildOut]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!(draggedChildId && onMoveChildOut)) {
        return;
      }
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('[data-folder-fan-interactive="true"]')
      ) {
        return;
      }
      const child = children.find((item) => item.id === draggedChildId);
      if (!child) {
        return;
      }

      event.preventDefault();
      const rect = new DOMRect(
        event.clientX - layout.cardWidth / 2,
        event.clientY - layout.cardHeight / 2,
        layout.cardWidth,
        layout.cardHeight
      );
      onMoveChildOut(child, rect);
      setDraggedChildId(null);
      onClose();
    },
    [
      children,
      draggedChildId,
      layout.cardHeight,
      layout.cardWidth,
      onClose,
      onMoveChildOut,
    ]
  );

  const emptyTop =
    layout.direction === 'up'
      ? clamp(folder.rect.top - 44, 16, viewport.height - 44)
      : clamp(folder.rect.bottom + 16, 16, viewport.height - 44);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      aria-label={m.folder_view_aria({ title: folderTitle })}
      className="pointer-events-none fixed inset-0 z-20 overflow-hidden outline-none"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onDragOver={(event) => {
        if (draggedChildId) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }
      }}
      onDrop={handleDrop}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      ref={layerRef}
      role="region"
      tabIndex={-1}
      transition={{ duration: shouldReduceMotion ? 0.08 : 0.18 }}
    >
      <button
        aria-label={m.folder_view_close()}
        className="pointer-events-auto absolute inset-0 cursor-default bg-transparent"
        data-folder-fan-backdrop="true"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />

      <button
        aria-label={m.folder_view_close()}
        className="pointer-events-auto fixed grid place-items-center rounded-[20px] bg-transparent focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-3"
        data-folder-fan-interactive="true"
        onClick={onClose}
        style={{
          height: folder.rect.height,
          left: folder.rect.left,
          top: folder.rect.top,
          width: folder.rect.width,
          zIndex: 32,
        }}
        type="button"
      >
        <span className="grid size-8 place-items-center rounded-full bg-white/62 text-neutral-500 shadow-sm ring-1 ring-black/6 dark:bg-neutral-900/62 dark:text-neutral-300 dark:ring-white/10">
          <Play className="translate-x-px" fill="currentColor" size={13} />
        </span>
      </button>

      {entries.length === 0 ? (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="pointer-events-none fixed rounded-full bg-white/88 px-3 py-1.5 text-neutral-500 text-xs shadow-sm ring-1 ring-black/5 dark:bg-neutral-900/88 dark:text-neutral-400 dark:ring-white/10"
          exit={{ opacity: 0 }}
          initial={{
            opacity: 0,
            y: shouldReduceMotion
              ? 0
              : folderCenterY - emptyTop - folder.rect.height / 2,
          }}
          role="status"
          style={{
            left: clamp(folderCenterX - 110, 16, viewport.width - 236),
            top: emptyTop,
            zIndex: 30,
          }}
          transition={{
            duration: shouldReduceMotion ? 0.08 : 0.22,
            ease: EASE_OUT_QUINT,
          }}
        >
          {m.folder_view_empty_hint()}
        </motion.div>
      ) : (
        <div
          aria-label={m.folder_view_items_aria({ title: folderTitle })}
          className="pointer-events-none absolute inset-0"
          role="listbox"
        >
          {entries.map((entry, index) => {
            const slot = layout.slots[index];
            if (!slot) {
              return null;
            }
            const originX = folderCenterX - (slot.left + layout.cardWidth / 2);
            const originY = folderCenterY - (slot.top + layout.cardHeight / 2);
            const isChild = entry.kind === 'child';
            const childLabel = isChild
              ? getChildLabel(entry.child, extensionRecords)
              : '';
            const ariaLabel = isChild
              ? m.folder_view_open_item({ title: childLabel })
              : m.folder_view_more_items({ count: entry.remaining });
            const previewScale = slot.width / PREVIEW_WIDTH;

            return (
              <motion.div
                animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                aria-label={ariaLabel}
                aria-selected={activeIndex === index}
                className={cn(
                  'pointer-events-auto fixed cursor-pointer overflow-hidden rounded-lg bg-white text-left shadow-card focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-3 dark:bg-neutral-800',
                  isChild && 'cursor-grab active:cursor-grabbing'
                )}
                data-folder-fan-card="true"
                data-folder-fan-interactive="true"
                draggable={isChild && Boolean(onMoveChildOut)}
                exit={{
                  opacity: 0,
                  scale: shouldReduceMotion ? 0.98 : 0.5,
                  x: shouldReduceMotion ? 0 : originX,
                  y: shouldReduceMotion ? 0 : originY,
                  transition: {
                    delay: shouldReduceMotion
                      ? 0
                      : (entries.length - 1 - index) * 0.018,
                    duration: shouldReduceMotion ? 0.08 : 0.16,
                    ease: EASE_OUT_QUINT,
                  },
                }}
                initial={{
                  opacity: 0,
                  scale: shouldReduceMotion ? 0.98 : 0.5,
                  x: shouldReduceMotion ? 0 : originX,
                  y: shouldReduceMotion ? 0 : originY,
                }}
                key={isChild ? entry.child.id : `more-${page}`}
                onBlur={() => {
                  setRaisedIndex(null);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isChild) {
                    openChild(entry.child, event.currentTarget);
                  } else {
                    showNextPage();
                  }
                }}
                onContextMenu={
                  isChild
                    ? (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setChildMenu({
                          menu: {
                            nodeId: entry.child.id,
                            target: 'folder-child',
                            x: event.clientX,
                            y: event.clientY,
                          },
                          rect: event.currentTarget.getBoundingClientRect(),
                        });
                      }
                    : undefined
                }
                onDragEndCapture={() => {
                  setDraggedChildId(null);
                }}
                onDragStartCapture={
                  isChild
                    ? (event) => {
                        event.stopPropagation();
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData(
                          'text/plain',
                          entry.child.id
                        );
                        setDraggedChildId(entry.child.id);
                      }
                    : undefined
                }
                onFocus={() => {
                  setActiveIndex(index);
                  setRaisedIndex(index);
                }}
                onKeyDown={(event) => {
                  handleEntryKeyDown(event, index);
                }}
                onMouseEnter={() => {
                  setRaisedIndex(index);
                }}
                onMouseLeave={(event) => {
                  if (document.activeElement !== event.currentTarget) {
                    setRaisedIndex(null);
                  }
                }}
                ref={(element) => {
                  entryRefs.current[index] = element;
                }}
                role="option"
                style={{
                  height: slot.height,
                  left: slot.left,
                  top: slot.top,
                  width: slot.width,
                  zIndex: raisedIndex === index ? 35 : slot.zIndex,
                }}
                tabIndex={activeIndex === index ? 0 : -1}
                transition={{
                  delay: shouldReduceMotion ? 0 : index * 0.026,
                  duration: shouldReduceMotion ? 0.08 : 0.24,
                  ease: EASE_OUT_QUINT,
                }}
                whileHover={
                  shouldReduceMotion
                    ? undefined
                    : {
                        scale: 1.04,
                        transition: { duration: 0.12, ease: EASE_OUT_QUINT },
                        y: -4,
                      }
                }
                whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
              >
                {isChild ? (
                  <div
                    aria-hidden
                    className="pointer-events-none origin-top-left select-none"
                    style={{
                      height: PREVIEW_HEIGHT,
                      transform: `scale(${previewScale})`,
                      width: PREVIEW_WIDTH,
                    }}
                  >
                    <FolderChildContent child={entry.child} />
                  </div>
                ) : (
                  <div className="flex size-full flex-col items-center justify-center text-neutral-600 dark:text-neutral-300">
                    <Layers3 size={16} />
                    <div className="mt-1 font-bold text-sm tabular-nums">
                      +{entry.remaining}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      <CanvasContextMenu
        menu={childMenu?.menu ?? null}
        onAction={handleChildMenuAction}
        onClose={() => {
          setChildMenu(null);
        }}
      />
    </motion.div>
  );
};
