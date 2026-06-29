import { useCallback, useEffect, useRef } from 'react';

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
  const noteIdRef = useRef(noteId);
  const enabledRef = useRef(enabled);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPayloadRef = useRef<BlockNoteSavePayload | null>(null);
  const dirtyRef = useRef(false);
  const changeVersionRef = useRef(0);
  const saveRequestRef = useRef(0);
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
    frontmatterRef.current = frontmatter;
  }, [frontmatter]);
  useEffect(() => {
    noteIdRef.current = noteId;
  }, [noteId]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const saveNow = useCallback(
    async (payload: BlockNoteSavePayload, changeVersion: number) => {
      const currentNoteId = noteIdRef.current;
      if (!(enabledRef.current && isNonEmptyString(currentNoteId))) {
        return;
      }
      const requestId = saveRequestRef.current + 1;
      saveRequestRef.current = requestId;

      setStatus('saving');

      try {
        // The stale-request guard below needs the response and request ordering after this save settles.
        // react-doctor-disable-next-line react-doctor/async-defer-await
        const response = await rpcSaveBlockNote(
          currentNoteId,
          frontmatterRef.current,
          payload.blocks,
          payload.markdown,
          revisionRef.current
        );

        if (
          requestId !== saveRequestRef.current ||
          changeVersion !== changeVersionRef.current ||
          latestPayloadRef.current !== payload
        ) {
          return;
        }

        if (!response.success) {
          setStatus('error');
          return;
        }

        if (typeof response.revision === 'number') {
          revisionRef.current = response.revision;
        }
        dirtyRef.current = false;

        const updates = previewToUpdates(
          payload.markdown,
          response.blocknoteFile,
          response.revision,
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
      } catch (error) {
        if (
          requestId === saveRequestRef.current &&
          changeVersion === changeVersionRef.current
        ) {
          setStatus('error');
        }
        console.error('[blocknote] Failed to save note:', error);
      }
    },
    [nodeId, setStatus]
  );

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
      saveNow(latestPayloadRef.current, changeVersionRef.current).catch(
        (error) => {
          console.error('[blocknote] Failed to flush note:', error);
        }
      );
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
      const queuedVersion = changeVersionRef.current;
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const latest = latestPayloadRef.current;
        if (!(dirtyRef.current && latest)) {
          return;
        }
        saveNow(latest, queuedVersion).catch((error) => {
          console.error('[blocknote] Failed to save queued note:', error);
        });
      }, debounceMs);
    },
    [clearTimer, debounceMs, saveNow]
  );

  const setInitialRevision = useCallback((revision: number | undefined) => {
    revisionRef.current = revision;
  }, []);

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
    saveDebounced,
    setInitialRevision,
    status: statusRef.current,
    lastSavedAt: lastSavedAtRef.current,
  };
}
