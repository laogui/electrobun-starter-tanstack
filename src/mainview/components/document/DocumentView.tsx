import {
  ChevronRight,
  Code2,
  FileText,
  History,
  ImageIcon,
  Link2,
  type LucideIcon,
  MoreHorizontal,
  Paperclip,
  Star,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Loader } from '@/components/layout/Loader';
import { SearchDialog } from '@/components/search/SearchDialog';
import { initialEdges, initialNodes } from '@/data/initialNodes';
import { useCanvasPersistence } from '@/hooks/useCanvasPersistence';
import { useDocumentKeyboard } from '@/hooks/useDocumentKeyboard';
import { resolveDocumentSelection } from '@/lib/canvasUtils';
import {
  type AssetNodeData,
  getAssetDisplayTitle,
  getLinkDisplayTitle,
  type LinkNodeData,
} from '@/lib/contentTypes';
import { isRpcAvailable, loadCanvas } from '@/lib/rpc';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';

import { DocumentEditor } from './DocumentEditor';
import { ImageGallery } from './ImageGallery';
import { LeftRail } from './LeftRail';
import { NoteList } from './NoteList';

function getString(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  return typeof v === 'string' ? v : '';
}

type EditorKind = 'note' | 'image' | 'asset' | 'link';

function kindLabel(kind: EditorKind): string {
  switch (kind) {
    case 'image':
      return m.document_breadcrumb_image();
    case 'asset':
      return m.document_breadcrumb_file();
    case 'link':
      return m.document_breadcrumb_link();
    default:
      return m.document_breadcrumb_note();
  }
}

const KIND_ICON: Record<EditorKind, LucideIcon> = {
  note: FileText,
  image: ImageIcon,
  asset: Paperclip,
  link: Link2,
};

function editorKindForType(type: string | undefined): EditorKind {
  switch (type) {
    case 'image':
      return 'image';
    case 'asset':
      return 'asset';
    case 'link':
      return 'link';
    default:
      return 'note';
  }
}

function editorTitleFor(
  kind: EditorKind,
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

function useEditorTitle(): { title: string; kind: EditorKind } | null {
  const selection = useCanvasStore((s) => s.selectedDocumentId);
  const nodes = useCanvasStore((s) => s.nodes);
  return useMemo(() => {
    const ref = resolveDocumentSelection(selection);
    if (!ref) {
      return null;
    }
    if (ref.kind === 'node') {
      const node = nodes.find((n) => n.id === ref.nodeId);
      if (!node) {
        return null;
      }
      const data = node.data as Record<string, unknown>;
      const kind = editorKindForType(node.type);
      return { title: editorTitleFor(kind, data), kind };
    }
    const folder = nodes.find((n) => n.id === ref.folderId);
    const children = ((folder?.data as any)?.children ?? []) as Array<{
      data: Record<string, unknown>;
      id: string;
      type?: string;
    }>;
    const child = children.find((c) => c.id === ref.childId);
    if (!child) {
      return null;
    }
    const kind = editorKindForType(child.type);
    return { title: editorTitleFor(kind, child.data), kind };
  }, [nodes, selection]);
}

function EditorToolbar() {
  const head = useEditorTitle();
  const selection = useCanvasStore((s) => s.selectedDocumentId);
  const setSelectedDocumentId = useCanvasStore((s) => s.setSelectedDocumentId);
  const deleteNodes = useCanvasStore((s) => s.deleteNodes);
  const deleteFolderChild = useCanvasStore((s) => s.deleteFolderChild);

  const handleDelete = () => {
    const ref = resolveDocumentSelection(selection);
    if (!ref) {
      return;
    }
    setSelectedDocumentId(null);
    if (ref.kind === 'node') {
      deleteNodes([ref.nodeId]);
    } else {
      deleteFolderChild(ref.folderId, ref.childId);
    }
  };

  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-black/5 border-b bg-white px-3 dark:border-white/5 dark:bg-neutral-900">
      <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-gray-500 dark:text-gray-400">
        {head ? (
          <>
            {(() => {
              const Icon = KIND_ICON[head.kind];
              return <Icon className="opacity-70" size={13} />;
            })()}
            <span>{kindLabel(head.kind)}</span>
            <ChevronRight className="opacity-50" size={12} />
            <span className="truncate font-medium text-gray-800 dark:text-gray-100">
              {head.title}
            </span>
          </>
        ) : (
          <span className="text-gray-400">
            {m.document_no_document_selected()}
          </span>
        )}
      </div>
      <div className="flex items-center gap-0.5 text-gray-400">
        {head ? (
          <>
            <ToolbarBtn label={m.document_aria_star()}>
              <Star size={13} />
            </ToolbarBtn>
            <ToolbarBtn label={m.document_aria_history()}>
              <History size={13} />
            </ToolbarBtn>
            <ToolbarBtn label={m.document_aria_source()}>
              <Code2 size={13} />
            </ToolbarBtn>
            <ToolbarBtn label={m.document_aria_delete()} onClick={handleDelete}>
              <Trash2 size={13} />
            </ToolbarBtn>
            <ToolbarBtn label={m.document_aria_more()}>
              <MoreHorizontal size={14} />
            </ToolbarBtn>
          </>
        ) : null}
      </div>
    </header>
  );
}

function ToolbarBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="flex size-7 items-center justify-center rounded-md hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function DocumentView() {
  const hydrate = useCanvasStore((s) => s.hydrate);
  const hydrated = useCanvasStore((s) => s._hydrated);
  const activeViewId = useCanvasStore((s) => s.activeViewId);
  const documentSection = useCanvasStore((s) => s.documentSection);
  const isImageGallery = documentSection === 'type:image';

  useCanvasPersistence();
  useDocumentKeyboard();

  useEffect(() => {
    if (hydrated) {
      return;
    }
    loadCanvas(activeViewId)
      .then(async (data) => {
        if (data) {
          // Respect what the manifest contains — including empty arrays for
          // canvases the user just created via "New Canvas → Blank Canvas".
          // First-run seeding for the default view now happens on the bun
          // side in `initWorkspace`.
          hydrate(data.nodes, data.edges);
        } else if (await isRpcAvailable()) {
          // RPC is up but no manifest exists for this view — start blank.
          hydrate([], []);
        } else {
          // Browser/dev fallback (no Electrobun RPC): hydrate with the demo
          // initialNodes so the document view is usable for debugging.
          hydrate(initialNodes, initialEdges);
        }
      })
      .catch((error) => {
        console.error('[persistence] Failed to load canvas:', error);
      });
  }, [hydrate, hydrated, activeViewId]);

  if (!hydrated) {
    return (
      <div className="h-screen w-screen bg-[#F7F7F5] dark:bg-[#141414]">
        <Loader />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid h-screen w-screen grid-rows-[minmax(0,1fr)] overflow-hidden bg-[#F7F7F5] pt-10 font-sans dark:bg-[#141414]',
        isImageGallery ? 'grid-cols-[220px_1fr]' : 'grid-cols-[220px_320px_1fr]'
      )}
    >
      <LeftRail />
      {isImageGallery ? (
        <ImageGallery />
      ) : (
        <>
          <NoteList />
          <main className="flex h-full min-w-0 flex-col overflow-hidden bg-white dark:bg-neutral-900">
            <EditorToolbar />
            <div className="min-h-0 flex-1">
              <DocumentEditor />
            </div>
          </main>
        </>
      )}
      <SearchDialog />
    </div>
  );
}

export default DocumentView;
