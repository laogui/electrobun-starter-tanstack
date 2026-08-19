import { isCanvasTypeId, isInstanceId } from './ids';
import {
  type ExtensionPresentation,
  sanitizePresentation,
} from './presentation';

export const EXTENSION_INSTANCE_SCHEMA =
  'ghostboard-extension-instance/v1' as const;

export const INSTANCE_JSON_MAX_BYTES = 1024 * 1024;

const KNOWN_ENVELOPE_KEYS = new Set([
  'schema',
  'id',
  'canvasTypeId',
  'appVersion',
  'dataVersion',
  'revision',
  'createdAt',
  'updatedAt',
  'state',
  'presentation',
]);

export interface ExtensionInstanceRecord {
  appVersion: string;
  canvasTypeId: string;
  createdAt: string;
  dataVersion: number;
  id: string;
  presentation: ExtensionPresentation;
  revision: number;
  schema: typeof EXTENSION_INSTANCE_SCHEMA;
  state: unknown;
  updatedAt: string;
}

export interface ExtensionInstanceLoadError {
  error: 'missing' | 'corrupted';
  id: string;
}

export interface ParsedExtensionInstance {
  extras: Record<string, unknown>;
  record: ExtensionInstanceRecord;
}

export function isExtensionInstanceLoadError(
  value: ExtensionInstanceRecord | ExtensionInstanceLoadError | undefined
): value is ExtensionInstanceLoadError {
  return !!value && 'error' in value;
}

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

export function parseExtensionInstanceRecord(
  input: unknown
): ParsedExtensionInstance | ExtensionInstanceLoadError {
  if (!isStringRecord(input)) {
    return { id: 'unknown', error: 'corrupted' };
  }

  const id = input.id;
  if (typeof id !== 'string' || !isInstanceId(id)) {
    return { id: typeof id === 'string' ? id : 'unknown', error: 'corrupted' };
  }

  if (input.schema !== EXTENSION_INSTANCE_SCHEMA) {
    return { id, error: 'corrupted' };
  }

  if (
    typeof input.canvasTypeId !== 'string' ||
    !isCanvasTypeId(input.canvasTypeId)
  ) {
    return { id, error: 'corrupted' };
  }

  if (typeof input.appVersion !== 'string' || !input.appVersion) {
    return { id, error: 'corrupted' };
  }

  if (!isFiniteInteger(input.dataVersion) || input.dataVersion < 1) {
    return { id, error: 'corrupted' };
  }

  if (!isFiniteInteger(input.revision) || input.revision < 1) {
    return { id, error: 'corrupted' };
  }

  if (
    typeof input.createdAt !== 'string' ||
    typeof input.updatedAt !== 'string'
  ) {
    return { id, error: 'corrupted' };
  }

  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!KNOWN_ENVELOPE_KEYS.has(key)) {
      extras[key] = value;
    }
  }

  return {
    extras,
    record: {
      schema: EXTENSION_INSTANCE_SCHEMA,
      id,
      canvasTypeId: input.canvasTypeId,
      appVersion: input.appVersion,
      dataVersion: input.dataVersion,
      revision: input.revision,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      state: input.state,
      presentation: sanitizePresentation(input.presentation),
    },
  };
}

/** Merge envelope + unknown fields so extras survive a later write. */
export function serializeExtensionInstance(
  parsed: ParsedExtensionInstance
): Record<string, unknown> {
  return {
    ...parsed.extras,
    ...parsed.record,
  };
}

export function instanceJsonSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
