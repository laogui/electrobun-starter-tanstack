import { useCallback, useEffect, useRef, useState } from 'react';
import { invalidateBlockNotePrefetch } from '@/lib/blockNotePrefetch';
import { registerNoteFlusher } from '@/lib/canvasFlushRegistry';
import {
  hasNoteMetadataConflict,
  subscribeNoteMetadataChanges,
} from '@/lib/noteMetadataProjection';
import { rpcLoadBlockNote, rpcSaveBlockNote } from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';

const DEFAULT_DEBOUNCE_MS = 800;

export type BlockNoteSaveStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error'
  | 'conflict';

interface PreviewResponse {
  blocks: number;
  excerpt: string;
  html: string;
  version: number;
}

export interface BlockNoteConflictSnapshot {
  blocks: unknown[];
  color: string;
  noteId: string;
  preview: PreviewResponse;
  revision: number;
  text: string;
  title: string;
  workspaceId: string;
}

export type BlockNoteSaveConflict =
  | { revision: number; status: 'loading' | 'load-error' }
  | { snapshot: BlockNoteConflictSnapshot; status: 'ready' };

interface UseBlockNoteSaverOptions {
  debounceMs?: number;
  enabled?: boolean;
  /**
   * Note metadata (title / color / displayHint / createdAt) persisted into the
   * BlockNote sidecar note record by the Bun handler. The handler owns
   * revision / preview — do not set them here.
   */
  frontmatter: Record<string, unknown>;
  /** Canvas nodeId the focused editor is editing. */
  nodeId: string;
  noteId: string | undefined;
  /**
   * Optional override for preview metadata updates. When provided, replaces
   * the default `updateNodeData(nodeId, …)` call — used by folder children
   * so previews flow back through `updateFolderChildData`.
   */
  onPreviewUpdate?: (updates: Record<string, unknown>) => void;
  /**
   * Optional callback invoked whenever the save lifecycle transitions between
   * `idle` / `saving` / `saved` / `error`. Used by the focused editor to
   * render a SaveIndicator without having to poll the hook's internals.
   */
  onSaveStatusChange?: (status: BlockNoteSaveStatus) => void;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const previewToUpdates = (
  markdown: string | undefined,
  blocknoteFile: string | undefined,
  revision: number | undefined,
  preview: PreviewResponse | undefined
) => ({
  ...(markdown === undefined ? {} : { content: markdown }),
  blocknoteFile,
  blocknoteRevision: revision,
  editor: 'blocknote',
  previewBlocks: preview?.blocks,
  previewExcerpt: preview?.excerpt,
  previewHtml: preview?.html,
  previewVersion: preview?.version,
});

export interface BlockNoteSavePayload {
  blocks: unknown[];
  markdown?: string;
}

/**
 * Debounced saver for BlockNote documents. Mirrors the Tiptap useNoteSaver
 * lifecycle (blur / hidden / unmount flush) but persists only the JSON
 * sidecar through `rpcSaveBlockNote`.
 */
export function useBlockNoteSaver({
  debounceMs = DEFAULT_DEBOUNCE_MS,
  enabled = true,
  frontmatter,
  nodeId,
  noteId,
  onPreviewUpdate,
  onSaveStatusChange,
}: UseBlockNoteSaverOptions) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const updateNodeDataRef = useRef(updateNodeData);
  const onPreviewUpdateRef = useRef(onPreviewUpdate);
  const onSaveStatusChangeRef = useRef(onSaveStatusChange);
  const frontmatterRef = useRef(frontmatter);
  const previousFrontmatterRef = useRef(frontmatter);
  const noteIdRef = useRef(noteId);
  const enabledRef = useRef(enabled);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPayloadRef = useRef<BlockNoteSavePayload | null>(null);
  const dirtyRef = useRef(false);
  const changeVersionRef = useRef(0);
  const savingRef = useRef(false);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const canvasContextRef = useRef({
    generation: useCanvasStore.getState()._canvasGeneration,
    viewId: useCanvasStore.getState().activeViewId,
  });
  const revisionRef = useRef<number | undefined>(undefined);
  const workspaceIdRef = useRef<string | undefined>(undefined);
  const conflictLoadVersionRef = useRef(0);
  const conflictRef = useRef<BlockNoteSaveConflict | null>(null);
  const [conflict, setConflictState] = useState<BlockNoteSaveConflict | null>(
    null
  );
  const [conflictDraftReady, setConflictDraftReady] = useState(true);
  const lastSavedAtRef = useRef<Date | null>(null);
  const statusRef = useRef<BlockNoteSaveStatus>('idle');

