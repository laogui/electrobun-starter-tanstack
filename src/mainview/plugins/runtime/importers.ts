import type {
  NoteContentCreate,
  PluginFileHandle,
} from '../../../../packages/plugin-sdk';

const MAX_IMPORT_NOTES = 100;
const MAX_IMPORT_PREVIEW_BYTES = 16 * 1024 * 1024;
const MAX_IMPORT_SEGMENTS = 50;
const MAX_IMPORT_TOTAL_NOTES = MAX_IMPORT_NOTES * MAX_IMPORT_SEGMENTS;
const MAX_NOTE_BODY_BYTES = 256 * 1024;
const MAX_NOTE_COLOR_LENGTH = 64;
const MAX_NOTE_TITLE_LENGTH = 256;
const MAX_WARNINGS = 100;
const MAX_WARNING_LENGTH = 1024;

export interface ImporterPreviewNote {
  readonly color: string;
  readonly text: string;
  readonly title: string;
}

export interface ImporterPreviewSegment {
  readonly end: number;
  readonly notes: readonly ImporterPreviewNote[];
  readonly start: number;
}

export interface ImporterSessionSegmentSnapshot {
  readonly end: number;
  readonly error: string | null;
  readonly index: number;
  readonly operationId: string;
  readonly start: number;
  readonly status:
    | 'pending'
    | 'committing'
    | 'completed'
    | 'failed'
    | 'rolling-back'
    | 'rolled-back'
    | 'rollback-conflict'
    | 'rollback-failed';
}

export interface ImporterSessionSnapshot {
  readonly canCancel: boolean;
  readonly canConfirm: boolean;
  readonly canRollback: boolean;
  readonly completedNotes: number;
  readonly error: string | null;
  readonly file: PluginFileHandle | null;
  readonly importerId: string;
  readonly importerTitle: string;
  readonly notes: readonly ImporterPreviewNote[];
  readonly operationId: string;
  readonly pluginId: string;
  readonly segments: readonly ImporterSessionSegmentSnapshot[];
  readonly status:
    | 'selecting'
    | 'parsing'
    | 'preview'
    | 'committing'
    | 'failed'
    | 'completed'
    | 'rolling-back'
    | 'rollback-failed'
    | 'rollback-conflict'
    | 'rolled-back';
  readonly totalNotes: number;
  readonly warnings: readonly string[];
  readonly workspaceId: string;
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function validateNote(value: unknown, index: number): ImporterPreviewNote {
  const note = record(value);
  if (
    !note ||
    Object.keys(note).some(
      (key) => !['color', 'text', 'title'].includes(key)
    ) ||
    typeof note.title !== 'string' ||
    !note.title.trim() ||
    note.title.length > MAX_NOTE_TITLE_LENGTH ||
    (note.color !== undefined && typeof note.color !== 'string') ||
    (note.text !== undefined && typeof note.text !== 'string')
  ) {
    throw new Error(`Importer returned an invalid note at row ${index + 1}`);
  }
  const color = note.color ?? '';
  const text = (note.text ?? '').replace(/\r\n?/g, '\n');
  if (
    color.length > MAX_NOTE_COLOR_LENGTH ||
    new TextEncoder().encode(text).byteLength > MAX_NOTE_BODY_BYTES
  ) {
    throw new Error(`Importer returned an oversized note at row ${index + 1}`);
  }
  return Object.freeze({ color, text, title: note.title });
}

function previewBytes(notes: readonly ImporterPreviewNote[]): number {
  const encoder = new TextEncoder();
  return notes.reduce(
    (total, note) =>
      total +
      encoder.encode(note.title).byteLength +
      encoder.encode(note.text).byteLength +
      encoder.encode(note.color).byteLength,
    0
  );
}

export function validateImporterParseResult(value: unknown): {
  readonly notes: readonly ImporterPreviewNote[];
  readonly segmented: boolean;
  readonly segments: readonly ImporterPreviewSegment[];
  readonly warnings: readonly string[];
} {
  const result = record(value);
  const commonInvalid =
    !(result && Array.isArray(result.warnings)) ||
    result.warnings.length > MAX_WARNINGS ||
    result.warnings.some(
      (warning) =>
        typeof warning !== 'string' || warning.length > MAX_WARNING_LENGTH
    );
  if (
    commonInvalid ||
    Object.keys(result).some(
      (key) => !['notes', 'segments', 'warnings'].includes(key)
    ) ||
    'notes' in result === 'segments' in result
  ) {
    throw new Error(
      'Importer must return either notes or explicit segments and a bounded warnings array'
    );
  }
  if ('notes' in result) {
    if (
      !Array.isArray(result.notes) ||
      result.notes.length < 1 ||
      result.notes.length > MAX_IMPORT_NOTES
    ) {
      throw new Error('Importer must return 1–100 notes');
    }
    const notes = Object.freeze(result.notes.map(validateNote));
    return Object.freeze({
      notes,
      segmented: false,
      segments: Object.freeze([
        Object.freeze({ end: notes.length, notes, start: 1 }),
      ]),
      warnings: Object.freeze([...(result.warnings as string[])]),
    });
  }
  if (
    !Array.isArray(result.segments) ||
    result.segments.length < 2 ||
    result.segments.length > MAX_IMPORT_SEGMENTS
  ) {
    throw new Error(
      `Segmented import requires 2–${MAX_IMPORT_SEGMENTS} segments`
    );
  }
  let offset = 0;
  const segments = result.segments.map((rawSegment) => {
    const segment = record(rawSegment);
    if (
      !segment ||
      Object.keys(segment).some((key) => key !== 'notes') ||
      !Array.isArray(segment.notes) ||
      segment.notes.length < 1 ||
      segment.notes.length > MAX_IMPORT_NOTES
    ) {
      throw new Error('Each import segment must contain 1–100 notes');
    }
    const notes = Object.freeze(
      segment.notes.map((note, index) => validateNote(note, offset + index))
    );
    const start = offset + 1;
    offset += notes.length;
    return Object.freeze({ end: offset, notes, start });
  });
  if (offset <= MAX_IMPORT_NOTES || offset > MAX_IMPORT_TOTAL_NOTES) {
    throw new Error(
      `Segmented import must contain 101–${MAX_IMPORT_TOTAL_NOTES} notes`
    );
  }
  const notes = Object.freeze(segments.flatMap((segment) => segment.notes));
  if (previewBytes(notes) > MAX_IMPORT_PREVIEW_BYTES) {
    throw new Error('Segmented import preview exceeds 16 MiB');
  }
  return Object.freeze({
    notes,
    segmented: true,
    segments: Object.freeze(segments),
    warnings: Object.freeze([...(result.warnings as string[])]),
  });
}

export function importerAbortError(): DOMException {
  return new DOMException('Importer session aborted', 'AbortError');
}

export async function raceImporterAbort<T>(
  work: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) {
    throw importerAbortError();
  }
  let rejectAbort!: (reason: unknown) => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => rejectAbort(importerAbortError());
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    return await Promise.race([work, aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

export function notesForCommit(
  notes: readonly ImporterPreviewNote[]
): NoteContentCreate[] {
  return notes.map((note) => ({ ...note }));
}
