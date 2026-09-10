import { useCallback, useEffect, useRef } from 'react';

import {
  hasNoteMetadataConflict,
  subscribeNoteMetadataChanges,
} from '@/lib/noteMetadataProjection';
import { rpcSaveBlockNote } from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';

const DEFAULT_DEBOUNCE_MS = 800;

export type BlockNoteSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface PreviewResponse {
  blocks: number;
  excerpt: string;
  html: string;
  version: number;
}

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
  markdown: string,
  blocknoteFile: string | undefined,
  revision: number | undefined,
  preview: PreviewResponse | undefined
) => ({
  content: markdown,
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
  markdown: string;
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
  const revisionRef = useRef<number | undefined>(undefined);
  const lastSavedAtRef = useRef<Date | null>(null);
  const statusRef = useRef<BlockNoteSaveStatus>('idle');

  const setStatus = useCallback((next: BlockNoteSaveStatus) => {
    if (statusRef.current === next) {
      return;
    }
    statusRef.current = next;
    onSaveStatusChangeRef.current?.(next);
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
    noteIdRef.current = noteId;
  }, [noteId]);
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

  const saveNow = useCallback(async () => {
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
        const changeVersion = changeVersionRef.current;
        setStatus('saving');
        const response = await rpcSaveBlockNote(
          currentNoteId,
          frontmatterRef.current,
          payload.blocks,
          payload.markdown,
          revisionRef.current
        );
        if (currentNoteId !== noteIdRef.current) {
          return;
        }
        if (!response.success) {
          setStatus('error');
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
          if (onPreviewUpdateRef.current) {
            onPreviewUpdateRef.current(updates);
          } else {
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
  }, [clearTimer, nodeId, setStatus]);

  const flushNow = useCallback(
    (payload?: BlockNoteSavePayload) => {
      if (payload) {
        latestPayloadRef.current = payload;
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

  const saveDebounced = useCallback(
    (payload: BlockNoteSavePayload) => {
      latestPayloadRef.current = payload;
      if (!(enabledRef.current && isNonEmptyString(noteIdRef.current))) {
        return;
      }
      dirtyRef.current = true;
      changeVersionRef.current += 1;
      clearTimer();
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
    (revision: number | undefined, metadata?: Record<string, unknown>) => {
      revisionRef.current = revision;
      if (metadata) {
        frontmatterRef.current = { ...frontmatterRef.current, ...metadata };
      }
    },
    []
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
      flushNow();
    },
    [flushNow]
  );

  return {
    flushNow,
    markDirty,
    canApplyExternal,
    saveDebounced,
    setInitialRevision,
    status: statusRef.current,
    lastSavedAt: lastSavedAtRef.current,
  };
}