  const setStatus = useCallback((next: BlockNoteSaveStatus) => {
    if (statusRef.current === next) {
      return;
    }
    statusRef.current = next;
    onSaveStatusChangeRef.current?.(next);
  }, []);

  const setConflict = useCallback((next: BlockNoteSaveConflict | null) => {
    conflictRef.current = next;
    setConflictState(next);
  }, []);

  useEffect(() => {
    updateNodeDataRef.current = updateNodeData;
  }, [updateNodeData]);
  useEffect(() => {
    onPreviewUpdateRef.current = onPreviewUpdate;
  }, [onPreviewUpdate]);
  useEffect(() => {
    onSaveStatusChangeRef.current = onSaveStatusChange;
  }, [onSaveStatusChange]);
  useEffect(() => {
    const next = { ...frontmatter };
    // React may render once with new node data but the old title input state.
    // Unchanged props must not undo a synchronous host-event rebase.
    if (noteIdRef.current === noteId) {
      for (const key of ['title', 'color'] as const) {
        if (frontmatter[key] === previousFrontmatterRef.current[key]) {
          next[key] = frontmatterRef.current[key];
        }
      }
    }
    frontmatterRef.current = next;
    previousFrontmatterRef.current = frontmatter;
  }, [frontmatter, noteId]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(
    () =>
      subscribeNoteMetadataChanges((changes) => {
        const conflicts: string[] = [];
        for (const change of changes) {
          if (change.id !== noteIdRef.current || !change.metadataOnly) {
            continue;
          }
          if (hasNoteMetadataConflict(frontmatterRef.current, change)) {
            conflicts.push(change.id);
            if (dirtyRef.current) {
              setStatus('error');
            }
            continue;
          }
          if (revisionRef.current !== change.before.revision) {
            continue;
          }
          revisionRef.current = change.after.revision;
          frontmatterRef.current = {
            ...frontmatterRef.current,
            title: change.after.title,
            color: change.after.color,
          };
        }
        return conflicts;
      }),
    [setStatus]
  );

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const loadConflictSnapshot = useCallback(
    async (currentNoteId: string, revision: number) => {
      const workspaceId = workspaceIdRef.current;
      const version = ++conflictLoadVersionRef.current;
      setConflictDraftReady(latestPayloadRef.current !== null);
      setConflict({ revision, status: 'loading' });
      if (!workspaceId) {
        setConflict({ revision, status: 'load-error' });
        return;
      }
      try {
        const response = await rpcLoadBlockNote(currentNoteId, workspaceId);
        if (
          version !== conflictLoadVersionRef.current ||
          currentNoteId !== noteIdRef.current
        ) {
          return;
        }
        const metadata = response.frontmatter;
        if (
          !response.success ||
          response.workspaceId !== workspaceId ||
          !Array.isArray(response.blocks) ||
          !response.preview ||
          typeof response.text !== 'string' ||
          typeof response.revision !== 'number' ||
          response.revision < revision ||
          !metadata ||
          typeof metadata.title !== 'string' ||
          typeof metadata.color !== 'string'
        ) {
          setConflict({ revision, status: 'load-error' });
          return;
        }
        setConflict({
          status: 'ready',
          snapshot: {
            blocks: response.blocks,
            color: metadata.color,
            noteId: currentNoteId,
            preview: response.preview,
            revision: response.revision,
            text: response.text,
            title: metadata.title,
            workspaceId,
          },
        });
      } catch (error) {
        if (
          version === conflictLoadVersionRef.current &&
          currentNoteId === noteIdRef.current
        ) {
          console.error('[blocknote] Failed to load conflicting note:', error);
          setConflict({ revision, status: 'load-error' });
        }
      }
    },
    [setConflict]
  );

  const performSave = useCallback(async () => {
    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    try {
      while (dirtyRef.current && latestPayloadRef.current) {
        const currentNoteId = noteIdRef.current;
        if (!(enabledRef.current && isNonEmptyString(currentNoteId))) {
          return;
        }
        const payload = latestPayloadRef.current;
        const canvasContext = canvasContextRef.current;
        const changeVersion = changeVersionRef.current;
        setStatus('saving');
        // A prefetched body issued before (or during) this save may carry the
        // pre-save revision; drop it on both edges so a reopen loads fresh.
        invalidateBlockNotePrefetch(currentNoteId);
        const response = await rpcSaveBlockNote(
          currentNoteId,
          frontmatterRef.current,
          payload.blocks,
          payload.markdown,
          revisionRef.current
        ).finally(() => {
          invalidateBlockNotePrefetch(currentNoteId);
        });
        if (currentNoteId !== noteIdRef.current) {
          return;
        }
        if (!response.success) {
          if (response.conflict) {
            const latestRevision =
              typeof response.revision === 'number'
                ? response.revision
                : (revisionRef.current ?? 0);
            setStatus('conflict');
            await loadConflictSnapshot(currentNoteId, latestRevision);
          } else {
            setStatus('error');
          }
          return;
        }
        // Even an obsolete payload committed a revision. The next write must
        // consume that acknowledgement, without replacing newer dirty content.
        if (typeof response.revision === 'number') {
          revisionRef.current = Math.max(
            revisionRef.current ?? 0,
            response.revision
          );
        }
        if (
          changeVersion !== changeVersionRef.current ||
          latestPayloadRef.current !== payload
        ) {
          clearTimer();
          continue;
        }
        dirtyRef.current = false;
        const updates = previewToUpdates(
          payload.markdown,
          response.blocknoteFile,
          revisionRef.current,
          response.preview
        );
        try {
          const state = useCanvasStore.getState();
          const currentCanvas =
            state._canvasGeneration === canvasContext.generation &&
            state.activeViewId === canvasContext.viewId;
          if (currentCanvas && onPreviewUpdateRef.current) {
            onPreviewUpdateRef.current(updates);
          } else if (
            currentCanvas &&
            state.nodes.some(
              (node) => node.id === nodeId && node.data.noteId === currentNoteId
            )
          ) {
            updateNodeDataRef.current(nodeId, updates);
          }
        } catch (updateError) {
          console.error(
            '[blocknote] Failed to apply preview updates:',
            updateError
          );
        }
        lastSavedAtRef.current = new Date();
        setStatus('saved');
      }
    } catch (error) {
      setStatus('error');
      console.error('[blocknote] Failed to save note:', error);
    } finally {
      savingRef.current = false;
    }
  }, [clearTimer, loadConflictSnapshot, nodeId, setStatus]);

  const saveNow = useCallback(() => {
    if (saveInFlightRef.current) {
      return saveInFlightRef.current;
    }
    const pending = performSave().finally(() => {
      if (saveInFlightRef.current === pending) {
        saveInFlightRef.current = null;
      }
    });
    saveInFlightRef.current = pending;
    return pending;
  }, [performSave]);

  useEffect(() => {
    if (!(enabled && noteId)) {
      return;
    }
    return registerNoteFlusher(async () => {
      clearTimer();
      if (conflictRef.current) {
        return false;
      }
      await saveNow();
      return !dirtyRef.current;
    });
  }, [enabled, noteId, clearTimer, saveNow]);

  const flushNow = useCallback(
    (payload?: BlockNoteSavePayload) => {
      if (payload) {
        latestPayloadRef.current = payload;
      }
      if (conflictRef.current) {
        clearTimer();
        return;
      }
      if (!dirtyRef.current || latestPayloadRef.current === null) {
        clearTimer();
        return;
      }
      clearTimer();
      saveNow().catch((error) => {
        console.error('[blocknote] Failed to flush note:', error);
      });
    },
    [clearTimer, saveNow]
  );

  useEffect(() => {
    if (noteIdRef.current === noteId) {
      return;
    }
    // A BlockNoteEditor is normally note-bound and keyed, but flush the old
    // note defensively before resetting refs if a caller reuses the instance.
    flushNow();
    conflictLoadVersionRef.current += 1;
    clearTimer();
    latestPayloadRef.current = null;
    dirtyRef.current = false;
    noteIdRef.current = noteId;
    canvasContextRef.current = {
      generation: useCanvasStore.getState()._canvasGeneration,
      viewId: useCanvasStore.getState().activeViewId,
    };
    revisionRef.current = undefined;
    workspaceIdRef.current = undefined;
    setConflict(null);
    setConflictDraftReady(true);
    setStatus('idle');
  }, [clearTimer, flushNow, noteId, setConflict, setStatus]);

  const saveDebounced = useCallback(
    (payload: BlockNoteSavePayload) => {
      latestPayloadRef.current = payload;
      if (!(enabledRef.current && isNonEmptyString(noteIdRef.current))) {
        return;
      }
      dirtyRef.current = true;
      changeVersionRef.current += 1;
      clearTimer();
      if (conflictRef.current) {
        setConflictDraftReady(true);
        return;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const latest = latestPayloadRef.current;
        if (!(dirtyRef.current && latest)) {
          return;
        }
        saveNow().catch((error) => {
          console.error('[blocknote] Failed to save queued note:', error);
        });
      }, debounceMs);
    },
    [clearTimer, debounceMs, saveNow]
  );

