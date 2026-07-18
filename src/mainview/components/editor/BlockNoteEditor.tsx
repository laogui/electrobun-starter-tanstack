import {
  type Block,
  filterSuggestionItems,
  type PartialBlock,
} from '@blocknote/core';
import '@blocknote/core/fonts/inter.css';
import { en } from '@blocknote/core/locales';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import {
  FormattingToolbar,
  FormattingToolbarController,
  getDefaultReactSlashMenuItems,
  getFormattingToolbarItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from '@blocknote/react';
import {
  AIExtension,
  AIMenuController,
  AIToolbarButton,
  getAISlashMenuItems,
} from '@blocknote/xl-ai';
import { en as aiEn } from '@blocknote/xl-ai/locales';
import '@blocknote/xl-ai/style.css';
import { DefaultChatTransport } from 'ai';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

import { buildTextNoteFrontmatter } from '@/hooks/useNoteSaver';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { rpcGetLocalHttpEndpoint, rpcLoadBlockNote } from '@/lib/rpc';
import { cn } from '@/lib/utils';
import { useAppSettingsStore } from '@/store/appSettingsStore';
import { getBlockNoteDebounceMs } from './blockNoteEditorTiming';
import {
  resolveBlockNoteFileUrl,
  uploadBlockNoteFile,
} from './blocknoteAttachments';
import { NoteEditorLoading } from './NoteEditorLoading';
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
  /** Markdown body returned by the loadBlockNote RPC when recovering from a
   *  legacy `.md` file (no sidecar). This takes priority over the component
   *  prop so freshly imported notes whose card `data` has no `content` field
   *  still display their full body. */
  markdown?: string;
  recoveredFromMarkdown: boolean;
  revision: number | undefined;
}

function createEmptyInitialContent(): InitialContent {
  return {
    blocks: undefined,
    recoveredFromMarkdown: false,
    revision: undefined,
  };
}

type LocalHttpEndpointInfo = Awaited<
  ReturnType<typeof rpcGetLocalHttpEndpoint>
>;

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
  const noteKey = typeof noteId === 'string' ? noteId : null;
  const [titleValue, setTitleValue] = useState(() => toText(title));
  const [initial, setInitial] = useState<InitialContent | null>(() =>
    noteKey === null ? createEmptyInitialContent() : null
  );
  const [localHttpEndpoint, setLocalHttpEndpoint] = useState<
    LocalHttpEndpointInfo | undefined
  >(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const latestMarkdownRef = useRef(initialMarkdown);
  const latestBlocksRef = useRef<PartialBlock[] | undefined>(undefined);
  const initialNoteKeyRef = useRef<string | null>(noteKey);
  const onSaveStatusChangeRef = useRef(onSaveStatusChange);

  if (initialNoteKeyRef.current !== noteKey) {
    initialNoteKeyRef.current = noteKey;
    latestBlocksRef.current = undefined;
    setInitial(noteKey === null ? createEmptyInitialContent() : null);
  }

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
    if (status === 'saved') {
      const now = new Date();
      onSaveStatusChangeRef.current?.(status, now);
    } else {
      onSaveStatusChangeRef.current?.(status, null);
    }
  }, []);

  const autoSaveInterval = useAppSettingsStore((s) => s.autoSaveInterval);
  const debounceMs = getBlockNoteDebounceMs(autoSaveInterval);

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
            markdown:
              typeof (response as any).markdown === 'string'
                ? (response as any).markdown
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

  useEffect(() => {
    let cancelled = false;
    const loadLocalHttpEndpoint = async () => {
      try {
        const info = await rpcGetLocalHttpEndpoint();
        if (!cancelled) {
          setLocalHttpEndpoint(info);
        }
      } catch (error) {
        console.error(
          '[blocknote] Failed to resolve local HTTP endpoint:',
          error
        );
        if (!cancelled) {
          setLocalHttpEndpoint(null);
        }
      }
    };
    loadLocalHttpEndpoint();
    globalThis.addEventListener('settings-updated', loadLocalHttpEndpoint);
    return () => {
      cancelled = true;
      globalThis.removeEventListener('settings-updated', loadLocalHttpEndpoint);
    };
  }, []);

  const localHttpEndpointKey = localHttpEndpoint
    ? `${localHttpEndpoint.aiEnabled}:${localHttpEndpoint.baseUrl}:${localHttpEndpoint.token}`
    : 'no-ai';

  if (!initial || localHttpEndpoint === undefined) {
    return <NoteEditorLoading color={colorValue} title={titleValue} />;
  }

  return (
    <BlockNoteSurface
      color={colorValue}
      flushNow={flushNow}
      initial={initial}
      initialMarkdown={initialMarkdown}
      isDark={isDark}
      key={localHttpEndpointKey}
      latestBlocksRef={latestBlocksRef}
      latestMarkdownRef={latestMarkdownRef}
      loadFailed={loadFailed}
      localHttpEndpoint={localHttpEndpoint}
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
  latestBlocksRef: React.MutableRefObject<PartialBlock[] | undefined>;
  latestMarkdownRef: React.MutableRefObject<string>;
  loadFailed: boolean;
  localHttpEndpoint: LocalHttpEndpointInfo;
  noteId: string | undefined;
  onMarkdownChange: (markdown: string) => void;
  onTitleBlur: () => void;
  onTitleChange: (next: string) => void;
  saveDebounced: (payload: { blocks: unknown[]; markdown: string }) => void;
  title: string;
}

