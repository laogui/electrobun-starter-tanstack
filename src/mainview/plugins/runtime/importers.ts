import type {
  ImporterFieldInspection,
  ImporterFieldMapping,
  ImporterNoteField,
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
const MAX_SOURCE_FIELDS = 100;
const MAX_SOURCE_FIELD_LENGTH = 128;

export type ImporterPlacementStrategy = 'grid' | 'vertical';

export interface ImporterPlacementConfiguration {
  readonly mode: 'canvas' | 'detached';
  readonly strategy: ImporterPlacementStrategy;
  readonly viewId: string | null;
}

export interface ImporterPlacementTarget {
  readonly id: string;
  readonly name: string;
}

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
  readonly canPrepare: boolean;
  readonly canRollback: boolean;
  readonly completedNotes: number;
  readonly error: string | null;
  readonly file: PluginFileHandle | null;
  readonly importerId: string;
  readonly importerTitle: string;
  readonly mapping: ImporterFieldMapping | null;
  readonly notes: readonly ImporterPreviewNote[];
  readonly operationId: string;
  readonly placement: ImporterPlacementConfiguration;
  readonly placementTargets: readonly ImporterPlacementTarget[];
  readonly pluginId: string;
  readonly segments: readonly ImporterSessionSegmentSnapshot[];
  readonly sourceFields: readonly string[];
  readonly status:
    | 'selecting'
    | 'configuring'
    | 'parsing'
    | 'preview'
    | 'committing'
    | 'placing'
    | 'placement-failed'
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

const NOTE_FIELDS: readonly ImporterNoteField[] = ['title', 'text', 'color'];

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function validateImporterFieldInspection(value: unknown): {
  readonly fields: readonly string[];
  readonly mapping: ImporterFieldMapping;
} {
  const inspection = record(value) as
    | (Record<string, unknown> & Partial<ImporterFieldInspection>)
    | null;
  if (
    !inspection ||
    Object.keys(inspection).some(
      (key) => !['fields', 'suggestedMapping'].includes(key)
    ) ||
    !Array.isArray(inspection.fields) ||
    inspection.fields.length < 1 ||
    inspection.fields.length > MAX_SOURCE_FIELDS ||
    inspection.fields.some(
      (field) =>
        typeof field !== 'string' ||
        !field.trim() ||
        field.length > MAX_SOURCE_FIELD_LENGTH
    )
  ) {
    throw new Error('Importer field inspection must return 1–100 fields');
  }
  const fields = Object.freeze(inspection.fields.map((field) => field.trim()));
  if (new Set(fields).size !== fields.length) {
    throw new Error('Importer field inspection returned duplicate fields');
  }
  const suggested = inspection.suggestedMapping;
  if (
    suggested !== undefined &&
    (!record(suggested) ||
      Object.keys(suggested).some(
        (key) => !NOTE_FIELDS.includes(key as ImporterNoteField)
      ))
  ) {
    throw new Error('Importer returned an invalid suggested field mapping');
  }
  const defaultFor = (target: ImporterNoteField): string | null => {
    const value = suggested?.[target];
    if (value !== undefined) {
      if (
        !(
          value === null ||
          (typeof value === 'string' && fields.includes(value))
        )
      ) {
        throw new Error('Importer suggested an unavailable source field');
      }
      return value;
    }
    return fields.includes(target) ? target : null;
  };
  return Object.freeze({
    fields,
    mapping: Object.freeze({
      color: defaultFor('color'),
      text: defaultFor('text'),
      title: defaultFor('title'),
    }),
  });
}

export function validateImporterFieldMapping(
  value: ImporterFieldMapping,
  fields: readonly string[]
): ImporterFieldMapping {
  if (
    !value ||
    Object.keys(value).length !== NOTE_FIELDS.length ||
    NOTE_FIELDS.some((target) => {
      const source = value[target];
      return !(source === null || fields.includes(source));
    }) ||
    value.title === null
  ) {
    throw new Error('Title must map to one available source field');
  }
  const selected = NOTE_FIELDS.flatMap((target) =>
    value[target] === null ? [] : [value[target]]
  );
  if (new Set(selected).size !== selected.length) {
    throw new Error('Each source field can map to at most one Note field');
  }
  return Object.freeze({ ...value });
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
