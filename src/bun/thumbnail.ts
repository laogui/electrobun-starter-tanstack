import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { assertWorkspaceAttachmentPath } from './attachments';

/**
 * Bun-side metadata extraction for attachment-backed canvas asset nodes.
 *
 * The renderer already generates raster thumbnails for images / videos / audio
 * in `src/mainview/lib/thumbnail.ts`. This module covers the formats that need
 * the bun process to peek at the file: text excerpts (`text/*`, JSON,
 * markdown) and archive summaries (`.zip`).
 *
 * PDF page rasterization is intentionally out of scope here — see
 * `docs/product-detail-roadmap.md` Phase 2 for the rationale (the renderer
 * already shows a styled PDF placeholder, and adding `pdfjs-dist` to the bun
 * process is too heavy for the value).
 *
 * Every helper is best-effort: callers must tolerate `undefined` and never
 * surface a failure as a user-visible error. Asset save / hydrate flows must
 * not block on these.
 */

const TEXT_EXCERPT_READ_BYTES = 4 * 1024;
const TEXT_EXCERPT_MAX_CHARS = 500;
const TEXT_EXCERPT_MIN_PRINTABLE_RATIO = 0.85;

const ARCHIVE_TOP_FILES_LIMIT = 5;
const ARCHIVE_FILENAME_MAX_LENGTH = 80;
// ZIP central directory + ZIP64 + comment combined max footprint is bounded by
// the spec at 65 KiB; reading the last 96 KiB covers small-comment archives
// without paying for the full file.
const ZIP_TAIL_READ_BYTES = 96 * 1024;
// End-of-central-directory record signatures. Stored as little-endian u32:
// `PK\x05\x06` for the legacy EOCD and `PK\x06\x06` for the ZIP64 variant.
const EOCD_SIGNATURE = 0x06_05_4b_50;
const EOCD64_LOCATOR_SIGNATURE = 0x07_06_4b_50;
const EOCD64_RECORD_SIGNATURE = 0x06_06_4b_50;
const CDFH_SIGNATURE = 0x02_01_4b_50;

const ARCHIVE_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
]);

const TEXT_MIME_PREFIXES = ['text/'];
const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'application/xml',
  'application/x-yaml',
  'application/x-www-form-urlencoded',
]);

const WHITESPACE_RUN_RE = /[\s\u00a0\u2028\u2029]+/g;
// Detect ASCII control bytes (excluding tab, LF and CR) plus DEL so the
// excerpt sanitizer can strip them. The lint rule fires because the regex
// literally targets control characters — that is exactly the intent here.
// biome-ignore lint/suspicious/noControlCharactersInRegex: detecting control bytes is the point of this regex.
const CONTROL_CHAR_RE = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

export interface FileMetadataResult {
  archiveSummary?: { entryCount: number; topFiles: string[] };
  previewExcerpt?: string;
}

function isArchiveMime(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase();
  if (ARCHIVE_MIME_TYPES.has(normalized)) {
    return true;
  }
  return normalized.endsWith('+zip');
}

function isTextMime(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase();
  if (TEXT_MIME_TYPES.has(normalized)) {
    return true;
  }
  return TEXT_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/**
 * Detect whether a slice of bytes plausibly contains UTF-8-decoded text. We
 * sniff the leading bytes (which decoding may have replaced with U+FFFD) to
 * avoid surfacing a binary-payload card as a noisy text card.
 */
function looksLikeText(decoded: string): boolean {
  if (!decoded) {
    return false;
  }
  let printable = 0;
  let total = 0;
  for (const char of decoded) {
    total += 1;
    const code = char.codePointAt(0) ?? 0;
    // Allow common whitespace and any code point >= 0x20. Also treat the
    // Unicode replacement character (U+FFFD) as a strong "not text" signal.
    if (code === 0xff_fd) {
      return false;
    }
    if (code === 0x09 || code === 0x0a || code === 0x0d || code >= 0x20) {
      printable += 1;
    }
  }
  if (total === 0) {
    return false;
  }
  return printable / total >= TEXT_EXCERPT_MIN_PRINTABLE_RATIO;
}

function normalizeExcerpt(raw: string): string {
  const stripped = raw.replace(CONTROL_CHAR_RE, ' ');
  const collapsed = stripped.replace(WHITESPACE_RUN_RE, ' ').trim();
  if (collapsed.length <= TEXT_EXCERPT_MAX_CHARS) {
    return collapsed;
  }
  // Cut on a word boundary when one is close to the cap so the excerpt does
  // not end mid-word; the ellipsis is rendered by the UI, not added here.
  const head = collapsed.slice(0, TEXT_EXCERPT_MAX_CHARS);
  const lastSpace = head.lastIndexOf(' ');
  if (lastSpace > TEXT_EXCERPT_MAX_CHARS - 60) {
    return head.slice(0, lastSpace);
  }
  return head;
}

/**
 * Read the first few KiB of a file and produce a normalized text excerpt.
 * Returns `undefined` when the bytes do not look like text or the file is
 * empty / unreadable.
 */
export async function generateTextExcerpt(
  filePath: string
): Promise<string | undefined> {
  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return;
    }
    if (file.size === 0) {
      return;
    }
    const sliceEnd = Math.min(file.size, TEXT_EXCERPT_READ_BYTES);
    const bytes = await file.slice(0, sliceEnd).arrayBuffer();
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (!looksLikeText(decoded)) {
      return;
    }
    const excerpt = normalizeExcerpt(decoded);
    return excerpt || undefined;
  } catch (error) {
    console.warn('[thumbnail] generateTextExcerpt failed:', error);
    return;
  }
}

