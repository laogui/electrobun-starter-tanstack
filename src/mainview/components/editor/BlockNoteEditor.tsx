import type { Block, PartialBlock } from '@blocknote/core';
import '@blocknote/core/fonts/inter.css';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import { useCreateBlockNote } from '@blocknote/react';
import 'overlayscrollbars/overlayscrollbars.css';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

import { buildTextNoteFrontmatter } from '@/hooks/useNoteSaver';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { rpcLoadBlockNote } from '@/lib/rpc';
import { cn } from '@/lib/utils';
import { useAppSettingsStore } from '@/store/appSettingsStore';

import {
  resolveBlockNoteFileUrl,
  uploadBlockNoteFile,
} from './blocknoteAttachments';
import {
  type BlockNoteSaveStatus,
  useBlockNoteSaver,
} from './useBlockNoteSaver';

const TITLE_MAX_LENGTH = 120;

interface BlockNoteEditorProps {
  color?: unknown;
  data: Record<string, unknown>;
  markdown?: unknown;
  nodeId: string;
  noteId?: unknown;
  onMarkdownChange: (markdown: string) => void;
  onPreviewUpdate?: (updates: Record<string, unknown>) => void;
  onSaveStatusChange?: (
    status: BlockNoteSaveStatus,
    lastSavedAt: Date | null
  ) => void;
  onTitleChange: (title: string) => void;
  title?: unknown;
}

const toText = (value: unknown): string =>
  typeof value === 'string' ? value : '';

interface InitialContent {
  blocks: PartialBlock[] | undefined;
  recoveredFromMarkdown: boolean;
  revision: number | undefined;
}