  // Protect edits before asynchronous document serialization has completed.
  const markDirty = useCallback(() => {
    latestPayloadRef.current = null;
    dirtyRef.current = true;
    changeVersionRef.current += 1;
    if (conflictRef.current) {
      setConflictDraftReady(false);
    }
  }, []);
  const canApplyExternal = useCallback(
    (
      revision: number,
      metadata?: {
        before: { title: string; color: string };
        after: { title: string; color: string };
      }
    ) =>
      !(dirtyRef.current || savingRef.current) &&
      revisionRef.current !== undefined &&
      revision >= revisionRef.current &&
      (!metadata ||
        (['title', 'color'] as const).every(
          (key) =>
            frontmatterRef.current[key] === metadata.before[key] ||
            frontmatterRef.current[key] === metadata.after[key]
        )),
    []
  );

  const setInitialRevision = useCallback(
    (
      revision: number | undefined,
      metadata?: Record<string, unknown>,
      workspaceId?: string
    ) => {
      revisionRef.current = revision;
      if (workspaceId !== undefined) {
        workspaceIdRef.current = workspaceId;
      }
      if (metadata) {
        frontmatterRef.current = { ...frontmatterRef.current, ...metadata };
      }
    },
    []
  );

  const retryConflictLoad = useCallback(() => {
    const current = conflictRef.current;
    const currentNoteId = noteIdRef.current;
    if (!(current && currentNoteId)) {
      return;
    }
    const revision =
      current.status === 'ready' ? current.snapshot.revision : current.revision;
    loadConflictSnapshot(currentNoteId, revision).catch((error) => {
      console.error('[blocknote] Failed to retry conflict load:', error);
    });
  }, [loadConflictSnapshot]);

