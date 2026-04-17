import { ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';

import { colorToStyle } from '@/lib/colorUtils';

import { CardContent } from './nodes/CardNode';
import { ImageContent } from './nodes/ImageNode';

const FolderChildContent = ({ child }: { child: any }) => {
  if (child.type === 'image') {
    return <ImageContent data={child.data} />;
  }
  if (child.type === 'sticky') {
    return (
      <div
        className="flex size-full flex-col p-4"
        style={colorToStyle(child.data.color)}
      >
        <div className="wrap-break-word flex-1 whitespace-pre-wrap text-sm/relaxed">
          {child.data.content}
        </div>
      </div>
    );
  }
  return <CardContent data={child.data} />;
};

export const FolderView = ({ folder, onClose, onCardClick }: any) => {
  const children = folder.data.children || [];
  const count = children.length;
  const cardWidth = 350;
  const cardHeight = 450;
  const gap = 48;
  const minPadding = 64;

  const totalWidth = count * cardWidth + (count - 1) * gap;
  const sidePadding = Math.max(
    minPadding,
    (window.innerWidth - totalWidth) / 2
  );

  const folderCenterX = folder.rect.left + folder.rect.width / 2;
  const folderCenterY = folder.rect.top + folder.rect.height / 2;
  const cardsCenterY = window.innerHeight / 2;

  // Radial spread: compute angle for each card fanning out from folder center
  const getRadialOffset = (index: number) => {
    const angleSpread = Math.min(120, count * 30);
    const startAngle = -angleSpread / 2;
    const angleStep = count > 1 ? angleSpread / (count - 1) : 0;
    const angle = (startAngle + angleStep * index) * (Math.PI / 180);
    const radius = 280;
    return {
      x: Math.sin(angle) * radius,
      y: -Math.abs(Math.cos(angle)) * radius * 0.4,
      rotate: (startAngle + angleStep * index) * 0.3,
    };
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({
    isDown: false,
    startX: 0,
    scrollLeft: 0,
    hasDragged: false,
  });

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    dragState.current = {
      isDown: true,
      startX: e.pageX,
      scrollLeft: el.scrollLeft,
      hasDragged: false,
    };
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState.current.isDown) {
      return;
    }
    e.preventDefault();
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const dx = e.pageX - dragState.current.startX;
    if (Math.abs(dx) > 3) {
      dragState.current.hasDragged = true;
    }
    el.scrollLeft = dragState.current.scrollLeft - dx * 1.2;
  }, []);

  const handleMouseUp = useCallback(() => {
    dragState.current.isDown = false;
    const el = scrollRef.current;
    if (el) {
      el.style.cursor = '';
      el.style.userSelect = '';
    }
  }, []);

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (dragState.current.hasDragged) {
      e.stopPropagation();
      e.preventDefault();
      dragState.current.hasDragged = false;
    }
  }, []);

  return (
    <motion.div
      animate={{ opacity: 1, transition: { duration: 0.25 } }}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md"
      exit={{ opacity: 0, transition: { duration: 0.35, delay: count * 0.03 } }}
      initial={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.button
        animate={{ opacity: 1, x: 0 }}
        className="absolute top-8 left-8 z-50 rounded-full bg-white/10 p-3 text-white backdrop-blur-md transition-colors hover:bg-white/20"
        exit={{ opacity: 0, x: -20 }}
        initial={{ opacity: 0, x: -20 }}
        onClick={onClose}
        transition={{ type: 'spring', damping: 20, stiffness: 300, delay: 0.1 }}
        whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.25)' }}
        whileTap={{ scale: 0.9 }}
      >
        <ArrowLeft size={24} />
      </motion.button>

      <motion.h2
        animate={{ opacity: 1, y: 0 }}
        className="pointer-events-none absolute inset-x-0 top-10 z-50 text-center font-medium text-lg text-white/80"
        exit={{ opacity: 0, y: -10 }}
        initial={{ opacity: 0, y: -10 }}
        transition={{ delay: 0.15 }}
      >
        {folder.data.subtitle || folder.data.title}
      </motion.h2>

      <div
        className="folder-scroll-container absolute inset-0 flex cursor-grab items-center overflow-x-auto overflow-y-hidden"
        onClick={(e) => {
          e.stopPropagation();
        }}
        onClickCapture={handleClickCapture}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        ref={scrollRef}
      >
        <div
          className="flex items-center"
          style={{
            gap,
            paddingLeft: sidePadding,
            paddingRight: sidePadding,
            perspective: 1200,
          }}
        >
          {children.map((child: any, index: number) => (
            <motion.div
              animate={{
                opacity: 1,
                scale: 1,
                rotate: 0,
                x: 0,
                y: 0,
              }}
              className="shrink-0 cursor-pointer overflow-hidden rounded-3xl shadow-2xl"
              exit={() => {
                const finalCardX =
                  sidePadding + index * (cardWidth + gap) + cardWidth / 2;
                return {
                  opacity: 0,
                  scale: 0.3,
                  rotate: 0,
                  x: folderCenterX - finalCardX,
                  y: folderCenterY - cardsCenterY,
                  transition: {
                    type: 'spring',
                    damping: 30,
                    stiffness: 350,
                    delay: (count - 1 - index) * 0.03,
                  },
                };
              }}
              initial={() => {
                const radial = getRadialOffset(index);
                const finalCardX =
                  sidePadding + index * (cardWidth + gap) + cardWidth / 2;
                return {
                  opacity: 0,
                  scale: 0.15,
                  rotate: radial.rotate,
                  x: folderCenterX - finalCardX + radial.x,
                  y: folderCenterY - cardsCenterY + radial.y,
                };
              }}
              key={child.id}
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                if (onCardClick) {
                  onCardClick(child, rect);
                }
              }}
              style={{ width: cardWidth, height: cardHeight }}
              transition={{
                type: 'spring',
                damping: 24,
                stiffness: 200,
                delay: index * 0.05,
              }}
              whileHover={{ y: -8, boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}
              whileTap={{ scale: 0.97 }}
            >
              <FolderChildContent child={child} />
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};