interface ZipTail {
  buffer: Uint8Array;
  fileSize: number;
  // Offset within the file where `buffer` starts, so EOCD positions inside
  // the slice can be translated back to absolute file offsets.
  startOffset: number;
}

async function readZipTail(filePath: string): Promise<ZipTail | null> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return null;
  }
  const fileSize = file.size;
  if (fileSize < 22) {
    // Smaller than the minimum EOCD record size — definitely not a valid zip.
    return null;
  }
  const startOffset = Math.max(0, fileSize - ZIP_TAIL_READ_BYTES);
  const tail = await file.slice(startOffset, fileSize).arrayBuffer();
  return {
    buffer: new Uint8Array(tail),
    fileSize,
    startOffset,
  };
}

/**
 * Locate the End of Central Directory record by scanning the file tail
 * backwards. The record starts with `PK\x05\x06` and is at most 22 + 65535
 * bytes from the end (the variable-length archive comment).
 */
function findEocdOffset(tail: Uint8Array): number {
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  return -1;
}

interface CentralDirectoryRange {
  cdOffset: number;
  cdSize: number;
  totalEntries: number;
}

function readEocd(
  view: DataView,
  eocdOffset: number
): CentralDirectoryRange | null {
  // Standard EOCD layout. We only need entries-on-disk, central directory size
  // and central directory offset; everything else is ignored.
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  // ZIP64 sentinels: when any of these are 0xFFFFFFFF / 0xFFFF the real
  // values live in the ZIP64 EOCD record. We give up rather than try to
  // implement ZIP64 here — large archives still get an `entryCount: 0`
  // fallback below that the UI can render as a generic archive card.
  if (
    totalEntries === 0xff_ff ||
    cdSize === 0xff_ff_ff_ff ||
    cdOffset === 0xff_ff_ff_ff
  ) {
    return null;
  }
  return { cdOffset, cdSize, totalEntries };
}

interface ZipParseContext {
  cdAbsoluteOffset: number;
  cdSize: number;
  tail: ZipTail;
}

function ensureCentralDirectoryInTail(
  context: ZipParseContext
): { offsetInTail: number; size: number } | null {
  const { cdAbsoluteOffset, cdSize, tail } = context;
  const offsetInTail = cdAbsoluteOffset - tail.startOffset;
  if (offsetInTail < 0 || offsetInTail + cdSize > tail.buffer.length) {
    // Central directory does not fully sit inside the tail we read. We could
    // re-read more bytes here but for the MVP we just bail out — archives
    // bigger than the tail window are rare, and giving up keeps this helper
    // bounded and predictable.
    return null;
  }
  return { offsetInTail, size: cdSize };
}

function decodeFilenameSafe(bytes: Uint8Array): string | null {
  // CDFH file names default to CP437 but UTF-8 is widely used. Attempt UTF-8
  // first (with `fatal: true` so invalid sequences throw) and fall back to a
  // permissive UTF-8 decode that replaces invalid bytes; CP437 is rare enough
  // that supporting it here is not worth the binary lookup table.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch {
      return null;
    }
  }
}

function isInterestingArchiveEntry(name: string): boolean {
  if (!name || name.endsWith('/')) {
    return false; // Skip directory entries.
  }
  if (name.startsWith('__MACOSX/') || name.includes('/.DS_Store')) {
    return false; // Skip macOS metadata.
  }
  if (name === '.DS_Store') {
    return false;
  }
  return true;
}

function readCentralDirectoryEntries(
  tail: Uint8Array,
  range: { offsetInTail: number; size: number }
): { topFiles: string[]; entryCount: number } {
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  const end = range.offsetInTail + range.size;
  const topFiles: string[] = [];
  let entryCount = 0;
  let cursor = range.offsetInTail;

  while (cursor + 46 <= end) {
    if (view.getUint32(cursor, true) !== CDFH_SIGNATURE) {
      break;
    }
    entryCount += 1;
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const nameOffset = cursor + 46;
    const nextCursor = nameOffset + nameLength + extraLength + commentLength;
    if (nameOffset + nameLength > end) {
      break;
    }
    if (topFiles.length < ARCHIVE_TOP_FILES_LIMIT) {
      const nameBytes = tail.slice(nameOffset, nameOffset + nameLength);
      const decoded = decodeFilenameSafe(nameBytes);
      if (decoded && isInterestingArchiveEntry(decoded)) {
        topFiles.push(
          decoded.length > ARCHIVE_FILENAME_MAX_LENGTH
            ? `${decoded.slice(0, ARCHIVE_FILENAME_MAX_LENGTH - 1)}…`
            : decoded
        );
      }
    }
    cursor = nextCursor;
  }

  return { topFiles, entryCount };
}

