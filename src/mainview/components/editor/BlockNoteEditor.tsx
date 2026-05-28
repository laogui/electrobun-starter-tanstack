import type { Block, PartialBlock } from '@blocknote/core';
import '@blocknote/core/fonts/inter.css';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import { useCreateBlockNote } from '@blocknote/react';
import 'overlayscrollbars/overlayscrollbars.css';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { buildTextNoteFrontmatter } from '@/hooks/useNoteSaver';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { rpcLoadBlockNote } from '@/lib/rpc';
import { cn } from '@/lib/utils';

import {
  resolveBlockNoteFileUrl,
  uploadBlockNoteFile,
} from './blocknoteAttachments';
import { useBlockNoteSaver } from './useBlockNoteSaver';

interface BlockNoteEditorProps {
  color?: unknown;
  data: Record<string, unknown>;
  markdown?: unknown;
  nodeId: string;
  noteId?: unknown;
  onMarkdownChange: (markdown: string) => void;
  onPreviewUpdate?: (updates: Record<string, unknown>) => void;
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
  onTitleChange,
  title,
}: BlockNoteEditorProps) {
  const initialMarkdown = toText(markdown);
  const [titleValue, setTitleValue] = useState(toText(title));
  const [initial, setInitial] = useState<InitialContent | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const latestMarkdownRef = useRef(initialMarkdown);

  const colorValue = typeof color === 'string' ? color : '#FFFFFF';
  const isDark = isColorDark(colorValue);

  const frontmatter = useMemo(
    () =>
      typeof noteId === 'string'
        ? buildTextNoteFrontmatter(noteId, data, titleValue)
        : { title: titleValue, displayHint: 'note' },
    [data, noteId, titleValue]
  );

  const { flushNow, saveDebounced, setInitialRevision } = useBlockNoteSaver({
    enabled: typeof noteId === 'string',
    frontmatter,
    nodeId,
    noteId: typeof noteId === 'string' ? noteId : undefined,
    onPreviewUpdate,
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

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col',
        isDark ? 'text-white' : 'text-gray-900'
      )}
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
        <div className="mx-auto w-full max-w-3xl px-8 py-12 sm:px-12">
          <input
            aria-label="Note title"
            className={cn(
              'mb-6 w-full border-none bg-transparent font-bold text-4xl tracking-normal outline-none placeholder:opacity-40',
              isDark ? 'placeholder:text-white' : 'placeholder:text-gray-600'
            )}
            onBlur={handleBlur}
            onChange={(event) => onTitleChange(event.target.value)}
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
