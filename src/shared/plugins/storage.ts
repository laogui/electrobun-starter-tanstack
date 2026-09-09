import type { JsonValue } from '../../../packages/plugin-sdk';

export const PLUGIN_STORAGE_VALUE_BYTES = 1_048_576;
export const PLUGIN_STORAGE_FILE_BYTES = 4_194_304;

export function assertStorageKey(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) {
    throw new Error('Storage keys must contain 1–1024 characters');
  }
}

function assertJson(
  value: unknown,
  ancestors: Set<object>,
  depth: number
): void {
  if (depth > 64) {
    throw new Error('Storage JSON exceeds 64 levels');
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return;
  }
  if (!value || typeof value !== 'object') {
    throw new Error('Storage values must be finite JSON values');
  }
  if (ancestors.has(value)) {
    throw new Error('Storage values must not contain cycles');
  }
  if (
    !(
      Array.isArray(value) ||
      Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null
    )
  ) {
    throw new Error('Storage values must contain only JSON arrays and objects');
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error('Storage values must not contain symbol keys');
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const child of value) {
      assertJson(child, ancestors, depth + 1);
    }
  } else {
    for (const child of Object.values(value)) {
      assertJson(child, ancestors, depth + 1);
    }
  }
  ancestors.delete(value);
}

export function serializeStorageValue(value: unknown): string {
  assertJson(value, new Set(), 0);
  const serialized = JSON.stringify(value);
  if (
    new TextEncoder().encode(serialized).byteLength > PLUGIN_STORAGE_VALUE_BYTES
  ) {
    throw new Error('Storage value exceeds 1 MiB');
  }
  return serialized;
}

export function cloneStorageValue(value: unknown): JsonValue {
  return JSON.parse(serializeStorageValue(value)) as JsonValue;
}
