import type { ExtensionNodeData } from '../../../../shared/extensions/protocol';
import type { CardContentData } from './CardNode';
import type { ImageData } from './ImageNode';

/**
 * Runtime narrowing for loosely typed node data (`Record<string, unknown>`)
 * before it reaches a component with a precise prop type. Canvas data comes
 * from disk and folder children, so the shape is validated instead
 * of asserted. The `to*` helpers keep the original object (and its identity)
 * when it is valid and fall back to a copy holding only well-typed fields.
 */

type UnknownRecord = Record<string, unknown>;

export function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean';
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || typeof value === 'number';
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isUnknownRecord(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

const CARD_STRING_FIELDS = [
  'color',
  'content',
  'noteId',
  'previewExcerpt',
  'previewHtml',
  'tag',
  'tagColor',
  'title',
] as const;

function isCardType(value: unknown): value is CardContentData['type'] {
  return value === undefined || value === 'text';
}

export function isCardContentData(
  data: UnknownRecord
): data is UnknownRecord & CardContentData {
  return (
    CARD_STRING_FIELDS.every((key) => isOptionalString(data[key])) &&
    isOptionalBoolean(data.isHidden) &&
    isOptionalNumber(data.previewVersion) &&
    (data.tagColors === undefined || isStringRecord(data.tagColors)) &&
    (data.tags === undefined || isStringArray(data.tags)) &&
    isCardType(data.type)
  );
}

/** Card data with any wrongly typed field dropped. */
export function toCardContentData(data: UnknownRecord): CardContentData {
  if (isCardContentData(data)) {
    return data;
  }
  const result: CardContentData = {};
  for (const key of CARD_STRING_FIELDS) {
    const value = data[key];
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  if (typeof data.isHidden === 'boolean') {
    result.isHidden = data.isHidden;
  }
  if (typeof data.previewVersion === 'number') {
    result.previewVersion = data.previewVersion;
  }
  if (data.previewBlocks !== undefined) {
    result.previewBlocks = data.previewBlocks;
  }
  if (isStringRecord(data.tagColors)) {
    result.tagColors = data.tagColors;
  }
  if (isStringArray(data.tags)) {
    result.tags = data.tags;
  }
  if (data.type === 'text') {
    result.type = data.type;
  }
  return result;
}

const IMAGE_STRING_FIELDS = [
  'imageFile',
  'imageUrl',
  'thumbnailFile',
  'thumbnailUrl',
  'title',
] as const;

export function isImageData(
  data: UnknownRecord
): data is UnknownRecord & ImageData {
  return (
    typeof data.color === 'string' &&
    IMAGE_STRING_FIELDS.every((key) => isOptionalString(data[key])) &&
    isOptionalBoolean(data.isDropTarget) &&
    isOptionalBoolean(data.isHidden)
  );
}

/** Image data with any wrongly typed field dropped; a missing colour is `''`. */
export function toImageData(data: UnknownRecord): ImageData {
  if (isImageData(data)) {
    return data;
  }
  const result: ImageData = {
    color: typeof data.color === 'string' ? data.color : '',
  };
  for (const key of IMAGE_STRING_FIELDS) {
    const value = data[key];
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  if (typeof data.isDropTarget === 'boolean') {
    result.isDropTarget = data.isDropTarget;
  }
  if (typeof data.isHidden === 'boolean') {
    result.isHidden = data.isHidden;
  }
  return result;
}

export function isExtensionNodeData(
  data: UnknownRecord
): data is ExtensionNodeData {
  return (
    typeof data.canvasTypeId === 'string' && typeof data.instanceId === 'string'
  );
}