  const keepLocalVersion = useCallback(async () => {
    const current = conflictRef.current;
    if (current?.status !== 'ready' || !latestPayloadRef.current) {
      return;
    }
    conflictLoadVersionRef.current += 1;
    revisionRef.current = current.snapshot.revision;
    setConflict(null);
    setConflictDraftReady(true);
    await saveNow();
  }, [saveNow, setConflict]);

  const acceptSavedVersion = useCallback(
    (apply: (snapshot: BlockNoteConflictSnapshot) => void) => {
      const current = conflictRef.current;
      if (current?.status !== 'ready') {
        return;
      }
      apply(current.snapshot);
      conflictLoadVersionRef.current += 1;
      clearTimer();
      changeVersionRef.current += 1;
      dirtyRef.current = false;
      latestPayloadRef.current = null;
      revisionRef.current = current.snapshot.revision;
      frontmatterRef.current = {
        ...frontmatterRef.current,
        title: current.snapshot.title,
        color: current.snapshot.color,
      };
      setConflict(null);
      setConflictDraftReady(true);
      setStatus('idle');
    },
    [clearTimer, setConflict, setStatus]
  );

  useEffect(() => {
    const handleWindowBlur = () => {
      flushNow();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushNow();
      }
    };
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [flushNow]);

  useEffect(
    () => () => {
      conflictLoadVersionRef.current += 1;
      flushNow();
    },
    [flushNow]
  );

  return {
    acceptSavedVersion,
    flushNow,
    markDirty,
    canApplyExternal,
    conflict,
    conflictDraftReady,
    keepLocalVersion,
    retryConflictLoad,
    saveDebounced,
    setInitialRevision,
    status: statusRef.current,
    lastSavedAt: lastSavedAtRef.current,
  };
}
