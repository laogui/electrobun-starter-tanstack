/**
 * Shared canvas content type vocabulary. These types are the single source of
 * truth for what kinds of nodes the canvas understands. Other modules (store,
 * registry, predicates, hooks) should import from here instead of redeclaring
 * their own unions.
 *
 * MVP scope notes:
 * - `image` remains its own `CanvasNodeKind` and is NOT rolled into `asset`.
 *   Migration is deferred (see docs/features/Backlog/multi-type-canvas-preview-pipeline.md §5.1).
 * - `asset` and `link` specs exist in the registry but no creation entry point
 *   is wired up yet; UI surfaces are added in Phase 1A / 1B.
 */

/** Every node kind the canvas can construct or render. */
export type CanvasNodeKind =
  | 'card'
  | 'checklist'
  | 'sticky'
  | 'folder'
  | 'group'
  | 'image'
  | 'asset'
  | 'link';

/**
 * Subset of `CanvasNodeKind` that user-facing creation entry points (menus,
 * keyboard shortcuts, context-menu actions) are allowed to instantiate in
 * MVP. `asset` / `link` specs exist in the registry but their UI is wired up
 * in Phase 1A / 1B — keeping them out of this union prevents accidental
 * exposure before the rest of the pipeline is ready.
 */
export type CreatableCanvasNodeKind = Exclude<CanvasNodeKind, 'asset' | 'link'>;

/** Sub-kind for `asset` nodes. PDFs flow through `file` plus `mimeType`. */
export type AssetKind = 'video' | 'audio' | 'file';

/** Persisted shape of an `asset` node's data. Runtime-only fields live in the
 *  optional `previewUrl` / `thumbnailUrl` slots and must be stripped before
 *  writing to manifest (see `sanitize.ts`). */
export interface AssetNodeData {
  // Persisted attachment references (relative paths inside workspace).
  attachmentFile?: string;

  color: string;
  duration?: number;
  fileName: string;
  kind: AssetKind;
  mimeType: string;

  // Runtime-only hydrated URLs. NEVER persist these.
  previewUrl?: string;
  size?: number;
  thumbnailFile?: string;
  thumbnailUrl?: string;
  title: string;

  // Optional small metadata.
  waveform?: number[];
}

/** Persisted shape of a `link` node's data. */
export interface LinkNodeData {
  color: string;
  description?: string;
  faviconUrl?: string;
  imageUrl?: string;
  siteName?: string;
  title: string;
  unfurlError?: string;

  unfurlStatus?: 'idle' | 'loading' | 'ready' | 'failed';
  url: string;
}

// ---------------------------------------------------------------------------
// classifyFile()
// ---------------------------------------------------------------------------

export interface ClassifyFileInput {
  name: string;
  size?: number;
  type?: string;
}

export interface ClassifyFileResult {
  isPdf: boolean;
  kind: AssetKind;
  mimeType: string;
}

const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'mov',
  'm4v',
  'webm',
  'mkv',
  'avi',
  'ogv',
]);

const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'wav',
  'm4a',
  'aac',
  'flac',
  'ogg',
  'oga',
  'opus',
]);

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) {
    return '';
  }
  return name.slice(dot + 1).toLowerCase();
}

/**
 * Identify the asset kind / MIME type for a file-like input.
 *
 * Resolution order:
 *  1. Trust an explicit `video/*` or `audio/*` MIME type when present.
 *  2. Fall back to extension lookup against a small allowlist.
 *  3. Anything else maps to `kind: 'file'`, preserving the original MIME
 *     (or `application/octet-stream` if missing). PDFs are flagged via
 *     `isPdf` so callers can branch without introducing a new AssetKind.
 */
export function classifyFile(
  input: File | ClassifyFileInput
): ClassifyFileResult {
  const name = input.name ?? '';
  const rawMime = (input.type ?? '').toLowerCase();
  const ext = getExtension(name);

  if (rawMime.startsWith('video/')) {
    return { kind: 'video', mimeType: rawMime, isPdf: false };
  }
  if (rawMime.startsWith('audio/')) {
    return { kind: 'audio', mimeType: rawMime, isPdf: false };
  }

  if (VIDEO_EXTENSIONS.has(ext)) {
    return {
      kind: 'video',
      mimeType: rawMime || `video/${ext === 'mov' ? 'quicktime' : ext}`,
      isPdf: false,
    };
  }
  if (AUDIO_EXTENSIONS.has(ext)) {
    return {
      kind: 'audio',
      mimeType: rawMime || `audio/${ext === 'm4a' ? 'mp4' : ext}`,
      isPdf: false,
    };
  }

  const isPdf = rawMime === 'application/pdf' || ext === 'pdf';
  return {
    kind: 'file',
    mimeType:
      rawMime || (isPdf ? 'application/pdf' : 'application/octet-stream'),
    isPdf,
  };
}

// ---------------------------------------------------------------------------
// getAssetDisplayTitle()
// ---------------------------------------------------------------------------

const MIME_FRIENDLY_NAMES: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/zip': 'Archive',
  'application/x-zip-compressed': 'Archive',
  'application/json': 'JSON',
  'text/plain': 'Text',
  'text/markdown': 'Markdown',
};

function mimeFriendlyName(mimeType: string): string {
  if (!mimeType) {
    return '';
  }
  const friendly = MIME_FRIENDLY_NAMES[mimeType.toLowerCase()];
  if (friendly) {
    return friendly;
  }
  if (mimeType.startsWith('video/')) {
    return 'Video';
  }
  if (mimeType.startsWith('audio/')) {
    return 'Audio';
  }
  if (mimeType.startsWith('image/')) {
    return 'Image';
  }
  return '';
}

/**
 * Resolve a user-facing title for an asset node. Order:
 *   title → fileName → friendly MIME name → 'Untitled'.
 */
export function getAssetDisplayTitle(
  data: Pick<AssetNodeData, 'title' | 'fileName' | 'mimeType'>
): string {
  if (data.title?.trim()) {
    return data.title.trim();
  }
  if (data.fileName?.trim()) {
    return data.fileName.trim();
  }
  const friendly = mimeFriendlyName(data.mimeType ?? '');
  if (friendly) {
    return friendly;
  }
  return 'Untitled';
}
