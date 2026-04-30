import type { Node } from '@xyflow/react';
import { ArrowDownUp, FileText, Plus, Search } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

interface NoteEntry {
  createdAt?: string;
  /** Composite selection token; matches `selectedDocumentId`. */
  id: string;
  preview: string;
  title: string;
  /** ISO-ish display string; falls back to em dash. */
  updatedAt?: string;
}

function getString(data: Record<string, unknown>, key: string): string {
  const v = (data as Record<string, unknown>)[key];
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
    .slice(0, 220)
    .trim();
}

function formatDateShort(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return;
  }
  const now = Date.now();
  const diff = now - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < 2 * day) {
    return 'Today';
  }
  if (diff < 7 * day) {
    return `${Math.floor(diff / day)}d ago`;
  }
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function nodeToEntry(node: Node, idOverride?: string): NoteEntry | null {
  if (node.type !== 'card' && node.type !== 'image') {
    return null;
  }
  const data = node.data as Record<string, unknown>;
  return {
    id: idOverride ?? `node:${node.id}`,
    title:
      getString(data, 'title') ||
      (node.type === 'image' ? 'Image' : 'Untitled'),
    preview: makePreview(data),
    updatedAt: formatDateShort((data as { updatedAt?: unknown }).updatedAt),
    createdAt: formatDateShort((data as { createdAt?: unknown }).createdAt),
  };
}

function childToEntry(
  folderId: string,
  child: { data: Record<string, unknown>; id: string; type?: string }
): NoteEntry {
  return {
    id: `child:${folderId}:${child.id}`,
    title:
      getString(child.data, 'title') ||
      (child.type === 'image' ? 'Image' : 'Untitled'),
    preview: makePreview(child.data),
    updatedAt: formatDateShort(
      (child.data as { updatedAt?: unknown }).updatedAt
    ),
    createdAt: formatDateShort(
      (child.data as { createdAt?: unknown }).createdAt
    ),
  };
}

function getSectionTitle(section: string, folderTitle?: string): string {
  if (section === 'inbox') {
    return 'Inbox';
  }
  if (section === 'all') {
    return 'All Notes';
  }
  if (section === 'archive') {
    return 'Archive';
  }
  if (section.startsWith('folder:')) {
    return folderTitle ?? 'Folder';
  }
  return 'Documents';
}

export function NoteList() {
  const nodes = useCanvasStore((s) => s.nodes);
  const documentSection = useCanvasStore((s) => s.documentSection);
  const selectedDocumentId = useCanvasStore((s) => s.selectedDocumentId);
  const setSelectedDocumentId = useCanvasStore((s) => s.setSelectedDocumentId);
  const createNode = useCanvasStore((s) => s.createNode);
  const addFolderChild = useCanvasStore((s) => s.addFolderChild);

  const folderId = documentSection.startsWith('folder:')
    ? documentSection.slice(7)
    : null;

  const folderNode = useMemo(
    () => (folderId ? nodes.find((n) => n.id === folderId) : null),
    [folderId, nodes]
  );

  const entries: NoteEntry[] = useMemo(() => {
    if (documentSection === 'archive') {
      return [];
    }
    if (folderId && folderNode) {
      const children = ((folderNode.data as any)?.children ?? []) as Array<{
        data: Record<string, unknown>;
        id: string;
        type?: string;
      }>;
      return children.map((c) => childToEntry(folderId, c));
    }
    if (documentSection === 'inbox') {
      const out: NoteEntry[] = [];
      for (const n of nodes) {
        const e = nodeToEntry(n);
        if (e) {
          out.push(e);
        }
      }
      return out;
    }
    // All
    const out: NoteEntry[] = [];
    for (const n of nodes) {
      const e = nodeToEntry(n);
      if (e) {
        out.push(e);
      }
      if (n.type === 'folder') {
        const children = ((n.data as any)?.children ?? []) as Array<{
          data: Record<string, unknown>;
          id: string;
          type?: string;
        }>;
        for (const c of children) {
          out.push(childToEntry(n.id, c));
        }
      }
    }
    return out;
  }, [documentSection, folderId, folderNode, nodes]);

  const sectionTitle = getSectionTitle(
    documentSection,
    folderNode
      ? getString(folderNode.data as Record<string, unknown>, 'title') ||
          'Folder'
      : undefined
  );

  const handleCreate = useCallback(() => {
    if (folderId) {
      addFolderChild(folderId);
      return;
    }
    createNode('card', null);
  }, [addFolderChild, createNode, folderId]);

  return (
    <section className="flex h-full min-h-0 flex-col border-black/5 border-r bg-white dark:border-white/5 dark:bg-neutral-900">
      <header className="flex h-11 shrink-0 items-center justify-between border-black/5 border-b px-3 dark:border-white/5">
        <h2 className="truncate font-medium text-[13px] text-gray-800 dark:text-gray-200">
          {sectionTitle}
        </h2>
        <div className="flex items-center gap-0.5 text-gray-400">
          <button
            aria-label="Sort"
            className="flex size-6 items-center justify-center rounded hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
            type="button"
          >
            <ArrowDownUp size={13} />
          </button>
          <button
            aria-label="Search"
            className="flex size-6 items-center justify-center rounded hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
            type="button"
          >
            <Search size={13} />
          </button>
          <button
            aria-label="New"
            className="flex size-6 items-center justify-center rounded hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
            onClick={handleCreate}
            type="button"
          >
            <Plus size={14} />
          </button>
        </div>
      </header>
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-gray-400 dark:text-gray-500">
            <FileText size={28} strokeWidth={1.4} />
            <p className="text-xs">No notes here yet.</p>
            <button
              className="rounded-md bg-black/5 px-2.5 py-1 text-xs hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
              onClick={handleCreate}
              type="button"
            >
              Create note
            </button>
          </div>
        ) : (
          <ul className="flex flex-col">
            {entries.map((entry, idx) => {
              const active = entry.id === selectedDocumentId;
              return (
                <li
                  className={cn(
                    'cursor-pointer px-4 py-3 text-sm transition-colors',
                    active
                      ? 'bg-blue-50/70 dark:bg-blue-500/10'
                      : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.03]',
                    idx > 0 && 'border-black/5 border-t dark:border-white/5'
                  )}
                  key={entry.id}
                  onClick={() => {
                    setSelectedDocumentId(entry.id);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3
                      className={cn(
                        'truncate font-medium',
                        active
                          ? 'text-gray-900 dark:text-white'
                          : 'text-gray-800 dark:text-gray-100'
                      )}
                    >
                      {entry.title}
                    </h3>
                    <FileText
                      className="mt-0.5 shrink-0 text-gray-300 dark:text-gray-600"
                      size={12}
                    />
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
                  <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500">
                    <span>{entry.updatedAt ?? '—'}</span>
                    <span>
                      {entry.createdAt ? `Created ${entry.createdAt}` : ''}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

export default NoteList;
