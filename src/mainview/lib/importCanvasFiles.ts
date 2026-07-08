import {
  CANVAS_EXPORT_SCHEMA,
  type CanvasExportDocument,
} from '@/lib/canvasExport';
import { IMAGE_H, IMAGE_W } from '@/lib/canvasNodeRegistry';
import { classifyFile } from '@/lib/contentTypes';
import { rpcSaveAttachment } from '@/lib/rpc';
import { createImageThumbnail } from '@/lib/thumbnail';

const FILE_EXT_RE = /\.[^.]+$/;

// Image-node auto-sizing. Dropped/pasted images get a card sized to a fixed
// base width with the height derived from the image's aspect ratio, so the
// thumbnail shows in full. Extreme aspect ratios are clamped to 1:3..3:1 —
// beyond that the card keeps a sane shape and `object-cover` crops the center
// (only the middle slice of a very long/wide image is shown). The result is
// snapped to the canvas' 24px grid and clamped to the ImageNode resize bounds.
const IMAGE_BASE_WIDTH = IMAGE_W;
const IMAGE_MIN_WIDTH = 150;
const IMAGE_MAX_WIDTH = 800;
const IMAGE_MIN_HEIGHT = 150;
const IMAGE_MAX_HEIGHT = 900;
const IMAGE_MIN_ASPECT = 1 / 3;
const IMAGE_MAX_ASPECT = 3;
const IMAGE_GRID = 24;

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snapToGrid(value: number): number {
  return Math.round(value / IMAGE_GRID) * IMAGE_GRID;
}

/**
 * Derive a canvas image-card size from an image's natural pixel dimensions.
 * Width is fixed at the base width; height follows the (aspect-clamped) ratio.
 * Falls back to a square card when the dimensions are missing/degenerate.
 */
export function computeImageNodeSize(
  naturalWidth: number,
  naturalHeight: number
): { height: number; width: number } {
  if (
    !(
      Number.isFinite(naturalWidth) &&
      Number.isFinite(naturalHeight) &&
      naturalWidth > 0 &&
      naturalHeight > 0
    )
  ) {
    return { width: IMAGE_W, height: IMAGE_H };
  }
  const aspect = clampNumber(
    naturalWidth / naturalHeight,
    IMAGE_MIN_ASPECT,
    IMAGE_MAX_ASPECT
  );
  const width = clampNumber(
    snapToGrid(IMAGE_BASE_WIDTH),
    IMAGE_MIN_WIDTH,
    IMAGE_MAX_WIDTH
  );
  const height = clampNumber(
    snapToGrid(IMAGE_BASE_WIDTH / aspect),
    IMAGE_MIN_HEIGHT,
    IMAGE_MAX_HEIGHT
  );
  return { width, height };
}

/**
 * Read an image's natural dimensions from a URL (data: or blob:). Resolves to
 * `null` when the image cannot be decoded or the runtime lacks a DOM `Image`.
 */
export function readImageNaturalSize(
  src: string
): Promise<{ height: number; width: number } | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

export function isImageFile(file: File): boolean {
  return classifyFile(file).mimeType.startsWith('image/');
}

export function isCanvasExportJsonFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith('.json') ||
    file.type === 'application/json' ||
    file.type.endsWith('+json')
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parseCanvasExportJson(
  text: string
): CanvasExportDocument | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!isPlainObject(parsed)) {
    return null;
  }
  if (parsed.schema !== CANVAS_EXPORT_SCHEMA) {
    return null;
  }
  if (!(Array.isArray(parsed.nodes) && Array.isArray(parsed.edges))) {
    return null;
  }
  if (parsed.widgets !== undefined && !isPlainObject(parsed.widgets)) {
    return null;
  }
  return parsed as unknown as CanvasExportDocument;
}

function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Unable to read file as text.'));
    });
    reader.addEventListener('error', () => {
      reject(new Error('Unable to read file.'));
    });
    reader.readAsText(file);
  });
}

export async function readCanvasExportJsonFile(
  file: File
): Promise<CanvasExportDocument | null> {
  if (!isCanvasExportJsonFile(file)) {
    return null;
  }

  try {
    return parseCanvasExportJson(await readFileAsText(file));
  } catch {
    return null;
  }
}

/** Detect drags that carry OS files (Finder, Explorer, etc.). */
export function isOsFileDrag(
  dataTransfer: DataTransfer | null | undefined
): boolean {
  if (!dataTransfer) {
    return false;
  }
  const types = Array.from(dataTransfer.types ?? []);
  if (types.includes('Files')) {
    return true;
  }
  if ((dataTransfer.files?.length ?? 0) > 0) {
    return true;
  }
  return Array.from(dataTransfer.items ?? []).some(
    (item) => item.kind === 'file'
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Unable to read file as a data URL.'));
    });
    reader.addEventListener('error', () => {
      reject(new Error('Unable to read file.'));
    });
    reader.readAsDataURL(file);
  });
}

/**
 * Persist a dropped/pasted image to workspace attachments and attach
 * thumbnail metadata. The canvas node should already show a blob preview.
 */
export async function persistImportedImage(
  nodeId: string,
  file: File,
  updateNodeData: (id: string, data: Record<string, unknown>) => void
): Promise<void> {
  const imageUrl = await readFileAsDataUrl(file);
  const title = file.name.replace(FILE_EXT_RE, '') || file.name;

  try {
    const original = await rpcSaveAttachment(imageUrl, undefined, {
      kind: 'image',
      mimeType: file.type || classifyFile(file).mimeType,
      suggestedName: file.name,
    });
    if (original?.filePath) {
      updateNodeData(nodeId, { imageFile: original.filePath, imageUrl });
    }
  } catch (error) {
    console.error(
      '[importCanvasFiles] Failed to save image attachment:',
      error
    );
    throw error;
  }

  try {
    const thumbnailDataUrl = await createImageThumbnail(imageUrl);
    if (!thumbnailDataUrl) {
      return;
    }
    const thumb = await rpcSaveAttachment(thumbnailDataUrl, undefined, {
      kind: 'image',
      mimeType: 'image/jpeg',
      suggestedName: `${title}-thumbnail.jpg`,
    });
    if (thumb?.filePath) {
      updateNodeData(nodeId, {
        thumbnailFile: thumb.filePath,
        thumbnailUrl: thumbnailDataUrl,
      });
    }
  } catch (error) {
    console.error('[importCanvasFiles] Failed to save image thumbnail:', error);
  }
}

export function createImageDropPreview(file: File): {
  imageUrl: string;
  title: string;
} {
  const title = file.name.replace(FILE_EXT_RE, '') || file.name;
  return {
    imageUrl: URL.createObjectURL(file),
    title,
  };
}

export function revokeImageDropPreview(imageUrl: string): void {
  if (imageUrl.startsWith('blob:')) {
    URL.revokeObjectURL(imageUrl);
  }
}
