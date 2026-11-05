/**
 * Shared canvas content type vocabulary. These types are the single source of
 * truth for what kinds of nodes the canvas understands. Other modules (store,
 * registry, predicates, hooks) should import from here instead of redeclaring
 * their own unions.
 *
 * MVP scope notes:
 * - `image` remains its own `CanvasNodeKind` and is NOT rolled into `asset`.
 *   Migration is deferred (see docs/features/Backlog/multi-type-canvas-preview-pipeline.md §5.1).
 * - `link` is wired in Phase 1A. `asset` is wired in Phase 1B for generic
 *   local attachments. Images still keep their existing dedicated node.
 */

/** Every node kind the canvas can construct or render. */
export type CanvasNodeKind =
  | 'card'
  | 'sticky'
  | 'topic'
  | 'folder'
  | 'group'
  | 'image'
  | 'asset'
  | 'link';

/**
 * Subset of `CanvasNodeKind` that user-facing creation entry points (menus,
 * keyboard shortcuts, context-menu actions) are allowed to instantiate in
 * MVP. `link` is exposed in Phase 1A and `asset` is exposed in Phase 1B once
 * the attachment save / hydrate path exists.
 */
export type CreatableCanvasNodeKind = CanvasNodeKind;

/** Sub-kind for `asset` nodes. PDFs flow through `file` plus `mimeType`. */
export type AssetKind = 'video' | 'audio' | 'file';

/** Compact summary of an archive's contents shown on the canvas card without
 *  expanding the file. Limited to the first few entries so the manifest blob
 *  stays small. */
export interface ArchiveSummary {
  entryCount: number;
  topFiles: string[];
}

/** Persisted shape of an `asset` node's data. Runtime-only fields live in the
 *  optional `previewUrl` / `thumbnailUrl` slots and must be stripped before
 *  writing to manifest (see `sanitize.ts`). */
export interface AssetNodeData {
  // Persisted attachment references (relative paths inside workspace).
  archiveSummary?: ArchiveSummary;
  attachmentFile?: string;

  color: string;
  duration?: number;
  fileName: string;
  kind: AssetKind;
  mimeType: string;

  // Runtime-only hydrated URLs / status. NEVER persist these.
  missing?: boolean;
  // Persisted text excerpt for `text/*` / JSON / markdown asset previews.
  // Capped at ~500 chars by the bun-side excerpt generator so manifest blobs
  // stay small.
  previewExcerpt?: string;
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
// Link helpers
// ---------------------------------------------------------------------------

const URL_WITH_PROTOCOL_RE = /\bhttps?:\/\/[^\s<>"']+/i;
const URL_PROTOCOL_RE = /^[a-z][a-z\d+.-]*:/i;
const HOST_LIKE_RE =
  /^(?:localhost|(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,})(?::\d+)?(?:[/?#]|$)/i;
const TRAILING_URL_PUNCTUATION_RE = /[),.;!?]+$/;
const LINE_BREAK_RE = /\r?\n/;
const WWW_PREFIX_RE = /^www\./i;

function trimUrlCandidate(value: string): string {
  return value.trim().replace(TRAILING_URL_PUNCTUATION_RE, '');
}

/**
 * Extract a URL candidate from pasted or dragged text. Full http(s) URLs can
 * appear inside prose; bare domains are accepted only when the whole line is a
 * host-like value to avoid turning ordinary text into links accidentally.
 */
export function extractLinkUrl(text: string): string | null {
  for (const line of text.split(LINE_BREAK_RE)) {
    const trimmed = line.trim();
    if (!(trimmed && !trimmed.startsWith('#'))) {
      continue;
    }
    const explicitUrl = trimmed.match(URL_WITH_PROTOCOL_RE)?.[0];
    if (explicitUrl) {
      return normalizeLinkUrl(trimUrlCandidate(explicitUrl));
    }
    const candidate = trimUrlCandidate(trimmed);
    if (HOST_LIKE_RE.test(candidate)) {
      return normalizeLinkUrl(candidate);
    }
  }
  return null;
}

/**
 * Normalize a user-entered link to a safe http(s) URL. Unsupported schemes
 * return null so `javascript:` / `file:` / custom protocols are never persisted
 * as link nodes by accident.
 */
export function normalizeLinkUrl(rawUrl: string): string | null {
  const trimmed = trimUrlCandidate(rawUrl);
  if (!trimmed) {
    return null;
  }
  const hasProtocol = URL_PROTOCOL_RE.test(trimmed);
  if (!(hasProtocol || HOST_LIKE_RE.test(trimmed))) {
    return null;
  }
  const candidate = hasProtocol ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    if (!url.hostname) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function getLinkHost(url: string): string {
  try {
    const host = new URL(url).host;
    return host.replace(WWW_PREFIX_RE, '');
  } catch {
    return '';
  }
}

export function getLinkDisplayTitle(
  data: Pick<LinkNodeData, 'title' | 'url' | 'siteName'>
): string {
  const title = data.title.trim();
  if (title) {
    return title;
  }
  const siteName = data.siteName?.trim();
  if (siteName) {
    return siteName;
  }
  return getLinkHost(data.url) || data.url || 'Untitled link';
}

export function createLinkNodeData(rawUrl: string): LinkNodeData | null {
  const url = normalizeLinkUrl(rawUrl);
  if (!url) {
    return null;
  }
  const host = getLinkHost(url);
  return {
    url,
    title: host || url,
    color: '#FFFFFF',
  };
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

const IMAGE_EXTENSION_MIME: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  ico: 'image/x-icon',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

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

  if (rawMime.startsWith('image/')) {
    return { kind: 'file', mimeType: rawMime, isPdf: false };
  }

  const imageMime = IMAGE_EXTENSION_MIME[ext];
  if (imageMime) {
    return {
      kind: 'file',
      mimeType: rawMime || imageMime,
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

export function createAssetNodeData(
  input: File | ClassifyFileInput,
  options?: { attachmentFile?: string; color?: string }
): AssetNodeData {
  const { kind, mimeType } = classifyFile(input);
  const fileName = input.name.trim() || 'Untitled file';
  return {
    ...(options?.attachmentFile
      ? { attachmentFile: options.attachmentFile }
      : {}),
    color: options?.color ?? '#FFFFFF',
    fileName,
    kind,
    mimeType,
    ...(typeof input.size === 'number' ? { size: input.size } : {}),
    title: fileName,
  };
}
