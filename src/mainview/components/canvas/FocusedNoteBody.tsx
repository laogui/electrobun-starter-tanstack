import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { FocusedNotePreview } from '@/components/editor/FocusedNotePreview';
import { loadBlockNoteEditor } from '@/components/editor/loadBlockNoteEditor';
import { NoteEditorLoading } from '@/components/editor/NoteEditorLoading';
import type { BlockNoteSaveStatus } from '@/components/editor/useBlockNoteSaver';
import { FOCUS_EDITOR_SWAP_MS } from '@/lib/motion';
import { cn } from '@/lib/utils';

const BlockNoteEditor = lazy(loadBlockNoteEditor);

/** Reveal the editor anyway if it has not reported ready by then (slow disk,
 *  load error…); it renders its own loading / error state. */
const EDITOR_READY_TIMEOUT_MS = 1500;
/** Keep the preview mounted slightly past the fade so it never pops. */
const PREVIEW_UNMOUNT_SLACK_MS = 40;

interface FocusedNoteBodyProps {
  color?: string;
  content?: string;
  data: Record<string, unknown>;
  /**
   * False while the open animation runs: only the static preview renders.
   * Once true the editor mounts hidden and crossfades in when ready.
   */
  editorEnabled: boolean;
  nodeId: string;
  noteId?: string;
  onMarkdownChange: (markdown: string) => void;
  onPreviewUpdate?: (updates: Record<string, unknown>) => void;
  onSaveStatusChange: (
    status: BlockNoteSaveStatus,
    savedAt: Date | null
  ) => void;
  onTitleChange: (title: string) => void;
  title?: string;
}

/**
 * Focused text note: static preview during the open animation, BlockNote
 * afterwards. Readiness is tracked per node id so sibling navigation (which
 * re-keys the editor) shows the new note's preview until its editor is ready.
 */
export function FocusedNoteBody({
  color,
  content,
  data,
  editorEnabled,
  nodeId,
  noteId,
  onMarkdownChange,
  onPreviewUpdate,
  onSaveStatusChange,
  onTitleChange,
  title,
}: FocusedNoteBodyProps) {
  const [revealedNodeId, setRevealedNodeId] = useState<string | null>(null);
  const [previewRemovedNodeId, setPreviewRemovedNodeId] = useState<
    string | null
  >(null);
  const revealed = revealedNodeId === nodeId;
  const showPreview = previewRemovedNodeId !== nodeId;

  const handleReady = useCallback(() => {
    setRevealedNodeId(nodeId);
  }, [nodeId]);

  // Safety net: never leave the user staring at a static preview.
  useEffect(() => {
    if (!editorEnabled || revealed) {
      return;
    }
    const timer = setTimeout(() => {
      setRevealedNodeId(nodeId);
    }, EDITOR_READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [editorEnabled, nodeId, revealed]);

  // Unmount the preview once the crossfade has finished.
  useEffect(() => {
    if (!revealed) {
      return;
    }
    const timer = setTimeout(() => {
      setPreviewRemovedNodeId(nodeId);
    }, FOCUS_EDITOR_SWAP_MS + PREVIEW_UNMOUNT_SLACK_MS);
    return () => clearTimeout(timer);
  }, [nodeId, revealed]);

  const fade = `opacity ${FOCUS_EDITOR_SWAP_MS}ms cubic-bezier(0.23, 1, 0.32, 1)`;

  return (
    <div className="relative h-full w-full">
      {editorEnabled ? (
        <div
          className={cn('h-full w-full', !revealed && 'pointer-events-none')}
          data-focus-editor-ready={revealed ? 'true' : 'false'}
          inert={!revealed}
          style={{
            opacity: revealed ? 1 : 0,
            transition: revealed ? fade : undefined,
          }}
        >
          <Suspense
            fallback={<NoteEditorLoading color={color} title={title} />}
          >
            <BlockNoteEditor
              color={color}
              data={data}
              key={nodeId}
              markdown={content}
              nodeId={nodeId}
              noteId={noteId}
              onMarkdownChange={onMarkdownChange}
              onPreviewUpdate={onPreviewUpdate}
              onReady={handleReady}
              onSaveStatusChange={onSaveStatusChange}
              onTitleChange={onTitleChange}
              title={title}
            />
          </Suspense>
        </div>
      ) : null}
      {showPreview ? (
        <div
          className="pointer-events-none absolute inset-0"
          key={nodeId}
          style={{
            opacity: revealed ? 0 : 1,
            transition: revealed ? fade : undefined,
          }}
        >
          <FocusedNotePreview color={color} data={data} title={title} />
        </div>
      ) : null}
    </div>
  );
}
