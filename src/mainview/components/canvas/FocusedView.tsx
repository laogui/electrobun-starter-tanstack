import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { SaveIndicator } from '@/components/editor/SaveIndicator';
import type { BlockNoteSaveStatus } from '@/components/editor/useBlockNoteSaver';
import { isFocusableNode } from '@/lib/canvasNodePredicates';
import { findSpecByNodeType } from '@/lib/canvasNodeRegistry';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { getLinkHost } from '@/lib/contentTypes';
import { FLAGS } from '@/lib/flags';
import { type FocusedItem, useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';
import { AssetContent } from './nodes/AssetNode';
import type { CardContentData } from './nodes/CardNode';
import { CardContent } from './nodes/CardNode';
import type { ImageData } from './nodes/ImageNode';
import { ImageContent } from './nodes/ImageNode';
import { LinkContent } from './nodes/LinkNode';

// Word/character counts derived from markdown body. Stripping fenced code,
// link/image syntax, and inline formatting keeps the visible counts closer to
// what users perceive as content.
const WORD_SPLIT_RE = /\s+/;
function countMarkdown(markdown: string): { words: number; chars: number } {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = plain ? plain.split(WORD_SPLIT_RE).filter(Boolean).length : 0;
  return { words, chars: plain.length };
}

const WordCountBadge = ({ markdown }: { markdown: string }) => {
  const counts = useMemo(() => countMarkdown(markdown), [markdown]);
  return (
    <div className="pointer-events-none absolute right-6 bottom-6 rounded-full bg-black/30 px-3 py-1 text-white/80 text-xs backdrop-blur-md">
      {m.focused_word_count({ words: counts.words, chars: counts.chars })}
    </div>
  );
};

const BlockNoteEditor = lazy(
  () => import('@/components/editor/BlockNoteEditor')
);

const FocusedSkeleton = ({ color }: { color?: unknown }) => {
  const colorValue = typeof color === 'string' ? color : '#FFFFFF';
  return (
    <div
      className="flex h-full flex-col gap-6 p-8"
      style={colorToStyle(colorValue)}
    >
      <div
        className={`h-11 w-2/3 animate-pulse rounded-md ${
          isColorDark(colorValue) ? 'bg-white/20' : 'bg-black/10'
        }`}
      />
      <div
        className={`h-full animate-pulse rounded-lg ${
          isColorDark(colorValue) ? 'bg-white/10' : 'bg-black/5'
        }`}
      />
    </div>
  );
};

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
      const children = (
        ((folder?.data as Record<string, unknown> | undefined)?.children ??
          []) as FolderChildEntry[]
      ).filter((child) => isFocusableNode(child.type));
      return children.map((child) => ({
        id: child.id,
        folderId,
        type: child.type,
        data: child.data,
        rect: node.rect,
      }));
    }

    return nodes
      .filter(
        (candidate) =>
          isFocusableNode(candidate.type) &&
          !(candidate.data as Record<string, unknown> | undefined)?.detached
      )
      .map((candidate) => ({
        id: candidate.id,
        type: candidate.type,
        data: candidate.data as Record<string, unknown>,
        rect: rectForNode(candidate as NodeWithLayout),
      }));
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
    [nodes, setFocusedNode]
  );

  const isText =
    node.type !== 'image' &&
    (dataTypeRaw === 'text' || dataTypeRaw == null) &&
    FLAGS.focusedNoteEditor;

  const [saveStatus, setSaveStatus] = useState<BlockNoteSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const didToastOnErrorRef = useRef(false);

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

  // Notes go fullscreen; other content keeps the original centered modal size.
  const targetWidth = isText
    ? window.innerWidth
    : Math.min(800, window.innerWidth * 0.8);
  const targetHeight = isText
    ? window.innerHeight
    : Math.min(900, window.innerHeight * 0.85);

  // Target position
  const targetX = (window.innerWidth - targetWidth) / 2;
  const targetY = (window.innerHeight - targetHeight) / 2;

  const targetBorderRadius = isText ? 0 : 32;
  const initialBorderRadius = isText ? 0 : 24;

  // Compute scale and translate for FLIP animation
  const flip = useMemo(() => {
    const scaleX = node.rect.width / targetWidth;
    const scaleY = node.rect.height / targetHeight;

    const cardCenterX = node.rect.left + node.rect.width / 2;
    const cardCenterY = node.rect.top + node.rect.height / 2;
    const targetCenterX = targetX + targetWidth / 2;
    const targetCenterY = targetY + targetHeight / 2;

    const translateX = cardCenterX - targetCenterX;
    const translateY = cardCenterY - targetCenterY;

    return { scaleX, scaleY, translateX, translateY };
  }, [node.rect, targetWidth, targetHeight, targetX, targetY]);

  // Prevent background scrolling
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  // Cmd/Ctrl + ←/→ navigate to the previous / next focusable item. Mirrors the
  // on-screen chevron buttons; modifier-gated so plain ←/→ stay available to
  // any focused input or editor inside the modal.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
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
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [handleNavigate, nextItem, previousItem]);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-md"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onClose}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
    >
      <motion.button
        animate={{ opacity: 1, x: 0 }}
        className="absolute top-8 left-8 z-70 rounded-full bg-black/40 p-3 text-white backdrop-blur-md transition-colors hover:bg-black/60"
        exit={{ opacity: 0, x: -20 }}
        initial={{ opacity: 0, x: -20 }}
        onClick={onClose}
        transition={{
          type: 'spring',
          damping: 20,
          stiffness: 300,
          delay: 0.15,
        }}
        whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.25)' }}
        whileTap={{ scale: 0.9 }}
      >
        <ArrowLeft size={24} />
      </motion.button>

      {isText && saveStatus !== 'idle' ? (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-8 right-8 z-70"
          exit={{ opacity: 0, y: -20 }}
          initial={{ opacity: 0, y: -20 }}
          transition={{
            type: 'spring',
            damping: 20,
            stiffness: 300,
            delay: 0.15,
          }}
        >
          <SaveIndicator
            className="bg-black/40 backdrop-blur-md"
            lastSavedAt={lastSavedAt}
            status={saveStatus}
          />
        </motion.div>
      ) : null}

      {previousItem ? (
        <motion.button
          animate={{ opacity: 1, x: 0 }}
          aria-label="Previous item"
          className="absolute top-1/2 left-8 z-70 rounded-full bg-black/40 p-3 text-white backdrop-blur-md transition-colors hover:bg-black/60"
          exit={{ opacity: 0, x: -20 }}
          initial={{ opacity: 0, x: -20 }}
          onClick={(event) => {
            event.stopPropagation();
            handleNavigate(previousItem);
          }}
          transition={{
            type: 'spring',
            damping: 20,
            stiffness: 300,
            delay: 0.15,
          }}
          whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.25)' }}
          whileTap={{ scale: 0.9 }}
        >
          <ChevronLeft size={24} />
        </motion.button>
      ) : null}

      {nextItem ? (
        <motion.button
          animate={{ opacity: 1, x: 0 }}
          aria-label="Next item"
          className="absolute top-1/2 right-8 z-70 rounded-full bg-black/40 p-3 text-white backdrop-blur-md transition-colors hover:bg-black/60"
          exit={{ opacity: 0, x: 20 }}
          initial={{ opacity: 0, x: 20 }}
          onClick={(event) => {
            event.stopPropagation();
            handleNavigate(nextItem);
          }}
          transition={{
            type: 'spring',
            damping: 20,
            stiffness: 300,
            delay: 0.15,
          }}
          whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.25)' }}
          whileTap={{ scale: 0.9 }}
        >
          <ChevronRight size={24} />
        </motion.button>
      ) : null}

      <motion.div
        animate={{
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          borderRadius: targetBorderRadius,
        }}
        className="absolute overflow-hidden shadow-2xl"
        exit={{
          x: flip.translateX,
          y: flip.translateY,
          scaleX: flip.scaleX,
          scaleY: flip.scaleY,
          borderRadius: initialBorderRadius,
        }}
        initial={{
          x: flip.translateX,
          y: flip.translateY,
          scaleX: flip.scaleX,
          scaleY: flip.scaleY,
          borderRadius: initialBorderRadius,
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
        style={{
          top: targetY,
          left: targetX,
          width: targetWidth,
          height: targetHeight,
          transformOrigin: 'center center',
        }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
      >
        <div className="h-full">
          {node.type === 'image' ? (
            <ImageContent
              data={node.data as unknown as ImageData}
              isFocused={true}
            />
          ) : node.type === 'asset' ? (
            <AssetContent data={node.data} isFocused={true} />
          ) : node.type === 'link' ? (
            <LinkContent
              data={node.data}
              isFocused={true}
              onUrlChange={handleLinkUrlChange}
            />
          ) : isText ? (
            <Suspense fallback={<FocusedSkeleton color={color} />}>
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
                onPreviewUpdate={isFolderChild ? updateFocusedData : undefined}
                onSaveStatusChange={handleSaveStatusChange}
                onTitleChange={(nextTitle) => {
                  updateFocusedData({ title: nextTitle });
                }}
                title={title}
              />
              <WordCountBadge markdown={content ?? ''} />
            </Suspense>
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
      </motion.div>
    </motion.div>
  );
};
