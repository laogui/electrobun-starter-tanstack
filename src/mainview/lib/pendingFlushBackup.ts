import type { Edge, Node } from '@xyflow/react';
import type { CanvasViewport } from '@/store/canvasStore';
import { isRecoveryGraph } from '../../shared/canvasRecovery';

/**
 * Last-gasp crash/quit safety net for canvas persistence.
 *
 * The debounced manifest flush is asynchronous, so edits made in the final
 * seconds before the window closes can miss the disk. `beforeunload` handlers
 * cannot await RPC — but they CAN write to localStorage synchronously. The
 * persistence hook stamps a backup here on unload while dirty; the next
 * launch offers it for recovery after source/version checks and confirmation.
 * Recovery evidence is retained independently of the rolling pending slot.
 */
const KEY_PREFIX = 'ghostboard.v1.pendingFlush.';
const LEGACY_KEY_PREFIX = ['ghostboard', 'pendingFlush', ''].join('.');

export interface PendingFlushBackup {
  /** Disk graph observed before these unsaved edits. Absent in old backups. */
  baseGraph?: string;
  edges: Edge[];
  nodes: Node[];
  savedAt: number;
  /** @deprecated Viewport is session-only; ignored on restore. */
  viewport?: CanvasViewport | null;
  workspacePath?: string;
}

function keyFor(viewId: string): string {
  return `${KEY_PREFIX}${viewId}`;
}

function legacyKeyFor(viewId: string): string {
  return `${LEGACY_KEY_PREFIX}${viewId}`;
}

/** Retain recovery evidence independently of the rolling pending-save slot. */
export function archivePendingFlushBackup(
  viewId: string,
  backup: PendingFlushBackup
): void {
  const raw = JSON.stringify({ ...backup, viewId });
  let key = `${KEY_PREFIX}archive.${viewId}.${backup.savedAt}`;
  const previous = localStorage.getItem(key);
  if (previous && previous !== raw) {
    key += `.${crypto.randomUUID()}`;
  }
  localStorage.setItem(key, raw);
}

export function writePendingFlushBackup(
  viewId: string,
  payload: Omit<PendingFlushBackup, 'savedAt'>
): void {
  try {
    const previous = readPendingFlushBackup(viewId);
    if (previous) {
      archivePendingFlushBackup(viewId, previous);
    }
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

export interface RecoveryArchiveEntry {
  backup: PendingFlushBackup | null;
  key: string;
  raw: string;
  viewId: string;
}

/** Enumerate evidence without deleting invalid or legacy records. */
export function listRecoveryArchives(): RecoveryArchiveEntry[] {
  const entries: RecoveryArchiveEntry[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (
      !(
        key &&
        (key.startsWith(KEY_PREFIX) || key.startsWith(LEGACY_KEY_PREFIX))
      )
    ) {
      continue;
    }
    const raw = localStorage.getItem(key);
    if (!raw) {
      continue;
    }
    const archived = key.startsWith(`${KEY_PREFIX}archive.`);
    const tail = key.slice(
      archived
        ? `${KEY_PREFIX}archive.`.length
        : key.startsWith(KEY_PREFIX)
          ? KEY_PREFIX.length
          : LEGACY_KEY_PREFIX.length
    );
    let viewId = archived ? tail.slice(0, tail.lastIndexOf('.')) : tail;
    let backup: PendingFlushBackup | null = null;
    try {
      const parsed = JSON.parse(raw) as Partial<PendingFlushBackup> & {
        viewId?: unknown;
      };
      if (archived && typeof parsed?.viewId === 'string') {
        viewId = parsed.viewId;
      }
      const savedAt = parsed.savedAt;
      const workspacePath = parsed.workspacePath;
      const baseGraph = parsed.baseGraph;
      if (
        isRecoveryGraph(parsed) &&
        typeof savedAt === 'number' &&
        Number.isFinite(savedAt)
      ) {
        backup = {
          nodes: parsed.nodes,
          edges: parsed.edges,
          savedAt,
          workspacePath,
          baseGraph,
        };
      }
    } catch {
      /* Keep raw evidence for export. */
    }
    entries.push({ key, viewId, raw, backup });
  }
  return entries.sort(
    (a, b) => (b.backup?.savedAt ?? 0) - (a.backup?.savedAt ?? 0)
  );
}

export function deleteRecoveryArchive(entry: RecoveryArchiveEntry): boolean {
  if (
    !(
      entry.key.startsWith(KEY_PREFIX) ||
      entry.key.startsWith(LEGACY_KEY_PREFIX)
    ) ||
    localStorage.getItem(entry.key) !== entry.raw
  ) {
    return false;
  }
  localStorage.removeItem(entry.key);
  return true;
}
