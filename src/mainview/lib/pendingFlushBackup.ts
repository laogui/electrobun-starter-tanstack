import type { Edge, Node } from '@xyflow/react';

import type { CanvasViewport } from '@/store/canvasStore';

/**
 * Last-gasp crash/quit safety net for canvas persistence.
 *
 * The debounced manifest flush is asynchronous, so edits made in the final
 * seconds before the window closes can miss the disk. `beforeunload` handlers
 * cannot await RPC — but they CAN write to localStorage synchronously. The
 * persistence hook stamps a backup here on unload while dirty; the next
 * launch restores it (it is by construction newer than the manifest, because
 * every successful flush clears it) and then persists + clears it.
 */
const KEY_PREFIX = 'ghostboard.v1.pendingFlush.';
const LEGACY_KEY_PREFIX = ['ghostboard', 'pendingFlush', ''].join('.');

export interface PendingFlushBackup {
  edges: Edge[];
  nodes: Node[];
  savedAt: number;
  /** @deprecated Viewport is session-only; ignored on restore. */
  viewport?: CanvasViewport | null;
}

function keyFor(viewId: string): string {
  return `${KEY_PREFIX}${viewId}`;
}

function legacyKeyFor(viewId: string): string {
  return `${LEGACY_KEY_PREFIX}${viewId}`;
}

export function writePendingFlushBackup(
  viewId: string,
  payload: Omit<PendingFlushBackup, 'savedAt'>
): void {
  try {
    localStorage.setItem(
      keyFor(viewId),
      JSON.stringify({ ...payload, savedAt: Date.now() })
    );
  } catch {
    // Quota exceeded / private mode — the async flush remains the only path.
  }
}

/**
 * Read and validate the backup for `viewId`. Corrupted payloads are cleared
 * and reported as missing so a bad write can never wedge startup.
 */
export function readPendingFlushBackup(
  viewId: string
): PendingFlushBackup | null {
  try {
    const raw =
      localStorage.getItem(keyFor(viewId)) ??
      localStorage.getItem(legacyKeyFor(viewId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PendingFlushBackup;
    if (!(Array.isArray(parsed?.nodes) && Array.isArray(parsed?.edges))) {
      clearPendingFlushBackup(viewId);
      return null;
    }
    return parsed;
  } catch {
    clearPendingFlushBackup(viewId);
    return null;
  }
}

export function clearPendingFlushBackup(viewId: string): void {
  try {
    localStorage.removeItem(keyFor(viewId));
    localStorage.removeItem(legacyKeyFor(viewId));
  } catch {
    // Ignore storage failures.
  }
}
