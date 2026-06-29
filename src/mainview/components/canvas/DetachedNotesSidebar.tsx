import { FileText, MapPin, X } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import * as motion from 'motion/react-m';
import { useCallback, useMemo, useState } from 'react';

import { NotePreview } from '@/components/preview/NotePreview';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

interface DetachedEntry {
  id: string;
  nodeId: string;
  preview: string;
  title: string;
  type?: string;
}

const SIDEBAR_WIDTH = 300;

function getString(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  return typeof v === 'string' ? v : '';
}

function makePreview(
  data: Record<string, unknown>,
  type: string | undefined
): string {
  const excerpt = getString(data, 'previewExcerpt');
  if (excerpt.trim().length > 0) {
    return excerpt.trim();
  }
  if (type === 'link') {
    return getString(data, 'url');
  }
  if (type === 'asset') {
    return getString(data, 'mimeType') || getString(data, 'fileName');
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

// Component split is a broad UI refactor; keep current interaction grouping intact.
// react-doctor-disable-next-line react-doctor/no-giant-component
export function DetachedNotesSidebar({ onClose }: { onClose: () => void }) {
  const nodes = useCanvasStore((s) => s.nodes);
  const pinNoteToCanvas = useCanvasStore((s) => s.pinNoteToCanvas);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const entries: DetachedEntry[] = useMemo(() => {
    const out: DetachedEntry[] = [];
    for (const n of nodes) {
      if (
        (n.type === 'card' ||
          n.type === 'image' ||
          n.type === 'link' ||
          n.type === 'asset') &&
        (n.data as Record<string, unknown>).detached
      ) {
        const data = n.data as Record<string, unknown>;
        out.push({
          id: `node:${n.id}`,
          nodeId: n.id,
          title: getString(data, 'title') || 'Untitled',
          preview: makePreview(data, n.type),
          type: n.type,
        });
      }
    }
    return out;
  }, [nodes]);

  const validSelectedNodeId =
    selectedNodeId && entries.some((entry) => entry.nodeId === selectedNodeId)
      ? selectedNodeId
      : null;
  if (selectedNodeId !== validSelectedNodeId) {
    setSelectedNodeId(validSelectedNodeId);
  }

  const selectedNode = nodes.find((n) => n.id === validSelectedNodeId) ?? null;

  const selectedData =
    selectedNode && (selectedNode.data as Record<string, unknown>);
  const selectedTitle = selectedData
    ? getString(selectedData, 'title') || 'Untitled'
    : '';
  const selectedImageUrl = selectedData
    ? getString(selectedData, 'imageUrl')
    : '';
  const isImageSelection = selectedNode?.type === 'image';
  const isLinkSelection = selectedNode?.type === 'link';
  const isAssetSelection = selectedNode?.type === 'asset';
  const toggleSelectedNode = useCallback((nodeId: string) => {
    setSelectedNodeId((current) => (current === nodeId ? null : nodeId));
  }, []);

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
    <>
      <AnimatePresence>
        {selectedNode ? (
          <motion.section
            animate={{ opacity: 1 }}
            aria-label="Note preview"
            className="absolute bottom-0 left-0 z-30 flex flex-col bg-white/95 backdrop-blur-sm dark:bg-neutral-900/95"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            style={{
              top: 'var(--app-titlebar-height, 2.5rem)',
              right: SIDEBAR_WIDTH,
            }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <header className="flex items-center justify-between gap-3 border-black/5 border-b px-6 py-3 dark:border-white/5">
              <h2 className="truncate font-semibold text-gray-800 text-sm dark:text-gray-100">
                {selectedTitle}
              </h2>
              <button
                aria-label="Close preview"
                className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => {
                  setSelectedNodeId(null);
                }}
                type="button"
              >
                <X size={14} />
              </button>
            </header>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto max-w-3xl px-8 py-8">
                {isImageSelection && selectedImageUrl ? (
                  <img
                    alt={selectedTitle}
                    className="mx-auto h-auto max-w-full rounded-lg"
                    src={selectedImageUrl}
                  />
                ) : isLinkSelection ? (
                  <div className="space-y-4 rounded-xl border border-black/5 bg-white p-5 text-sm shadow-sm dark:border-white/10 dark:bg-white/5">
                    <div>
                      <p className="font-medium text-gray-500 text-xs uppercase tracking-normal dark:text-gray-400">
                        URL
                      </p>
                      <p className="mt-1 break-all text-gray-800 dark:text-gray-100">
                        {selectedData ? getString(selectedData, 'url') : ''}
                      </p>
                    </div>
                    {selectedData && getString(selectedData, 'description') ? (
                      <p className="text-gray-600 leading-relaxed dark:text-gray-300">
                        {getString(selectedData, 'description')}
                      </p>
                    ) : null}
                  </div>
                ) : isAssetSelection ? (
                  <div className="space-y-4 rounded-xl border border-black/5 bg-white p-5 text-sm shadow-sm dark:border-white/10 dark:bg-white/5">
                    <div>
                      <p className="font-medium text-gray-500 text-xs uppercase tracking-normal dark:text-gray-400">
                        Type
                      </p>
                      <p className="mt-1 break-all text-gray-800 dark:text-gray-100">
                        {selectedData
                          ? getString(selectedData, 'mimeType') ||
                            'application/octet-stream'
                          : ''}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-500 text-xs uppercase tracking-normal dark:text-gray-400">
                        File
                      </p>
                      <p className="mt-1 break-all font-mono text-gray-700 dark:text-gray-200">
                        {selectedData
                          ? getString(selectedData, 'attachmentFile') ||
                            getString(selectedData, 'fileName') ||
                            'Unsaved attachment'
                          : ''}
                      </p>
                    </div>
                  </div>
                ) : (
                  <NotePreview
                    excerpt={selectedData?.previewExcerpt}
                    fallback={selectedData?.content}
                    html={selectedData?.previewHtml}
                  />
                )}
              </div>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

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
              {entries.map((entry, idx) => {
                const isSelected = entry.nodeId === selectedNodeId;
                return (
                  <li
                    aria-current={isSelected ? 'true' : undefined}
                    className={cn(
                      'group px-4 py-3 text-sm transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.03]',
                      idx > 0 && 'border-black/5 border-t dark:border-white/5',
                      isSelected &&
                        'bg-blue-50/80 hover:bg-blue-50 dark:bg-blue-500/10 dark:hover:bg-blue-500/15'
                    )}
                    draggable
                    key={entry.id}
                    onDragStart={(e) => {
                      handleDragStart(e, entry);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        className="min-w-0 flex-1 cursor-pointer text-left outline-hidden"
                        onClick={() => {
                          toggleSelectedNode(entry.nodeId);
                        }}
                        type="button"
                      >
                        <h3 className="truncate font-medium text-gray-800 dark:text-gray-100">
                          {entry.title}
                        </h3>
                        {entry.preview ? (
                          <p className="mt-1 line-clamp-2 text-[12px] text-gray-500 dark:text-gray-400">
                            {entry.preview}
                          </p>
                        ) : (
                          <p className="mt-1 text-[12px] text-gray-400 italic dark:text-gray-600">
                            {entry.type === 'asset'
                              ? 'No file metadata'
                              : 'Empty note'}
                          </p>
                        )}
                      </button>
                      <button
                        aria-label="Pin to canvas"
                        className="mt-0.5 flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-blue-600 opacity-0 transition-opacity hover:bg-blue-50 hover:text-blue-700 group-hover:opacity-100 dark:text-blue-400 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
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
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </motion.aside>
    </>
  );
}