export default function BlockNoteEditor({
  color,
  data,
  markdown,
  nodeId,
  noteId,
  onMarkdownChange,
  onPreviewUpdate,
  onSaveStatusChange,
  onTitleChange,
  title,
}: BlockNoteEditorProps) {
  const initialMarkdown = toText(markdown);
  const [titleValue, setTitleValue] = useState(toText(title));
  const [initial, setInitial] = useState<InitialContent | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [, setSaveStatus] = useState<BlockNoteSaveStatus>('idle');
  const [, setLastSavedAt] = useState<Date | null>(null);
  const latestMarkdownRef = useRef(initialMarkdown);
  const onSaveStatusChangeRef = useRef(onSaveStatusChange);

  const colorValue = typeof color === 'string' ? color : '#FFFFFF';
  const isDark = isColorDark(colorValue);

  const frontmatter = useMemo(
    () =>
      typeof noteId === 'string'
        ? buildTextNoteFrontmatter(noteId, data, titleValue)
        : { title: titleValue, displayHint: 'note' },
    [data, noteId, titleValue]
  );

  useEffect(() => {
    onSaveStatusChangeRef.current = onSaveStatusChange;
  }, [onSaveStatusChange]);

  const handleSaveStatusChange = useCallback((status: BlockNoteSaveStatus) => {
    setSaveStatus(status);
    if (status === 'saved') {
      const now = new Date();
      setLastSavedAt(now);
      onSaveStatusChangeRef.current?.(status, now);
    } else {
      onSaveStatusChangeRef.current?.(status, null);
    }
  }, []);

  const autoSaveInterval = useAppSettingsStore((s) => s.autoSaveInterval);
  const debounceMs = Math.round(autoSaveInterval * 1000);

  const { flushNow, saveDebounced, setInitialRevision } = useBlockNoteSaver({
    debounceMs,
    enabled: typeof noteId === 'string',
    frontmatter,
    nodeId,
    noteId: typeof noteId === 'string' ? noteId : undefined,
    onPreviewUpdate,
    onSaveStatusChange: handleSaveStatusChange,
  });

  // Load sidecar (or signal markdown-import fallback) once per noteId. We do
  // this outside the editor instance so `useCreateBlockNote` only fires after
  // we know whether we have JSON blocks or just markdown.
  useEffect(() => {
    let cancelled = false;
    if (typeof noteId !== 'string') {
      setInitial({
        blocks: undefined,
        revision: undefined,
        recoveredFromMarkdown: false,
      });
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      try {
        const response = await rpcLoadBlockNote(noteId);
        if (cancelled) {
          return;
        }
        if (response.success) {
          setInitial({
            blocks: Array.isArray(response.blocks)
              ? (response.blocks as PartialBlock[])
              : undefined,
            revision:
              typeof response.revision === 'number'
                ? response.revision
                : undefined,
            recoveredFromMarkdown: Boolean(response.recoveredFromMarkdown),
          });
          setInitialRevision(response.revision);
        } else {
          setInitial({
            blocks: undefined,
            revision: undefined,
            recoveredFromMarkdown: true,
          });
        }
      } catch (error) {
        console.error('[blocknote] Failed to load note:', error);
        if (!cancelled) {
          setLoadFailed(true);
          setInitial({
            blocks: undefined,
            revision: undefined,
            recoveredFromMarkdown: true,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [noteId, setInitialRevision]);

  if (!initial) {
    return (
      <div
        className={cn(
          'flex h-full w-full items-center justify-center',
          isDark ? 'text-white/60' : 'text-gray-500'
        )}
        style={colorToStyle(colorValue)}
      >
        <span className="text-sm">Loading editor…</span>
      </div>
    );
  }

  return (
    <BlockNoteSurface
      color={colorValue}
      flushNow={flushNow}
      initial={initial}
      initialMarkdown={initialMarkdown}
      isDark={isDark}
      latestMarkdownRef={latestMarkdownRef}
      loadFailed={loadFailed}
      noteId={typeof noteId === 'string' ? noteId : undefined}
      onMarkdownChange={onMarkdownChange}
      onTitleBlur={() => {
        // flush latest payload — handled inside BlockNoteSurface after
        // computing markdown/blocks.
      }}
      onTitleChange={(next) => {
        setTitleValue(next);
        onTitleChange(next);
      }}
      saveDebounced={saveDebounced}
      title={titleValue}
    />
  );
}

export type { BlockNoteSaveStatus };

interface BlockNoteSurfaceProps {
  color: string;
  flushNow: () => void;
  initial: InitialContent;
  initialMarkdown: string;
  isDark: boolean;
  latestMarkdownRef: React.MutableRefObject<string>;
  loadFailed: boolean;
  noteId: string | undefined;
  onMarkdownChange: (markdown: string) => void;
  onTitleBlur: () => void;
  onTitleChange: (next: string) => void;
  saveDebounced: (payload: { blocks: unknown[]; markdown: string }) => void;
  title: string;
}

function BlockNoteSurface({
  color,
  flushNow,
  initial,
  initialMarkdown,
  isDark,
  latestMarkdownRef,
  loadFailed,
  onMarkdownChange,
  onTitleBlur,
  onTitleChange,
  saveDebounced,
  title,
}: BlockNoteSurfaceProps) {
  // Build the editor exactly once for the lifetime of this surface. If the
  // sidecar load returned blocks we use them as `initialContent`; otherwise
  // we let BlockNote start empty and then asynchronously import Markdown so
  // we don't lose the legacy `.md` body during migration.
  const editor = useCreateBlockNote({
    initialContent:
      initial.blocks && initial.blocks.length > 0 ? initial.blocks : undefined,
    // Route image / file / video / audio uploads through the GhostBoard
    // workspace pipeline. `uploadFile` runs on file-picker, paste, and
    // drag-drop; the returned workspace-relative path is what gets stored
    // in the JSON sidecar and serialised into the Markdown mirror.
    uploadFile: uploadBlockNoteFile,
    resolveFileUrl: resolveBlockNoteFileUrl,
  });

  const editorRootRef = useRef<HTMLDivElement | null>(null);

  // If we recovered from markdown (no sidecar yet), import the markdown body
  // once the editor mounts.
  const didImportMarkdownRef = useRef(false);
  useEffect(() => {
    if (didImportMarkdownRef.current) {
      return;
    }
    if (!initial.recoveredFromMarkdown) {
      didImportMarkdownRef.current = true;
      return;
    }
    if (!initialMarkdown.trim()) {
      didImportMarkdownRef.current = true;
      return;
    }
    didImportMarkdownRef.current = true;
    (async () => {
      try {
        const blocks = await editor.tryParseMarkdownToBlocks(initialMarkdown);
        if (blocks.length > 0) {
          editor.replaceBlocks(editor.document, blocks);
        }
      } catch (error) {
        console.error('[blocknote] Failed to import markdown:', error);
      }
    })();
  }, [editor, initial.recoveredFromMarkdown, initialMarkdown]);

  const handleChange = useCallback(async () => {
    const blocks = editor.document as Block[];
    let markdown = '';
    try {
      markdown = await editor.blocksToMarkdownLossy(blocks);
    } catch (error) {
      console.error('[blocknote] Failed to serialize markdown:', error);
    }
    latestMarkdownRef.current = markdown;
    onMarkdownChange(markdown);
    saveDebounced({ blocks: blocks as unknown as unknown[], markdown });
  }, [editor, latestMarkdownRef, onMarkdownChange, saveDebounced]);

  const handleBlur = useCallback(() => {
    onTitleBlur();
    flushNow();
  }, [flushNow, onTitleBlur]);

  // Enter in the title field moves focus into the editor body; Shift+Enter
  // keeps the native line-break behaviour of the autosizing textarea.
  const handleTitleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const editable = editorRootRef.current?.querySelector<HTMLElement>(
          '.bn-editor[contenteditable="true"], .bn-editor'
        );
        if (editable) {
          editable.focus();
          // Place caret at the start of the document so typing continues the
          // first block instead of selecting the whole editor.
          const range = document.createRange();
          const selection = window.getSelection();
          if (editable.firstChild && selection) {
            range.setStart(editable.firstChild, 0);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }
    },
    []
  );

  const titlePlaceholderStyle = isDark
    ? 'placeholder:text-white/40'
    : 'placeholder:text-gray-600/60';

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col',
        isDark ? 'text-white' : 'text-gray-900'
      )}
      ref={editorRootRef}
      style={colorToStyle(color)}
    >
      {loadFailed ? (
        <div
          className={cn(
            'mx-auto mt-4 max-w-3xl rounded-md px-4 py-2 text-xs',
            isDark ? 'bg-white/10 text-white/80' : 'bg-black/5 text-gray-700'
          )}
        >
          Failed to load the saved editor state. Showing the Markdown copy —
          your next save will rebuild the JSON sidecar.
        </div>
      ) : null}
      <OverlayScrollbarsComponent
        className="min-h-0 flex-1"
        defer
        options={{
          scrollbars: { theme: 'os-theme-dark', autoHide: 'never' },
          overflow: { x: 'hidden' },
        }}
      >
        <div className="mx-auto w-full max-w-[min(72ch,80%)] px-4 py-12 sm:px-8 lg:px-12">
          <TextareaAutosize
            aria-label="Note title"
            className={cn(
              'mb-6 block w-full resize-none border-none bg-transparent font-bold text-4xl leading-tight tracking-normal outline-none',
              titlePlaceholderStyle
            )}
            maxLength={TITLE_MAX_LENGTH}
            maxRows={4}
            minRows={1}
            onBlur={handleBlur}
            onChange={(event) => onTitleChange(event.target.value)}
            onKeyDown={handleTitleKeyDown}
            placeholder="Untitled"
            value={title}
          />
          <BlockNoteView
            editor={editor}
            onBlur={handleBlur}
            onChange={handleChange}
            theme={isDark ? 'dark' : 'light'}
          />
        </div>
      </OverlayScrollbarsComponent>
    </div>
  );
}
