import {
  type Block,
  type BlockNoteEditor as Editor,
  filterSuggestionItems,
  type PartialBlock,
} from '@blocknote/core';
import '@blocknote/core/fonts/inter.css';
import { en, zh } from '@blocknote/core/locales';
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
import { en as aiEn, zh as aiZh } from '@blocknote/xl-ai/locales';
import '@blocknote/xl-ai/style.css';
import { DefaultChatTransport } from 'ai';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

import { buildTextNoteFrontmatter } from '@/hooks/useNoteSaver';
import { loadBlockNoteWithPrefetch } from '@/lib/blockNotePrefetch';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { registerNoteBodyEditor } from '@/lib/noteBodySync';
import {
  applyCanonicalNoteSnapshot,
  applyNoteMetadataChanges,
} from '@/lib/noteMetadataProjection';
import { rpcGetLocalHttpEndpoint } from '@/lib/rpc';
import { cn } from '@/lib/utils';
import { useAppSettingsStore } from '@/store/appSettingsStore';
import { useCanvasStore } from '@/store/canvasStore';
import * as m from '../../../paraglide/messages.js';
import {
  abortAIEditorRequest,
  getAIRequestSignal,
  hasPendingAIChanges,
  observeAIEditorSession,
} from './aiEditorSession';
import { getBlockNoteDebounceMs } from './blockNoteEditorTiming';
import {
  resolveBlockNoteFileUrl,
  uploadBlockNoteFile,
} from './blocknoteAttachments';
import { EditorAIMenu } from './EditorAIMenu';
import { NoteConflictBanner } from './NoteConflictBanner';
import { NoteEditorLoading } from './NoteEditorLoading';
import {
  type BlockNoteSaveConflict,
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
  /**
   * Fires once, a frame after the editor surface has mounted with its initial
   * content (including the one-time markdown import for legacy notes). The
   * focused view keeps the editor hidden behind a static preview until then.
   */
  onReady?: () => void;
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
  workspaceId?: string;
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
  onReady,
  onSaveStatusChange,
  onTitleChange,
  title,
}: BlockNoteEditorProps) {
  const initialMarkdown = toText(markdown);
  const noteKey = typeof noteId === 'string' ? noteId : null;
  const externalTitle = toText(title);
  const [titleValue, setTitleValue] = useState(() => externalTitle);
  const previousExternalTitleRef = useRef(externalTitle);
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
  const initialMetadataRef = useRef({
    noteId,
    title: toText(title),
    color: toText(data.color),
    revision:
      typeof data.blocknoteRevision === 'number' ? data.blocknoteRevision : 0,
  });

  useEffect(() => {
    if (externalTitle === previousExternalTitleRef.current) {
      return;
    }
    previousExternalTitleRef.current = externalTitle;
    setTitleValue(externalTitle);
  }, [externalTitle]);

  if (initialNoteKeyRef.current !== noteKey) {
    initialMetadataRef.current = {
      noteId,
      title: toText(title),
      color: toText(data.color),
      revision:
        typeof data.blocknoteRevision === 'number' ? data.blocknoteRevision : 0,
    };
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

  const {
    acceptSavedVersion,
    canApplyExternal,
    conflict,
    conflictDraftReady,
    flushNow,
    keepLocalVersion,
    markDirty,
    retryConflictLoad,
    saveDebounced,
    setInitialRevision,
  } = useBlockNoteSaver({
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
        // Consumes the request started when the open was initiated (if still
        // fresh); otherwise loads now. Single-use, so revisions stay exact.
        const response = await loadBlockNoteWithPrefetch(noteId);
        if (cancelled) {
          return;
        }
        if (response.success) {
          setInitial({
            workspaceId: response.workspaceId,
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
          setInitialRevision(
            response.revision,
            response.frontmatter,
            response.workspaceId
          );
          const metadata = response.frontmatter;
          if (
            metadata &&
            typeof metadata.title === 'string' &&
            typeof metadata.color === 'string' &&
            typeof response.revision === 'number'
          ) {
            setTitleValue(metadata.title);
            const baseline = initialMetadataRef.current;
            const change = {
              id: noteId,
              before: {
                title: baseline.title,
                color: baseline.color,
                revision: baseline.revision,
              },
              after: {
                title: metadata.title,
                color: metadata.color,
                revision: response.revision,
              },
              metadataOnly: true,
            };
            useCanvasStore.setState((state) =>
              applyNoteMetadataChanges(state, [change])
            );
          }
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
    let requestVersion = 0;
    const loadLocalHttpEndpoint = async () => {
      const version = ++requestVersion;
      try {
        const info = await rpcGetLocalHttpEndpoint();
        if (!cancelled && version === requestVersion) {
          setLocalHttpEndpoint(info);
        }
      } catch (error) {
        console.error(
          '[blocknote] Failed to resolve local HTTP endpoint:',
          error
        );
        if (!cancelled && version === requestVersion) {
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

  if (!initial || localHttpEndpoint === undefined) {
    return <NoteEditorLoading color={colorValue} title={titleValue} />;
  }

  return (
    <BlockNoteSurface
      acceptSavedVersion={acceptSavedVersion}
      canApplyExternal={canApplyExternal}
      color={colorValue}
      conflict={conflict}
      conflictDraftReady={conflictDraftReady}
      flushNow={flushNow}
      initial={initial}
      initialMarkdown={initialMarkdown}
      isDark={isDark}
      latestBlocksRef={latestBlocksRef}
      latestMarkdownRef={latestMarkdownRef}
      loadFailed={loadFailed}
      localHttpEndpoint={localHttpEndpoint}
      markDirty={markDirty}
      noteId={typeof noteId === 'string' ? noteId : undefined}
      onExternalTitle={setTitleValue}
      onKeepLocal={() => {
        keepLocalVersion().catch((error) => {
          console.error('[blocknote] Failed to keep local version:', error);
        });
      }}
      onMarkdownChange={onMarkdownChange}
      onReady={onReady}
      onRetryConflictLoad={retryConflictLoad}
      onTitleBlur={() => {
        // flush latest payload — handled inside BlockNoteSurface after
        // computing markdown/blocks.
      }}
      onTitleChange={(next) => {
        setTitleValue(next);
        onTitleChange(next);
      }}
      saveDebounced={saveDebounced}
      setInitialRevision={setInitialRevision}
      title={titleValue}
    />
  );
}

export type { BlockNoteSaveStatus };

interface BlockNoteSurfaceProps {
  acceptSavedVersion: ReturnType<
    typeof useBlockNoteSaver
  >['acceptSavedVersion'];
  canApplyExternal: ReturnType<typeof useBlockNoteSaver>['canApplyExternal'];
  color: string;
  conflict: BlockNoteSaveConflict | null;
  conflictDraftReady: boolean;
  flushNow: () => void;
  initial: InitialContent;
  initialMarkdown: string;
  isDark: boolean;
  latestBlocksRef: React.MutableRefObject<PartialBlock[] | undefined>;
  latestMarkdownRef: React.MutableRefObject<string>;
  loadFailed: boolean;
  localHttpEndpoint: LocalHttpEndpointInfo;
  markDirty: () => void;
  noteId: string | undefined;
  onExternalTitle: (title: string) => void;
  onKeepLocal: () => void;
  onMarkdownChange: (markdown: string) => void;
  onReady?: () => void;
  onRetryConflictLoad: () => void;
  onTitleBlur: () => void;
  onTitleChange: (next: string) => void;
  saveDebounced: (payload: { blocks: unknown[]; markdown: string }) => void;
  setInitialRevision: (
    revision: number | undefined,
    metadata?: Record<string, unknown>,
    workspaceId?: string
  ) => void;
  title: string;
}

function BlockNoteSurface({
  acceptSavedVersion,
  canApplyExternal,
  color,
  conflict,
  conflictDraftReady,
  flushNow,
  initial,
  initialMarkdown,
  isDark,
  latestBlocksRef,
  latestMarkdownRef,
  loadFailed,
  localHttpEndpoint,
  markDirty,
  noteId,
  onExternalTitle,
  onKeepLocal,
  onMarkdownChange,
  onReady,
  onRetryConflictLoad,
  onTitleBlur,
  onTitleChange,
  saveDebounced,
  setInitialRevision,
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
  // Keep the extension and undo history alive across settings changes. AI UI
  // is gated by backend readiness; transport reads the latest endpoint at send time.
  const aiEnabled = Boolean(
    localHttpEndpoint?.aiEnabled && localHttpEndpoint.baseUrl
  );

  const locale = useAppSettingsStore((state) => state.locale);
  const endpointRef = useRef(localHttpEndpoint);
  endpointRef.current = localHttpEndpoint;
  const titleRef = useRef(title);
  titleRef.current = title;
  const [aiPending, setAIPending] = useState(false);
  const [, refreshDictionary] = useState(locale);
  const disposedRef = useRef(false);
  const editor: Editor = useCreateBlockNote({
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
    dictionary: locale === 'zh' ? { ...zh, ai: aiZh } : { ...en, ai: aiEn },
    extensions: [
      AIExtension({
        transport: new DefaultChatTransport({
          fetch: Object.assign(
            (input: RequestInfo | URL, init?: RequestInit) =>
              fetch(input, {
                ...init,
                signal: AbortSignal.any([
                  getAIRequestSignal(editor),
                  ...(init?.signal ? [init.signal] : []),
                ]),
              }),
            { preconnect: fetch.preconnect }
          ),
          prepareSendMessagesRequest: ({ messages, body }) => {
            const endpoint = endpointRef.current;
            if (!(endpoint?.aiEnabled && endpoint.baseUrl)) {
              throw new Error('ghostboard-ai:configuration');
            }
            return {
              api: `${endpoint.baseUrl}/ai/chat`,
              headers: { Authorization: `Bearer ${endpoint.token}` },
              body: {
                ...body,
                messages,
                context: { title: titleRef.current.slice(0, TITLE_MAX_LENGTH) },
              },
            };
          },
        }),
      }),
    ],
  });

  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const titleDirtyRef = useRef(false);
  const applyingExternalRef = useRef(false);
  const externalDocumentRef = useRef<string | null>(null);
  const serializationRef = useRef(0);

  useEffect(() => {
    if (!(noteId && initial.workspaceId)) {
      return;
    }
    const unregister = registerNoteBodyEditor(
      noteId,
      {
        canApply: (snapshot) =>
          !(hasPendingAIChanges(editor) || titleDirtyRef.current) &&
          canApplyExternal(snapshot.revision, {
            before: snapshot.before,
            after: snapshot,
          }),
        apply: (snapshot) => {
          applyingExternalRef.current = true;
          try {
            editor.replaceBlocks(
              editor.document,
              snapshot.blocks as PartialBlock[]
            );
            externalDocumentRef.current = JSON.stringify(editor.document);
            latestBlocksRef.current = editor.document as PartialBlock[];
            latestMarkdownRef.current = snapshot.text;
            setInitialRevision(snapshot.revision, {
              title: snapshot.title,
              color: snapshot.color,
            });
            onExternalTitle(snapshot.title);
          } finally {
            applyingExternalRef.current = false;
          }
        },
      },
      initial.workspaceId
    );
    return unregister;
  }, [
    noteId,
    initial.workspaceId,
    editor,
    canApplyExternal,
    latestBlocksRef,
    latestMarkdownRef,
    setInitialRevision,
    onExternalTitle,
  ]);

  // Report readiness once, a frame after the content is in the DOM, so the
  // focused view can crossfade from its static preview without a jump.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const didSignalReadyRef = useRef(false);
  const signalReady = useCallback(() => {
    if (didSignalReadyRef.current) {
      return;
    }
    didSignalReadyRef.current = true;
    requestAnimationFrame(() => {
      onReadyRef.current?.();
    });
  }, []);

  // If we recovered from markdown (no sidecar yet), import the markdown body
  // once the editor surface mounts.
  const didImportMarkdownRef = useRef(false);
  const importRecoveredMarkdown = useCallback(() => {
    if (didImportMarkdownRef.current) {
      return;
    }
    if (!initial.recoveredFromMarkdown) {
      didImportMarkdownRef.current = true;
      signalReady();
      return;
    }
    if (!effectiveMarkdown.trim()) {
      didImportMarkdownRef.current = true;
      signalReady();
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
      } finally {
        signalReady();
      }
    })();
  }, [
    editor,
    effectiveMarkdown,
    initial.recoveredFromMarkdown,
    latestBlocksRef,
    signalReady,
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

  const serializeCurrentDocument = useCallback(async () => {
    const blocks = editor.document as Block[];
    let markdown = '';
    try {
      markdown = await editor.blocksToMarkdownLossy(blocks);
    } catch (error) {
      console.error('[blocknote] Failed to serialize markdown:', error);
    }
    const serializedBlocks: unknown[] = blocks;
    return { blocks: serializedBlocks, markdown };
  }, [editor]);

  const handleChange = useCallback(async () => {
    if (
      disposedRef.current ||
      hasPendingAIChanges(editor) ||
      applyingExternalRef.current ||
      (externalDocumentRef.current !== null &&
        externalDocumentRef.current === JSON.stringify(editor.document))
    ) {
      return;
    }
    externalDocumentRef.current = null;
    markDirty();
    const version = ++serializationRef.current;
    const payload = await serializeCurrentDocument();
    if (version !== serializationRef.current) {
      return;
    }
    latestMarkdownRef.current = payload.markdown;
    latestBlocksRef.current = payload.blocks as PartialBlock[];
    titleDirtyRef.current = false;
    onMarkdownChange(payload.markdown);
    saveDebounced(payload);
  }, [
    editor,
    markDirty,
    latestBlocksRef,
    latestMarkdownRef,
    onMarkdownChange,
    saveDebounced,
    serializeCurrentDocument,
  ]);

  const handleChangeRef = useRef(handleChange);
  handleChangeRef.current = handleChange;
  useEffect(() => {
    disposedRef.current = false;
    const cleanup = observeAIEditorSession(
      editor,
      () => {
        handleChangeRef.current();
      },
      setAIPending
    );
    return () => {
      disposedRef.current = true;
      cleanup();
    };
  }, [editor]);

  useEffect(() => {
    // Dictionary is a stable object used by BlockNote's components; update its
    // entries without recreating the editor or throwing away undo history.
    Object.assign(
      editor.dictionary,
      locale === 'zh' ? { ...zh, ai: aiZh } : { ...en, ai: aiEn }
    );
    refreshDictionary(locale);
  }, [editor, locale]);

  useEffect(() => {
    if (!aiEnabled) {
      const ai = editor.getExtension(AIExtension);
      if (ai && ai.store.state.aiMenuState !== 'closed') {
        abortAIEditorRequest(editor).catch(() => undefined);
        ai.rejectChanges();
      }
    }
  }, [editor, aiEnabled]);

  const handleTitleChange = useCallback(
    (nextTitle: string) => {
      markDirty();
      titleDirtyRef.current = true;
      onTitleChange(nextTitle);
    },
    [markDirty, onTitleChange]
  );

  const handleUseSavedVersion = useCallback(() => {
    try {
      if (hasPendingAIChanges(editor)) {
        abortAIEditorRequest(editor).catch(() => undefined);
        editor.getExtension(AIExtension)?.rejectChanges();
      }
      acceptSavedVersion((snapshot) => {
        applyingExternalRef.current = true;
        serializationRef.current += 1;
        try {
          editor.replaceBlocks(
            editor.document,
            snapshot.blocks as PartialBlock[]
          );
          externalDocumentRef.current = JSON.stringify(editor.document);
          latestBlocksRef.current = snapshot.blocks as PartialBlock[];
          latestMarkdownRef.current = snapshot.text;
          titleDirtyRef.current = false;
          onExternalTitle(snapshot.title);
          useCanvasStore.setState((state) =>
            applyCanonicalNoteSnapshot(state, snapshot.noteId, {
              blocknoteRevision: snapshot.revision,
              color: snapshot.color,
              content: snapshot.text,
              editor: 'blocknote',
              previewBlocks: snapshot.preview.blocks,
              previewExcerpt: snapshot.preview.excerpt,
              previewHtml: snapshot.preview.html,
              previewVersion: snapshot.preview.version,
              title: snapshot.title,
            })
          );
        } finally {
          applyingExternalRef.current = false;
        }
      });
    } catch (error) {
      console.error('[blocknote] Failed to use saved version:', error);
    }
  }, [
    editor,
    latestBlocksRef,
    latestMarkdownRef,
    onExternalTitle,
    acceptSavedVersion,
  ]);

  const handleBlur = useCallback(() => {
    onTitleBlur();
    if (hasPendingAIChanges(editor)) {
      flushNow();
      return;
    }
    if (!titleDirtyRef.current) {
      flushNow();
      return;
    }

    titleDirtyRef.current = false;
    const version = ++serializationRef.current;
    serializeCurrentDocument()
      .then((payload) => {
        if (version !== serializationRef.current) {
          return;
        }
        latestMarkdownRef.current = payload.markdown;
        latestBlocksRef.current = payload.blocks as PartialBlock[];
        onMarkdownChange(payload.markdown);
        saveDebounced(payload);
        flushNow();
      })
      .catch((error) => {
        console.error('[blocknote] Failed to save title change:', error);
      });
  }, [
    editor,
    flushNow,
    onMarkdownChange,
    onTitleBlur,
    latestBlocksRef,
    latestMarkdownRef,
    saveDebounced,
    serializeCurrentDocument,
  ]);

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
      {conflict ? (
        <NoteConflictBanner
          canKeepLocal={conflictDraftReady && !aiPending}
          conflict={conflict}
          isDark={isDark}
          localText={latestMarkdownRef.current}
          localTitle={title}
          onKeepLocal={onKeepLocal}
          onRetryLoad={onRetryConflictLoad}
          onUseSaved={handleUseSavedVersion}
        />
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
            aria-label={m.a11y_note_title()}
            className={cn(
              'mb-2 block w-full resize-none border-none bg-transparent pl-[54px] font-bold text-4xl leading-tight tracking-normal outline-hidden',
              titlePlaceholderStyle
            )}
            disabled={aiPending}
            maxLength={TITLE_MAX_LENGTH}
            maxRows={4}
            minRows={1}
            onBlur={handleBlur}
            onChange={(event) => handleTitleChange(event.target.value)}
            onKeyDown={handleTitleKeyDown}
            placeholder={m.editor_title_placeholder()}
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
                <AIMenuController aiMenu={EditorAIMenu} />
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
