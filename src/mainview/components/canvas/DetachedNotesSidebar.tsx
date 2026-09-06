import type { Node } from '@xyflow/react';
import {
  FileText,
  ImageIcon,
  Link2,
  ListChecks,
  MapPin,
  Paperclip,
  X,
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import * as motion from 'motion/react-m';
import { useCallback, useMemo, useState } from 'react';

import { FolderChildPreview } from '@/components/canvas/FolderChildPreview';
import { NotePreview } from '@/components/preview/NotePreview';
import { ExtensionNodeReadOnly } from '@/extensions/ExtensionNode';
import { formatRelativeTime } from '@/lib/formatRelative';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import {
  type ExtensionInstanceLoadError,
  type ExtensionInstanceRecord,
  isExtensionInstanceLoadError,
} from '../../../shared/extensions/instance';
import type { ExtensionPresentation } from '../../../shared/extensions/presentation';
import type { ExtensionNodeData } from '../../../shared/extensions/protocol';

interface DetachedEntry {
  color?: string;
  data?: Record<string, unknown>;
  fileName?: string;
  id: string;
  imageUrl?: string;
  mimeType?: string;
  nodeId: string;
  preview: string;
  thumbnailUrl?: string;
  title: string;
  type?: string;
  updatedAt?: number;
  url?: string;
}

const SIDEBAR_WIDTH = 300;

function getString(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  return typeof v === 'string' ? v : '';
}

function readNumber(data: Record<string, unknown>, key: string): number {
  const v = data[key];
  return typeof v === 'number' ? v : 0;
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

const DETACHED_SIDEBAR_TYPES = new Set([
  'card',
  'image',
  'link',
  'asset',
  'extension',
]);

function isDetachedSidebarNode(node: Node): boolean {
  if (!DETACHED_SIDEBAR_TYPES.has(node.type ?? '')) {
    return false;
  }
  return Boolean((node.data as Record<string, unknown> | undefined)?.detached);
}

function presentationFor(
  data: Record<string, unknown>,
  instances: Record<
    string,
    ExtensionInstanceRecord | ExtensionInstanceLoadError
  >
): ExtensionPresentation | undefined {
  const instanceId = typeof data.instanceId === 'string' ? data.instanceId : '';
  const record = instanceId ? instances[instanceId] : undefined;
  if (!record || isExtensionInstanceLoadError(record)) {
    return;
  }
  return record.presentation;
}

function typeIconFor(type: string | undefined, data: Record<string, unknown>) {
  if (type === 'image') {
    return ImageIcon;
  }
  if (type === 'asset') {
    return Paperclip;
  }
  if (type === 'link') {
    return Link2;
  }
  if (type === 'card' && data.type === 'checklist') {
    return ListChecks;
  }
  return FileText;
}

const THUMBNAIL_WIDTH = 56;
const THUMBNAIL_HEIGHT = 42;
const NATURAL_WIDTH = 208;
const NATURAL_HEIGHT = 156;
const SCALE = THUMBNAIL_WIDTH / NATURAL_WIDTH;

// Component split is a broad UI refactor; keep current interaction grouping intact.
// react-doctor-disable-next-line react-doctor/no-giant-component
export function DetachedNotesSidebar({ onClose }: { onClose: () => void }) {
  const nodes = useCanvasStore((s) => s.nodes);
  const pinNoteToCanvas = useCanvasStore((s) => s.pinNoteToCanvas);
  const instances = useExtensionInstanceStore((s) => s.records);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const entries: DetachedEntry[] = useMemo(() => {
    const out: DetachedEntry[] = [];
    for (const n of nodes) {
      if (!isDetachedSidebarNode(n)) {
        continue;
      }
      const data = n.data as Record<string, unknown>;
      const presentation =
        n.type === 'extension' ? presentationFor(data, instances) : undefined;
      const preview =
        n.type === 'extension'
          ? (presentation?.subtitle || presentation?.plainText || '').trim()
          : makePreview(data, n.type);
      out.push({
        color: getString(data, 'color'),
        data,
        fileName: getString(data, 'fileName'),
        id: `node:${n.id}`,
        imageUrl: getString(data, 'imageUrl'),
        mimeType: getString(data, 'mimeType'),
        nodeId: n.id,
        preview,
        thumbnailUrl: getString(data, 'thumbnailUrl'),
        title: presentation?.title || getString(data, 'title') || 'Untitled',
        type: n.type,
        updatedAt: readNumber(data, 'updatedAt'),
        url: getString(data, 'url'),
      });
    }
    return out;
  }, [instances, nodes]);

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
  const selectedPresentation =
    selectedData && selectedNode?.type === 'extension'
      ? presentationFor(selectedData, instances)
      : undefined;
  const selectedTitle =
    selectedPresentation?.title ||
    (selectedData ? getString(selectedData, 'title') || 'Untitled' : '');
  const selectedImageUrl = selectedData
    ? getString(selectedData, 'imageUrl')
    : '';
  const isExtensionSelection = selectedNode?.type === 'extension';
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
            className="absolute inset-y-0 left-0 z-50 flex flex-col bg-white/95 backdrop-blur-sm dark:bg-neutral-900/95"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            style={{ right: SIDEBAR_WIDTH }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <header className="electrobun-webkit-app-region-drag flex h-10 shrink-0 items-center justify-between gap-3 border-black/5 border-b px-6 dark:border-white/5">
              <h2 className="truncate font-semibold text-gray-800 text-sm dark:text-gray-100">
                {selectedTitle}
              </h2>
              <button
                aria-label="Close preview"
                className="electrobun-webkit-app-region-no-drag flex size-6 shrink-0 items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10"
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
                {isExtensionSelection && selectedData ? (
                  <div className="overflow-hidden rounded-xl border border-black/5 dark:border-white/10">
                    <ExtensionNodeReadOnly
                      data={selectedData as ExtensionNodeData}
                    />
                  </div>
                ) : isImageSelection && selectedImageUrl ? (
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
        className="absolute inset-y-0 right-0 z-50 flex w-[300px] flex-col border-black/5 border-l bg-white/95 shadow-xl backdrop-blur-sm dark:border-white/5 dark:bg-neutral-900/95"
        exit={{ x: 300, opacity: 0 }}
        initial={{ x: 300, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
      >
        {/* h-10 matches the app titlebar so the title sits in the window chrome row */}
        <header className="electrobun-webkit-app-region-drag flex h-10 shrink-0 items-center justify-between border-black/5 border-b px-4 dark:border-white/5">
          <h2 className="font-semibold text-[13px] text-gray-800 dark:text-gray-100">
            Note Library
          </h2>
          <button
            aria-label="Close sidebar"
            className="electrobun-webkit-app-region-no-drag flex size-6 items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10"
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
                const Icon = typeIconFor(entry.type, entry.data ?? {});
                const relative = entry.updatedAt
                  ? formatRelativeTime(entry.updatedAt)
                  : '';
                return (
                  <li
                    aria-current={isSelected ? 'true' : undefined}
                    className={cn(
                      'group px-3 py-2.5 text-sm transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.03]',
                      idx > 0 && 'border-black/5 border-t dark:border-white/5',
                      isSelected && 'bg-accent-softer hover:bg-accent-soft'
                    )}
                    draggable
                    key={entry.id}
                    onDragStart={(e) => {
                      handleDragStart(e, entry);
                    }}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Thumbnail preview */}
                      <div className="relative shrink-0 overflow-hidden rounded-md border border-black/5 dark:border-white/10">
                        <div
                          className="flex items-center justify-center bg-gray-50 dark:bg-neutral-800"
                          style={{
                            height: THUMBNAIL_HEIGHT,
                            width: THUMBNAIL_WIDTH,
                          }}
                        >
                          {entry.type === 'image' &&
                          (entry.thumbnailUrl || entry.imageUrl) ? (
                            <img
                              alt=""
                              className="size-full object-cover"
                              src={entry.thumbnailUrl || entry.imageUrl}
                            />
                          ) : (
                            <div
                              className="flex size-full origin-top-left items-center justify-center overflow-hidden"
                              style={{
                                height: NATURAL_HEIGHT,
                                transform: `scale(${SCALE})`,
                                transformOrigin: 'top left',
                                width: NATURAL_WIDTH,
                              }}
                            >
                              <FolderChildPreview
                                child={{
                                  data: entry.data ?? {},
                                  id: entry.nodeId,
                                  type: entry.type ?? 'card',
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Content area */}
                      <button
                        className="min-w-0 flex-1 cursor-pointer text-left outline-hidden"
                        onClick={() => {
                          toggleSelectedNode(entry.nodeId);
                        }}
                        type="button"
                      >
                        <h3 className="truncate font-medium text-[13px] text-gray-800 leading-snug dark:text-gray-100">
                          {entry.title}
                        </h3>
                        {entry.preview ? (
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500 leading-[1.3] dark:text-gray-400">
                            {entry.preview}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[11px] text-gray-400 italic leading-[1.3] dark:text-gray-600">
                            {entry.type === 'asset'
                              ? 'No file metadata'
                              : 'Empty note'}
                          </p>
                        )}
                        <div className="mt-1 flex items-center gap-1.5 text-2xs text-gray-400 dark:text-neutral-500">
                          <Icon aria-hidden size={10} strokeWidth={1.75} />
                          {relative ? (
                            <span className="truncate">{relative}</span>
                          ) : null}
                        </div>
                      </button>

                      {/* Pin button */}
                      <button
                        aria-label="Pin to canvas"
                        className="mt-0.5 flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-2xs text-accent-strong opacity-0 transition-opacity hover:bg-accent-softer group-hover:opacity-100"
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
