/**
 * Generate a small JPEG/WebP preview from an image data URL. The thumbnail is
 * suitable for canvas-mode rendering: the renderer never needs to hold the
 * original full-resolution bitmap in memory just to draw a card preview.
 *
 * The result is a data URL that can be passed to `rpcSaveAttachment` and
 * displayed via an `<img src>` tag. Generation is best-effort: callers must
 * fall back to the original image when the thumbnail cannot be produced
 * (decode failure, missing canvas API, animated GIFs, etc.).
 */

const DEFAULT_MAX_EDGE = 480;
const DEFAULT_QUALITY = 0.82;
const DEFAULT_MIME_TYPE = 'image/jpeg';

export interface CreateImageThumbnailOptions {
  /** Largest edge (in pixels) of the resulting thumbnail. */
  maxEdge?: number;
  /** Output MIME type. WebP and JPEG are sensible choices. */
  mimeType?: string;
  /** Encoder quality between 0 and 1. */
  quality?: number;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image failed to load.'));
    image.src = src;
  });
}

function computeThumbnailSize(
  sourceWidth: number,
  sourceHeight: number,
  maxEdge: number
): { width: number; height: number } {
  const longestEdge = Math.max(sourceWidth, sourceHeight);
  if (longestEdge <= maxEdge) {
    return {
      width: Math.max(1, Math.round(sourceWidth)),
      height: Math.max(1, Math.round(sourceHeight)),
    };
  }
  const scale = maxEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export async function createImageThumbnail(
  imageDataUrl: string,
  options: CreateImageThumbnailOptions = {}
): Promise<string | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return null;
  }
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const mimeType = options.mimeType ?? DEFAULT_MIME_TYPE;
  const quality = options.quality ?? DEFAULT_QUALITY;

  try {
    const image = await loadImageElement(imageDataUrl);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!(sourceWidth && sourceHeight)) {
      return null;
    }
    // Skip work for tiny images: returning a smaller copy would waste cycles.
    if (Math.max(sourceWidth, sourceHeight) <= maxEdge) {
      return null;
    }

    const { width, height } = computeThumbnailSize(
      sourceWidth,
      sourceHeight,
      maxEdge
    );
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL(mimeType, quality);
  } catch {
    return null;
  }
}