/**
 * Summarize a ZIP archive by reading the central directory tail. Returns
 * `undefined` when the file is not a recognizable ZIP, exceeds the tail
 * window, or uses ZIP64 (rare for canvas asset uploads).
 */
export async function generateArchiveSummary(
  filePath: string
): Promise<{ entryCount: number; topFiles: string[] } | undefined> {
  try {
    const tail = await readZipTail(filePath);
    if (!tail) {
      return;
    }
    const eocdOffset = findEocdOffset(tail.buffer);
    if (eocdOffset < 0) {
      return;
    }
    const view = new DataView(
      tail.buffer.buffer,
      tail.buffer.byteOffset,
      tail.buffer.byteLength
    );
    // Reject archives whose footer references the ZIP64 record — supporting
    // them would require a second read pass that is outside the Phase 2
    // scope.
    if (
      eocdOffset >= 4 &&
      (view.getUint32(eocdOffset - 20, true) === EOCD64_LOCATOR_SIGNATURE ||
        view.getUint32(eocdOffset - 56, true) === EOCD64_RECORD_SIGNATURE)
    ) {
      return;
    }
    const range = readEocd(view, eocdOffset);
    if (!range) {
      return;
    }
    const inTail = ensureCentralDirectoryInTail({
      cdAbsoluteOffset: range.cdOffset,
      cdSize: range.cdSize,
      tail,
    });
    if (!inTail) {
      return;
    }
    const result = readCentralDirectoryEntries(tail.buffer, inTail);
    const entryCount = Math.max(result.entryCount, range.totalEntries);
    if (entryCount === 0) {
      return;
    }
    return { entryCount, topFiles: result.topFiles };
  } catch (error) {
    console.warn('[thumbnail] generateArchiveSummary failed:', error);
    return;
  }
}

/**
 * Route an attachment to the appropriate metadata generator based on its MIME
 * type. Always resolves to a (possibly empty) result object so callers can
 * spread it into a node data update without conditionals.
 *
 * Errors from individual generators are swallowed inside the helpers so this
 * function never rejects.
 */
export async function generateFileMetadata(
  filePath: string,
  mimeType: string
): Promise<FileMetadataResult> {
  if (!filePath) {
    return {};
  }
  const normalizedMime = (mimeType || '').toLowerCase();
  if (isArchiveMime(normalizedMime)) {
    const summary = await generateArchiveSummary(filePath);
    return summary ? { archiveSummary: summary } : {};
  }
  if (isTextMime(normalizedMime)) {
    const excerpt = await generateTextExcerpt(filePath);
    return excerpt ? { previewExcerpt: excerpt } : {};
  }
  return {};
}

const VIDEO_POSTER_MAX_EDGE = 640;

/**
 * Best-effort video poster for a workspace attachment. On macOS this shells
 * out to `qlmanage` so imports still get a raster preview when the renderer
 * webview cannot decode the dropped codec.
 */
export async function generateVideoPosterFile(
  wsPath: string,
  sourceFullPath: string,
  suggestedName: string
): Promise<string | undefined> {
  if (process.platform !== 'darwin') {
    return;
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'gb-video-thumb-'));
  try {
    const proc = Bun.spawn(
      [
        'qlmanage',
        '-t',
        '-s',
        String(VIDEO_POSTER_MAX_EDGE),
        '-o',
        tempDir,
        sourceFullPath,
      ],
      { stderr: 'ignore', stdout: 'ignore' }
    );
    await proc.exited;
    if (proc.exitCode !== 0) {
      return;
    }
    const entries = await readdir(tempDir);
    const posterName = entries.find((entry) => entry.endsWith('.png'));
    if (!posterName) {
      return;
    }
    const posterFile = Bun.file(join(tempDir, posterName));
    const baseName = basename(suggestedName).replace(/\.[^.]+$/, '') || 'video';
    const targetPath = `attachments/img_${crypto.randomUUID().slice(0, 8)}.png`;
    const { fullPath, relativePath } = assertWorkspaceAttachmentPath(
      wsPath,
      targetPath
    );
    await Bun.write(fullPath, posterFile);
    return relativePath;
  } catch (error) {
    console.warn('[thumbnail] generateVideoPosterFile failed:', error);
    return;
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}
