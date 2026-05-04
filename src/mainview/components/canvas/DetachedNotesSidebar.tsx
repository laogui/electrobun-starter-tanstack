import { FileText, MapPin, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useMemo } from 'react';

import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

interface DetachedEntry {
  id: string;
  nodeId: string;
  preview: string;
  title: string;
}

function getString(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  return typeof v === 'string' ? v : '';
}

function makePreview(data: Record<string, unknown>): string {
  const excerpt = getString(data, 'previewExcerpt');
  if (excerpt.trim().length > 0) {
    return excerpt.trim();
  }
  const content = getString(data, 'content');
  if (content.trim().length === 0) {
    return '';
  }
  return content
    .replace(/^#+\s+/gm, '')
    .replace(/[*_`>~-]+/g, '')
    .replace(/\n+/g, ' ')
    .slice(0, 160)
    .trim();
}

export function DetachedNotesSidebar({ onClose }: { onClose: () => void }) {
  const nodes = useCanvasStore((s) => s.nodes);
  const pinNoteToCanvas = useCanvasStore((s) => s.pinNoteToCanvas);
  const setLayoutMode = useCanvasStore((s) => s.setLayoutMode);
  const setSelectedDocumentId = useCanvasStore((s) => s.setSelectedDocumentId);

  const entries: DetachedEntry[] = useMemo(() => {
    const out: DetachedEntry[] = [];
    for (const n of nodes) {
      if (
        (n.type === 'card' || n.type === 'image') &&
        (n.data as Record<string, unknown>).detached
      ) {
        const data = n.data as Record<string, unknown>;
        out.push({
          id: `node:${n.id}`,
          nodeId: n.id,
          title: getString(data, 'title') || 'Untitled',
          preview: makePreview(data),
        });
      }
    }
    return out;
  }, [nodes]);

  const handlePin = useCallback(
    (nodeId: string) => {
      const center = {
        x: window.innerWidth / 2 - 175,
        y: window.innerHeight / 2 - 225,
      };
      pinNoteToCanvas(nodeId, center);
    },
    [pinNoteToCanvas]
  );

  const handleOpenInDocMode = useCallback(
    (entry: DetachedEntry) => {
      setSelectedDocumentId(entry.id);
      setLayoutMode('document');
    },
    [setSelectedDocumentId, setLayoutMode]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, entry: DetachedEntry) => {
      e.dataTransfer.setData(
        'application/ghostboard-detached-note',
        entry.nodeId
      );
      e.dataTransfer.effectAllowed = 'move';

      // Create a card-shaped drag ghost
      const ghost = document.createElement('div');
      ghost.style.width = '260px';
      ghost.style.padding = '16px';
      ghost.style.background = 'white';
      ghost.style.borderRadius = '12px';
      ghost.style.boxShadow = '0 8px 30px rgba(0,0,0,0.15)';
      ghost.style.fontFamily = 'system-ui, sans-serif';
      ghost.style.position = 'absolute';
      ghost.style.top = '-1000px';
      ghost.style.left = '-1000px';

      const title = document.createElement('div');
      title.textContent = entry.title;
      title.style.fontWeight = '600';
      title.style.fontSize = '14px';
      title.style.color = '#1a1a1a';
      title.style.marginBottom = entry.preview ? '6px' : '0';
      ghost.appendChild(title);

      if (entry.preview) {
        const preview = document.createElement('div');
        preview.textContent =
          entry.preview.slice(0, 80) + (entry.preview.length > 80 ? '…' : '');
        preview.style.fontSize = '12px';
        preview.style.color = '#888';
        preview.style.lineHeight = '1.4';
        ghost.appendChild(preview);
      }

      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 130, 30);

      // Clean up after the browser has captured the ghost
      requestAnimationFrame(() => {
        document.body.removeChild(ghost);
      });
    },
    []
  );

  return (
    <motion.aside
      animate={{ x: 0, opacity: 1 }}
      className="absolute right-0 bottom-0 z-40 flex w-[300px] flex-col border-black/5 border-l bg-white/95 shadow-xl backdrop-blur-sm dark:border-white/5 dark:bg-neutral-900/95"
      exit={{ x: 300, opacity: 0 }}
      initial={{ x: 300, opacity: 0 }}
      style={{ top: 'var(--app-titlebar-height, 2.5rem)' }}
      transition={{ type: 'spring', damping: 28, stiffness: 350 }}
    >
      <header className="flex items-center justify-between border-black/5 border-b px-4 py-3 dark:border-white/5">
        <h2 className="font-semibold text-[13px] text-gray-800 dark:text-gray-100">
          Note Library
        </h2>
        <button
          aria-label="Close sidebar"
          className="flex size-6 items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10"
          onClick={onClose}
          type="button"
        >
          <X size={14} />
        </button>
      </header>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center text-gray-400 dark:text-gray-500">
            <FileText size={32} strokeWidth={1.2} />
            <p className="text-xs">All notes are on the canvas.</p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {entries.map((entry, idx) => (
              <li
                className={cn(
                  'group cursor-grab px-4 py-3 text-sm transition-colors hover:bg-black/[0.03] active:cursor-grabbing dark:hover:bg-white/[0.03]',
                  idx > 0 && 'border-black/5 border-t dark:border-white/5'
                )}
                draggable
                key={entry.id}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) {
                    handleOpenInDocMode(entry);
                  }
                }}
                onDragStart={(e) => {
                  handleDragStart(e, entry);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate font-medium text-gray-800 dark:text-gray-100">
                    {entry.title}
                  </h3>
                  <button
                    aria-label="Pin to canvas"
                    className="mt-0.5 flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-gray-400 opacity-0 transition-opacity hover:bg-blue-50 hover:text-blue-600 group-hover:opacity-100 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePin(entry.nodeId);
                    }}
                    type="button"
                  >
                    <MapPin size={11} />
                    Pin
                  </button>
                </div>
                {entry.preview ? (
                  <p className="mt-1 line-clamp-2 text-[12px] text-gray-500 dark:text-gray-400">
                    {entry.preview}
                  </p>
                ) : (
                  <p className="mt-1 text-[12px] text-gray-400 italic dark:text-gray-600">
                    Empty note
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.aside>
  );
}
