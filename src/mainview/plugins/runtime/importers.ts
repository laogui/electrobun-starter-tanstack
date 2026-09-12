import type {
  ImporterParseResult,
  NoteContentCreate,
  PluginFileHandle,
} from '../../../../packages/plugin-sdk';

const MAX_IMPORT_NOTES = 100;
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

export interface ImporterSessionSnapshot {
  readonly canCancel: boolean;
  readonly canConfirm: boolean;
  readonly error: string | null;
  readonly file: PluginFileHandle | null;
  readonly importerId: string;
  readonly importerTitle: string;
  readonly notes: readonly ImporterPreviewNote[];
  readonly operationId: string;
  readonly pluginId: string;
  readonly status:
    | 'selecting'
    | 'parsing'
    | 'preview'
    | 'committing'
    | 'failed';
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

export function validateImporterParseResult(
  value: unknown
): Readonly<ImporterParseResult> & {
  readonly notes: readonly ImporterPreviewNote[];
} {
  const result = record(value);
  if (
    !result ||
    Object.keys(result).some((key) => !['notes', 'warnings'].includes(key)) ||
    !Array.isArray(result.notes) ||
    result.notes.length < 1 ||
    result.notes.length > MAX_IMPORT_NOTES ||
    !Array.isArray(result.warnings) ||
    result.warnings.length > MAX_WARNINGS ||
    result.warnings.some(
      (warning) =>
        typeof warning !== 'string' || warning.length > MAX_WARNING_LENGTH
    )
  ) {
    throw new Error(
      'Importer must return 1–100 notes and a bounded warnings array'
    );
  }
  return Object.freeze({
    notes: Object.freeze(result.notes.map(validateNote)),
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
