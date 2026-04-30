import {
  ChevronRight,
  Code2,
  FileText,
  History,
  MoreHorizontal,
  Star,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Loader } from '@/components/layout/Loader';
import { initialEdges, initialNodes } from '@/data/initialNodes';
import { useCanvasPersistence } from '@/hooks/useCanvasPersistence';
import { resolveDocumentSelection } from '@/lib/canvasUtils';
import { isRpcAvailable, loadCanvas, rpcSaveManifest } from '@/lib/rpc';
import { sanitizeForPersistence } from '@/lib/sanitize';
import { useCanvasStore } from '@/store/canvasStore';

import { DocumentEditor } from './DocumentEditor';
import { LeftRail } from './LeftRail';
import { NoteList } from './NoteList';

function getString(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  return typeof v === 'string' ? v : '';
}

function useEditorTitle(): { title: string; kind: 'Note' | 'Image' } | null {
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
      return {
        title:
          getString(data, 'title') ||
          (node.type === 'image' ? 'Image' : 'Untitled'),
        kind: node.type === 'image' ? 'Image' : 'Note',
      };
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
    return {
      title:
        getString(child.data, 'title') ||
        (child.type === 'image' ? 'Image' : 'Untitled'),
      kind: child.type === 'image' ? 'Image' : 'Note',
    };
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
            <FileText className="opacity-70" size={13} />
            <span>{head.kind}</span>
            <ChevronRight className="opacity-50" size={12} />
            <span className="truncate font-medium text-gray-800 dark:text-gray-100">
              {head.title}
            </span>
          </>
        ) : (
          <span className="text-gray-400">No document selected</span>
        )}
      </div>
      <div className="flex items-center gap-0.5 text-gray-400">
        {head ? (
          <>
            <ToolbarBtn label="Star">
              <Star size={13} />
            </ToolbarBtn>
            <ToolbarBtn label="History">
              <History size={13} />
            </ToolbarBtn>
            <ToolbarBtn label="Source">
              <Code2 size={13} />
            </ToolbarBtn>
            <ToolbarBtn label="Delete" onClick={handleDelete}>
              <Trash2 size={13} />
            </ToolbarBtn>
            <ToolbarBtn label="More">
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

  useCanvasPersistence();

  useEffect(() => {
    if (hydrated) {
      return;
    }
    loadCanvas(activeViewId)
      .then(async (data) => {
        if (data && data.nodes.length > 0) {
          hydrate(data.nodes, data.edges);
        } else if (await isRpcAvailable()) {
          const sanitized = sanitizeForPersistence(initialNodes, initialEdges);
          await rpcSaveManifest(activeViewId, sanitized.nodes, sanitized.edges);
          hydrate(initialNodes, initialEdges);
        } else {
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
    <div className="grid h-screen w-screen grid-cols-[220px_320px_1fr] overflow-hidden bg-[#F7F7F5] pt-10 font-sans dark:bg-[#141414]">
      <LeftRail />
      <NoteList />
      <main className="flex h-full min-w-0 flex-col overflow-hidden bg-white dark:bg-neutral-900">
        <EditorToolbar />
        <div className="min-h-0 flex-1">
          <DocumentEditor />
        </div>
      </main>
    </div>
  );
}

export default DocumentView;
