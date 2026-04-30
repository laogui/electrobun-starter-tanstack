import { FileText } from 'lucide-react';
import { lazy, Suspense, useMemo } from 'react';

import { ImageContent } from '@/components/canvas/nodes/ImageNode';
import { resolveDocumentSelection } from '@/lib/canvasUtils';
import { FLAGS } from '@/lib/flags';
import { useCanvasStore } from '@/store/canvasStore';

const TiptapEditor = lazy(() => import('@/components/editor/TiptapEditor'));

const EditorSkeleton = () => (
  <div className="flex h-full flex-col gap-4 p-10">
    <div className="h-8 w-1/2 animate-pulse rounded-md bg-black/5 dark:bg-white/10" />
    <div className="h-full animate-pulse rounded-lg bg-black/5 dark:bg-white/5" />
  </div>
);

const EmptyState = () => (
  <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-400 dark:text-gray-500">
    <FileText size={36} strokeWidth={1.4} />
    <p className="text-sm">Select a document from the sidebar to begin.</p>
  </div>
);

interface ResolvedDoc {
  childId?: string;
  data: Record<string, unknown>;
  folderId?: string;
  isFolderChild: boolean;
  /** Stable id for editor remount — node id or folder-child composite. */
  key: string;
  /** Top-level node id (for cards) or undefined for folder children. */
  nodeId?: string;
  type: 'card' | 'image';
}

function useResolvedDocument(): ResolvedDoc | null {
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
      if (node.type !== 'card' && node.type !== 'image') {
        return null;
      }
      return {
        key: `node:${node.id}`,
        data: node.data as Record<string, unknown>,
        nodeId: node.id,
        isFolderChild: false,
        type: node.type,
      };
    }
    const folder = nodes.find((n) => n.id === ref.folderId);
    if (!folder || folder.type !== 'folder') {
      return null;
    }
    const children = ((folder.data as any)?.children ?? []) as Array<{
      data: Record<string, unknown>;
      id: string;
      type?: string;
    }>;
    const child = children.find((c) => c.id === ref.childId);
    if (!child) {
      return null;
    }
    return {
      key: `child:${ref.folderId}:${ref.childId}`,
      data: child.data,
      folderId: ref.folderId,
      childId: ref.childId,
      isFolderChild: true,
      type: child.type === 'image' ? 'image' : 'card',
    };
  }, [nodes, selection]);
}

export function DocumentEditor() {
  const doc = useResolvedDocument();
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const updateFolderChildData = useCanvasStore((s) => s.updateFolderChildData);

  if (!doc) {
    return <EmptyState />;
  }

  if (doc.type === 'image') {
    return (
      <div className="h-full">
        <ImageContent data={doc.data as never} isFocused />
      </div>
    );
  }

  const dataType = (doc.data as { type?: unknown }).type;
  const isText = dataType === 'text' || dataType == null;

  if (!(isText && FLAGS.tiptapEditor)) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400 text-sm">
        This document type can only be edited from the canvas view.
      </div>
    );
  }

  const onMarkdownChange = (markdown: string) => {
    const updates = {
      content: markdown,
      previewBlocks: undefined,
      previewExcerpt: undefined,
      previewHtml: undefined,
      previewVersion: undefined,
    };
    if (doc.isFolderChild && doc.folderId && doc.childId) {
      updateFolderChildData(doc.folderId, doc.childId, updates);
    } else if (doc.nodeId) {
      updateNodeData(doc.nodeId, updates);
    }
  };

  const onTitleChange = (title: string) => {
    if (doc.isFolderChild && doc.folderId && doc.childId) {
      updateFolderChildData(doc.folderId, doc.childId, { title });
    } else if (doc.nodeId) {
      updateNodeData(doc.nodeId, { title });
    }
  };

  return (
    <div className="mx-auto h-full w-full max-w-3xl">
      <Suspense fallback={<EditorSkeleton />}>
        <TiptapEditor
          color={(doc.data as { color?: unknown }).color ?? '#FFFFFF'}
          data={doc.data}
          key={doc.key}
          markdown={(doc.data as { content?: unknown }).content}
          nodeId={doc.nodeId ?? doc.childId ?? doc.key}
          noteId={
            doc.isFolderChild
              ? undefined
              : ((doc.data as { noteId?: unknown }).noteId as
                  | string
                  | undefined)
          }
          onMarkdownChange={onMarkdownChange}
          onTitleChange={onTitleChange}
          title={(doc.data as { title?: unknown }).title}
        />
      </Suspense>
    </div>
  );
}

export default DocumentEditor;
