import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { rpcSaveNote } from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../paraglide/messages.js';

const DEFAULT_NOTE_SAVE_DEBOUNCE_MS = 800;

interface UseNoteSaverOptions {
  debounceMs?: number;
  enabled?: boolean;
  frontmatter: Record<string, unknown>;
  nodeId: string;
  noteId?: unknown;
  /**
   * Called on successful save with the preview metadata updates. When
   * provided, this overrides the default `updateNodeData(nodeId, …)` path,
   * letting folder-child editors route preview metadata back into the owning
   * folder via `updateFolderChildData`.
   */
  onPreviewUpdate?: (updates: Record<string, unknown>) => void;
}

interface PreviewResponse {
  blocks: number;
  excerpt: string;
  html: string;
  version: number;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export function buildTextNoteFrontmatter(
  noteId: string,
  data: Record<string, unknown>,
  title: string
): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {
    id: noteId,
    title,
    displayHint: 'note',
    color: typeof data.color === 'string' ? data.color : '',
  };

  if (typeof data.createdAt === 'string') {
    frontmatter.createdAt = data.createdAt;
  }
  if (isNonEmptyString(data.tag)) {
    frontmatter.tag = data.tag;
  }
  if (isNonEmptyString(data.tagColor)) {
    frontmatter.tagColor = data.tagColor;
  }
  if (Array.isArray(data.tags)) {
    frontmatter.tags = data.tags;
  }

  return frontmatter;
}

const previewToUpdates = (body: string, preview?: PreviewResponse) => ({
  content: body,
  previewBlocks: preview?.blocks,
  previewExcerpt: preview?.excerpt,
  previewHtml: preview?.html,
  previewVersion: preview?.version,
});

export function useNoteSaver({
  debounceMs = DEFAULT_NOTE_SAVE_DEBOUNCE_MS,
  enabled = true,
  frontmatter,
  nodeId,
  noteId,
  onPreviewUpdate,
}: UseNoteSaverOptions) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const updateNodeDataRef = useRef(updateNodeData);
  const onPreviewUpdateRef = useRef(onPreviewUpdate);
  const frontmatterRef = useRef(frontmatter);
  const noteIdRef = useRef(noteId);
  const enabledRef = useRef(enabled);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestBodyRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const changeVersionRef = useRef(0);
  const saveRequestRef = useRef(0);

  useEffect(() => {
    updateNodeDataRef.current = updateNodeData;
  }, [updateNodeData]);

  useEffect(() => {
    onPreviewUpdateRef.current = onPreviewUpdate;
  }, [onPreviewUpdate]);

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
    async (body: string, changeVersion: number) => {
      const currentNoteId = noteIdRef.current;
      if (!(enabledRef.current && isNonEmptyString(currentNoteId))) {
        return;
      }

      const requestId = saveRequestRef.current + 1;
      saveRequestRef.current = requestId;

      try {
        const response = await rpcSaveNote(
          currentNoteId,
          { ...frontmatterRef.current, id: currentNoteId },
          body
        );

        if (
          requestId !== saveRequestRef.current ||
          changeVersion !== changeVersionRef.current ||
          latestBodyRef.current !== body
        ) {
          return;
        }

        if (!response.success) {
          toast.error(m.toast_save_failed());
          return;
        }

        dirtyRef.current = false;
        const updates = previewToUpdates(body, response.preview);
        if (onPreviewUpdateRef.current) {
          onPreviewUpdateRef.current(updates);
        } else {
          updateNodeDataRef.current(nodeId, updates);
        }
      } catch (error) {
        console.error('[note] Failed to save note:', error);
        toast.error(m.toast_save_failed());
      }
    },
    [nodeId]
  );

  const flushNow = useCallback(
    (body?: string) => {
      if (typeof body === 'string') {
        latestBodyRef.current = body;
      }
      if (!dirtyRef.current || latestBodyRef.current === null) {
        clearTimer();
        return;
      }
      clearTimer();
      saveNow(latestBodyRef.current, changeVersionRef.current).catch(
        (error) => {
          console.error('[note] Failed to flush note:', error);
        }
      );
    },
    [clearTimer, saveNow]
  );

  const saveNoteDebounced = useCallback(
    (body: string) => {
      latestBodyRef.current = body;

      if (!(enabledRef.current && isNonEmptyString(noteIdRef.current))) {
        return;
      }

      dirtyRef.current = true;
      changeVersionRef.current += 1;
      const queuedVersion = changeVersionRef.current;
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const latestBody = latestBodyRef.current;
        if (!dirtyRef.current || latestBody === null) {
          return;
        }
        saveNow(latestBody, queuedVersion).catch((error) => {
          console.error('[note] Failed to save queued note:', error);
        });
      }, debounceMs);
    },
    [clearTimer, debounceMs, saveNow]
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

  return { flushNow, saveNoteDebounced };
}
