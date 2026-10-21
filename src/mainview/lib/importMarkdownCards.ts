import type { Node } from '@xyflow/react';
import { toast } from 'sonner';

import { hasNodeQuota } from '@/lib/nodeQuota';
import { type CreateNodeOptions, useCanvasStore } from '@/store/canvasStore';

import * as m from '../../paraglide/messages.js';

export interface ImportedMarkdownNote {
  content?: string;
  noteId: string;
  title: string;
}

export interface ImportMarkdownRpcResult {
  canceled?: boolean;
  failedCount?: number;
  notes: ImportedMarkdownNote[];
}

export function importedNoteCardData(
  note: ImportedMarkdownNote
): Record<string, unknown> {
  return {
    color: '#FFFFFF',
    content: note.content,
    noteId: note.noteId,
    title: note.title,
    type: 'text',
  };
}

export interface MarkdownImportQuotaOptions {
  /** Live node list; defaults to the canvas store. */
  getNodes?: () => Node[];
  /** Quota check; defaults to the shared free-tier gate in nodeQuota.ts. */
  hasQuota?: (nodes: Node[], additional: number) => Promise<boolean>;
}

/**
 * Show import toasts and invoke the caller's card-placement callback for each
 * imported note. Returns true when at least one card was placed.
 *
 * The whole batch is checked against the free-tier node quota up front
 * (every imported note becomes one counted card). Placing cards one by one
 * would otherwise race per-card checks against the same pre-import node
 * count and let a large import exceed the limit. When the quota refuses,
 * nothing is placed; the imported notes remain in the notes library.
 */
export async function handleMarkdownImportResult(
  result: ImportMarkdownRpcResult | null,
  placeNotes: (notes: ImportedMarkdownNote[]) => void | Promise<void>,
  options: MarkdownImportQuotaOptions = {}
): Promise<boolean> {
  if (!result) {
    toast.error(m.toast_markdown_import_failed());
    return false;
  }
  if (result.canceled) {
    return false;
  }

  const notes = result.notes;
  const failedCount = result.failedCount ?? 0;

  if (notes.length === 0) {
    toast.error(m.toast_markdown_import_failed());
    return false;
  }

  const getNodes = options.getNodes ?? (() => useCanvasStore.getState().nodes);
  const hasQuota = options.hasQuota ?? hasNodeQuota;
  if (!(await hasQuota(getNodes(), notes.length))) {
    return false;
  }

  await placeNotes(notes);

  if (failedCount > 0) {
    toast(
      m.toast_markdown_import_partial({
        failed: failedCount,
        imported: notes.length,
      })
    );
  } else {
    toast(m.toast_markdown_imported({ count: notes.length }));
  }

  return true;
}

export function buildImportedCardCreateOptions(
  note: ImportedMarkdownNote,
  index: number,
  total: number,
  anchorCenter?: { x: number; y: number }
): CreateNodeOptions {
  return {
    ...(anchorCenter ? { anchorCenter } : {}),
    data: importedNoteCardData(note),
    focusViewport: index === total - 1,
  };
}
