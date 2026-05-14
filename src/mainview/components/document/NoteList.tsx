import type { Node } from '@xyflow/react';
import {
  ArrowDownUp,
  FileText,
  Link2,
  type LucideIcon,
  Paperclip,
  Plus,
  Search,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import {
  type AssetNodeData,
  getAssetDisplayTitle,
  getLinkDisplayTitle,
  getLinkHost,
  type LinkNodeData,
} from '@/lib/contentTypes';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';

type NoteEntryKind = 'note' | 'image' | 'asset' | 'link';

interface NoteEntry {
  createdAt?: string;
  /** Composite selection token; matches `selectedDocumentId`. */
  id: string;
  /** Discriminator used for icons / filtering by type:* sections. */
  kind: NoteEntryKind;
  preview: string;
  title: string;
  /** ISO-ish display string; falls back to em dash. */
  updatedAt?: string;
  /** Raw epoch ms for sorting; 0 when missing/invalid. */
  updatedAtMs: number;
}

type SortOrder = 'desc' | 'asc';

const ENTRY_ICONS: Record<NoteEntryKind, LucideIcon> = {
  note: FileText,
  image: FileText,
  asset: Paperclip,
  link: Link2,
};

function readDateMs(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return 0;
  }
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
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

function entryKindForType(type: string | undefined): NoteEntryKind | null {
  switch (type) {
    case 'card':
      return 'note';
    case 'image':
      return 'image';
    case 'asset':
      return 'asset';
    case 'link':
      return 'link';
    default:
      return null;
  }
}

function entryTitleFor(
  kind: NoteEntryKind,
  data: Record<string, unknown>
): string {
  switch (kind) {
    case 'image':
      return getString(data, 'title') || m.document_image_label();
    case 'asset': {
      const view: Pick<AssetNodeData, 'title' | 'fileName' | 'mimeType'> = {
        title: getString(data, 'title'),
        fileName: getString(data, 'fileName'),
        mimeType: getString(data, 'mimeType'),
      };
      return getAssetDisplayTitle(view) || m.document_file_label();
    }
    case 'link': {
      const view: Pick<LinkNodeData, 'title' | 'url' | 'siteName'> = {
        title: getString(data, 'title'),
        url: getString(data, 'url'),
        siteName: getString(data, 'siteName'),
      };
      return getLinkDisplayTitle(view) || m.document_link_label();
    }
    default:
      return getString(data, 'title') || m.document_untitled();
  }
}

function entryPreviewFor(
  kind: NoteEntryKind,
  data: Record<string, unknown>
): string {
  if (kind === 'asset') {
    const fileName = getString(data, 'fileName');
    const mimeType = getString(data, 'mimeType');
    return [fileName, mimeType].filter(Boolean).join(' · ');
  }
  if (kind === 'link') {
    const description = getString(data, 'description');
    if (description.trim()) {
      return description.trim();
    }
    const url = getString(data, 'url');
    return getLinkHost(url) || url;
  }
  return makePreview(data);
}

function nodeToEntry(node: Node, idOverride?: string): NoteEntry | null {
  const kind = entryKindForType(node.type);
  if (!kind) {
    return null;
  }
  const data = node.data as Record<string, unknown>;
  return {
    id: idOverride ?? `node:${node.id}`,
    kind,
    title: entryTitleFor(kind, data),
    preview: entryPreviewFor(kind, data),
    updatedAt: formatDateShort((data as { updatedAt?: unknown }).updatedAt),
    createdAt: formatDateShort((data as { createdAt?: unknown }).createdAt),
    updatedAtMs: readDateMs((data as { updatedAt?: unknown }).updatedAt),
  };
}

function childToEntry(
  folderId: string,
  child: { data: Record<string, unknown>; id: string; type?: string }
): NoteEntry | null {
  const kind = entryKindForType(child.type);
  if (!kind) {
    return null;
  }
  return {
    id: `child:${folderId}:${child.id}`,
    kind,
    title: entryTitleFor(kind, child.data),
    preview: entryPreviewFor(kind, child.data),
    updatedAt: formatDateShort(
      (child.data as { updatedAt?: unknown }).updatedAt
    ),
    createdAt: formatDateShort(
      (child.data as { createdAt?: unknown }).createdAt
    ),
    updatedAtMs: readDateMs((child.data as { updatedAt?: unknown }).updatedAt),
  };
}

/**
 * Decision 19 (docs/todo/双布局-PRD-待决问题.md): document mode defaults to
 * "last edited" descending. Items lacking `updatedAt` sort last (treat as 0)
 * but keep insertion order between themselves to stay stable.
 */
function sortEntries(entries: NoteEntry[], order: SortOrder): NoteEntry[] {
  const sign = order === 'desc' ? -1 : 1;
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      if (a.entry.updatedAtMs !== b.entry.updatedAtMs) {
        return sign * (a.entry.updatedAtMs - b.entry.updatedAtMs);
      }
      return a.index - b.index;
    })
    .map(({ entry }) => entry);
}

function getSectionTitle(section: string, folderTitle?: string): string {
  if (section === 'inbox') {
    return m.document_inbox();
  }
  if (section === 'all') {
    return m.document_all_notes();
  }
  if (section === 'archive') {
    return m.document_archive();
  }
  if (section === 'type:asset') {
    return m.document_type_files();
  }
  if (section === 'type:link') {
    return m.document_type_links();
  }
  if (section.startsWith('folder:')) {
    return folderTitle ?? m.document_folder_section();
  }
  return m.document_section_documents();
}

