import { ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo } from 'react';

import { useCanvasStore } from '@/store/canvasStore';

import { CardContent } from './nodes/CardNode';
import { ImageContent } from './nodes/ImageNode';

export const FocusedView = ({ node, onClose }: any) => {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  // Target dimensions (final size)
  const targetWidth = Math.min(800, window.innerWidth * 0.8);
  const targetHeight = Math.min(900, window.innerHeight * 0.85);

  // Target center position
  const targetX = (window.innerWidth - targetWidth) / 2;
  const targetY = (window.innerHeight - targetHeight) / 2;

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
        className="absolute top-8 left-8 z-60 rounded-full bg-white/10 p-3 text-white backdrop-blur-md transition-colors hover:bg-white/20"
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
          borderRadius: 32,
        }}
        className="absolute overflow-hidden shadow-2xl"
        exit={{
          x: flip.translateX,
          y: flip.translateY,
          scaleX: flip.scaleX,
          scaleY: flip.scaleY,
          borderRadius: 24,
        }}
        initial={{
          x: flip.translateX,
          y: flip.translateY,
          scaleX: flip.scaleX,
          scaleY: flip.scaleY,
          borderRadius: 24,
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
            <ImageContent data={node.data} isFocused={true} />
          ) : (
            <CardContent
              data={node.data}
              isFocused={true}
              onChange={(newData: any) => {
                updateNodeData(node.id, newData);
              }}
            />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