function BlockNoteSurface({
  localHttpEndpoint,
  color,
  flushNow,
  initial,
  initialMarkdown,
  isDark,
  latestBlocksRef,
  latestMarkdownRef,
  loadFailed,
  onMarkdownChange,
  onTitleBlur,
  onTitleChange,
  saveDebounced,
  title,
}: BlockNoteSurfaceProps) {
  // Prefer the markdown body the RPC returned (from the .md file) over the
  // prop-based `initialMarkdown` (from the card's data.content, which may be
  // empty for freshly imported notes). This is the value we feed into the
  // one-time markdown-to-blocks import below.
  const effectiveMarkdown = initial.markdown ?? initialMarkdown;

  // Build the editor exactly once for the lifetime of this surface. If the
  // sidecar load returned blocks we use them as `initialContent`; otherwise
  // we let BlockNote start empty and then asynchronously import Markdown so
  // we don't lose the legacy `.md` body during migration.
  // AI is wired only when the Bun endpoint reports a configured provider. The
  // transport points at the localhost /ai/chat route with the per-launch
  // bearer token; without it we build a plain editor unchanged.
  const aiEnabled = Boolean(
    localHttpEndpoint?.aiEnabled && localHttpEndpoint.baseUrl
  );

  const editor = useCreateBlockNote({
    initialContent:
      latestBlocksRef.current ??
      (initial.blocks && initial.blocks.length > 0
        ? initial.blocks
        : undefined),
    // Route image / file / video / audio uploads through the GhostBoard
    // workspace pipeline. `uploadFile` runs on file-picker, paste, and
    // drag-drop; the returned workspace-relative path is what gets stored
    // in the JSON sidecar and serialised into the Markdown mirror.
    uploadFile: uploadBlockNoteFile,
    resolveFileUrl: resolveBlockNoteFileUrl,
    ...(aiEnabled && localHttpEndpoint
      ? {
          dictionary: { ...en, ai: aiEn },
          extensions: [
            AIExtension({
              transport: new DefaultChatTransport({
                api: `${localHttpEndpoint.baseUrl}/ai/chat`,
                headers: {
                  Authorization: `Bearer ${localHttpEndpoint.token}`,
                },
              }),
            }),
          ],
        }
      : {}),
  });

  const editorRootRef = useRef<HTMLDivElement | null>(null);

  // If we recovered from markdown (no sidecar yet), import the markdown body
  // once the editor surface mounts.
  const didImportMarkdownRef = useRef(false);
  const importRecoveredMarkdown = useCallback(() => {
    if (didImportMarkdownRef.current) {
      return;
    }
    if (!initial.recoveredFromMarkdown) {
      didImportMarkdownRef.current = true;
      return;
    }
    if (!effectiveMarkdown.trim()) {
      didImportMarkdownRef.current = true;
      return;
    }
    didImportMarkdownRef.current = true;
    (async () => {
      try {
        const blocks = await editor.tryParseMarkdownToBlocks(effectiveMarkdown);
        if (blocks.length > 0) {
          editor.replaceBlocks(editor.document, blocks);
          latestBlocksRef.current = blocks;
        }
      } catch (error) {
        console.error('[blocknote] Failed to import markdown:', error);
      }
    })();
  }, [
    editor,
    effectiveMarkdown,
    initial.recoveredFromMarkdown,
    latestBlocksRef,
  ]);
  const setEditorRoot = useCallback(
    (element: HTMLDivElement | null) => {
      editorRootRef.current = element;
      if (element) {
        importRecoveredMarkdown();
      }
    },
    [importRecoveredMarkdown]
  );

  const handleChange = useCallback(async () => {
    const blocks = editor.document as Block[];
    let markdown = '';
    try {
      markdown = await editor.blocksToMarkdownLossy(blocks);
    } catch (error) {
      console.error('[blocknote] Failed to serialize markdown:', error);
    }
    latestMarkdownRef.current = markdown;
    latestBlocksRef.current = blocks as PartialBlock[];
    onMarkdownChange(markdown);
    saveDebounced({ blocks: blocks as unknown as unknown[], markdown });
  }, [
    editor,
    latestBlocksRef,
    latestMarkdownRef,
    onMarkdownChange,
    saveDebounced,
  ]);

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
        'note-editor-surface flex h-full w-full flex-col',
        isDark ? 'text-white' : 'text-gray-900'
      )}
      ref={setEditorRoot}
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
        <div className="mx-auto w-full max-w-[min(88ch,90%)] px-4 py-12 sm:px-8 lg:px-12">
          <TextareaAutosize
            aria-label="Note title"
            className={cn(
              'mb-2 block w-full resize-none border-none bg-transparent pl-[54px] font-bold text-4xl leading-tight tracking-normal outline-hidden',
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
            formattingToolbar={!aiEnabled}
            onBlur={handleBlur}
            onChange={handleChange}
            slashMenu={!aiEnabled}
            theme={isDark ? 'dark' : 'light'}
          >
            {aiEnabled ? (
              <>
                <AIMenuController />
                <FormattingToolbarController
                  formattingToolbar={() => (
                    <FormattingToolbar>
                      {...getFormattingToolbarItems()}
                      <AIToolbarButton />
                    </FormattingToolbar>
                  )}
                />
                <SuggestionMenuController
                  getItems={async (query) =>
                    filterSuggestionItems(
                      [
                        ...getDefaultReactSlashMenuItems(editor),
                        ...getAISlashMenuItems(editor),
                      ],
                      query
                    )
                  }
                  triggerCharacter="/"
                />
              </>
            ) : null}
          </BlockNoteView>
        </div>
      </OverlayScrollbarsComponent>
    </div>
  );
}
