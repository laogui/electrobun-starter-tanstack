import { ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { lazy, Suspense, useCallback, useEffect, useMemo } from 'react';

import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { FLAGS } from '@/lib/flags';
import { type FocusedItem, useCanvasStore } from '@/store/canvasStore';
import { AssetContent } from './nodes/AssetNode';
import type { CardContentData } from './nodes/CardNode';
import { CardContent } from './nodes/CardNode';
import type { ImageData } from './nodes/ImageNode';
import { ImageContent } from './nodes/ImageNode';
import { LinkContent } from './nodes/LinkNode';

const TiptapEditor = lazy(() => import('@/components/editor/TiptapEditor'));

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

export const FocusedView = ({ node, onClose }: FocusedViewProps) => {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const commitNodeData = useCanvasStore((s) => s.commitNodeData);
  const updateFolderChildData = useCanvasStore((s) => s.updateFolderChildData);
  const commitFolderChildData = useCanvasStore((s) => s.commitFolderChildData);
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

  const isText =
    node.type !== 'image' &&
    (dataTypeRaw === 'text' || dataTypeRaw == null) &&
    FLAGS.tiptapEditor;

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
            <LinkContent data={node.data} isFocused={true} />
          ) : isText ? (
            <Suspense fallback={<FocusedSkeleton color={color} />}>
              <TiptapEditor
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
                onTitleChange={(nextTitle) => {
                  updateFocusedData({ title: nextTitle });
                }}
                title={title}
              />
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
