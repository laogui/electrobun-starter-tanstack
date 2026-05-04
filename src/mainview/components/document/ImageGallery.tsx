import { ImageOff, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';

interface GalleryImage {
  /** Stable id used as React key. */
  id: string;
  imageUrl: string;
  title: string;
}

function getString(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  return typeof v === 'string' ? v : '';
}

function collectImages(
  nodes: ReturnType<typeof useCanvasStore.getState>['nodes']
): GalleryImage[] {
  const out: GalleryImage[] = [];
  for (const node of nodes) {
    if (node.type === 'image') {
      const data = node.data as Record<string, unknown>;
      const url = getString(data, 'imageUrl');
      if (url) {
        out.push({
          id: `node:${node.id}`,
          imageUrl: url,
          title: getString(data, 'title') || m.document_image_label(),
        });
      }
    } else if (node.type === 'folder') {
      const children = ((node.data as { children?: unknown }).children ??
        []) as Array<{
        data: Record<string, unknown>;
        id: string;
        type?: string;
      }>;
      for (const child of children) {
        if (child.type !== 'image') {
          continue;
        }
        const url = getString(child.data, 'imageUrl');
        if (url) {
          out.push({
            id: `child:${node.id}:${child.id}`,
            imageUrl: url,
            title: getString(child.data, 'title') || m.document_image_label(),
          });
        }
      }
    }
  }
  return out;
}

function Lightbox({
  image,
  onClose,
}: {
  image: GalleryImage;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      transition={{ duration: 0.18 }}
    >
      <button
        aria-label={m.document_image_gallery_close()}
        className="absolute top-4 right-4 z-10 flex size-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
        onClick={onClose}
        type="button"
      >
        <X size={18} />
      </button>
      <motion.img
        alt={image.title}
        animate={{ scale: 1, opacity: 1 }}
        className="max-h-full max-w-full select-none rounded-md object-contain shadow-2xl"
        exit={{ scale: 0.96, opacity: 0 }}
        initial={{ scale: 0.96, opacity: 0 }}
        onClick={(e) => {
          e.stopPropagation();
        }}
        src={image.imageUrl}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      />
      {image.title ? (
        <div
          className="absolute bottom-6 left-1/2 max-w-[80%] -translate-x-1/2 truncate rounded-full bg-black/50 px-4 py-1.5 text-sm text-white backdrop-blur"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {image.title}
        </div>
      ) : null}
    </motion.div>
  );
}

export function ImageGallery() {
  const nodes = useCanvasStore((s) => s.nodes);
  const images = useMemo(() => collectImages(nodes), [nodes]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeImage = useMemo(
    () => images.find((img) => img.id === activeId) ?? null,
    [activeId, images]
  );

  const handleClose = useCallback(() => {
    setActiveId(null);
  }, []);

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#F7F7F5] dark:bg-[#141414]">
      <header className="flex h-11 shrink-0 items-center justify-between border-black/5 border-b bg-white px-4 dark:border-white/5 dark:bg-neutral-900">
        <h2 className="truncate font-medium text-[13px] text-gray-800 dark:text-gray-200">
          {m.document_type_images()}
        </h2>
        <span className="text-[12px] text-gray-400 tabular-nums dark:text-gray-500">
          {images.length}
        </span>
      </header>
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
        {images.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500">
            <ImageOff size={32} strokeWidth={1.4} />
            <p className="text-sm">{m.document_image_gallery_empty()}</p>
          </div>
        ) : (
          <div className="columns-2 gap-3 md:columns-3 lg:columns-4 xl:columns-5">
            {images.map((img) => (
              <button
                className="group/img mb-3 block w-full overflow-hidden rounded-lg border border-black/5 bg-white shadow-sm transition-all hover:scale-[1.01] hover:shadow-md dark:border-white/5 dark:bg-neutral-900"
                key={img.id}
                onClick={() => {
                  setActiveId(img.id);
                }}
                type="button"
              >
                <img
                  alt={img.title}
                  className="block w-full select-none object-cover transition-transform duration-200 group-hover/img:scale-[1.02]"
                  loading="lazy"
                  src={img.imageUrl}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {activeImage ? (
          <Lightbox image={activeImage} onClose={handleClose} />
        ) : null}
      </AnimatePresence>
    </section>
  );
}

export default ImageGallery;