export function NoteList() {
  const nodes = useCanvasStore((s) => s.nodes);
  const documentSection = useCanvasStore((s) => s.documentSection);
  const selectedDocumentId = useCanvasStore((s) => s.selectedDocumentId);
  const setSelectedDocumentId = useCanvasStore((s) => s.setSelectedDocumentId);
  const createDetachedNote = useCanvasStore((s) => s.createDetachedNote);
  const addFolderChild = useCanvasStore((s) => s.addFolderChild);
  const setSearchOpen = useCanvasStore((s) => s.setSearchOpen);

  const folderId = documentSection.startsWith('folder:')
    ? documentSection.slice(7)
    : null;

  const folderNode = useMemo(
    () => (folderId ? nodes.find((n) => n.id === folderId) : null),
    [folderId, nodes]
  );

  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  /** type:asset → 'asset', type:link → 'link'. Other type:* values keep this null so
   *  type:image keeps routing to ImageGallery (handled in DocumentView). */
  const typeFilter: NoteEntryKind | null = useMemo(() => {
    if (documentSection === 'type:asset') {
      return 'asset';
    }
    if (documentSection === 'type:link') {
      return 'link';
    }
    return null;
  }, [documentSection]);

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
      const childEntries: NoteEntry[] = [];
      for (const c of children) {
        const entry = childToEntry(folderId, c);
        if (entry) {
          childEntries.push(entry);
        }
      }
      return sortEntries(childEntries, sortOrder);
    }
    if (documentSection === 'inbox') {
      const out: NoteEntry[] = [];
      for (const n of nodes) {
        const e = nodeToEntry(n);
        if (e && (!typeFilter || e.kind === typeFilter)) {
          out.push(e);
        }
      }
      return sortEntries(out, sortOrder);
    }
    // All / type:asset / type:link
    const out: NoteEntry[] = [];
    for (const n of nodes) {
      const e = nodeToEntry(n);
      if (e && (!typeFilter || e.kind === typeFilter)) {
        out.push(e);
      }
      if (n.type === 'folder') {
        const children = ((n.data as any)?.children ?? []) as Array<{
          data: Record<string, unknown>;
          id: string;
          type?: string;
        }>;
        for (const c of children) {
          const childEntry = childToEntry(n.id, c);
          if (childEntry && (!typeFilter || childEntry.kind === typeFilter)) {
            out.push(childEntry);
          }
        }
      }
    }
    return sortEntries(out, sortOrder);
  }, [documentSection, folderId, folderNode, nodes, sortOrder, typeFilter]);

  const sectionTitle = getSectionTitle(
    documentSection,
    folderNode
      ? getString(folderNode.data as Record<string, unknown>, 'title') ||
          m.document_folder_section()
      : undefined
  );

  const handleCreate = useCallback(() => {
    if (folderId) {
      addFolderChild(folderId);
      return;
    }
    const id = createDetachedNote();
    setSelectedDocumentId(`node:${id}`);
  }, [addFolderChild, createDetachedNote, folderId, setSelectedDocumentId]);

  return (
    <section className="flex h-full min-h-0 flex-col border-black/5 border-r bg-white dark:border-white/5 dark:bg-neutral-900">
      <header className="flex h-11 shrink-0 items-center justify-between border-black/5 border-b px-3 dark:border-white/5">
        <h2 className="truncate font-medium text-[13px] text-gray-800 dark:text-gray-200">
          {sectionTitle}
        </h2>
        <div className="flex items-center gap-0.5 text-gray-400">
          <button
            aria-label={
              sortOrder === 'desc'
                ? m.document_aria_sort_newest()
                : m.document_aria_sort_oldest()
            }
            aria-pressed={sortOrder === 'asc'}
            className="flex size-6 items-center justify-center rounded hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
            onClick={() => {
              setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
            }}
            title={
              sortOrder === 'desc'
                ? m.document_aria_sort_newest()
                : m.document_aria_sort_oldest()
            }
            type="button"
          >
            <ArrowDownUp size={13} />
          </button>
          <button
            aria-label={m.document_aria_search()}
            className="flex size-6 items-center justify-center rounded hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
            onClick={() => {
              setSearchOpen(true);
            }}
            type="button"
          >
            <Search size={13} />
          </button>
          <button
            aria-label={m.document_aria_new_note()}
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
            <p className="text-xs">
              {typeFilter === 'asset'
                ? m.document_files_empty()
                : typeFilter === 'link'
                  ? m.document_links_empty()
                  : m.document_empty_no_notes()}
            </p>
            {typeFilter ? null : (
              <button
                className="rounded-md bg-black/5 px-2.5 py-1 text-xs hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
                onClick={handleCreate}
                type="button"
              >
                {m.document_empty_create_note()}
              </button>
            )}
          </div>
        ) : (
          <ul className="flex flex-col">
            {entries.map((entry, idx) => {
              const active = entry.id === selectedDocumentId;
              const EntryIcon = ENTRY_ICONS[entry.kind];
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
                    <EntryIcon
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
                      {m.document_empty_note()}
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500">
                    <span>{entry.updatedAt ?? '—'}</span>
                    <span>
                      {entry.createdAt
                        ? m.document_created_at({ date: entry.createdAt })
                        : ''}
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
