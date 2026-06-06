import { isAbsolute, normalize, relative, resolve } from 'node:path';

import { Utils } from 'electrobun/bun';

const DATA_URL_RE = /^data:([^;,]+)(?:;[^,]*)*;base64,(.+)$/i;
const SAFE_EXTENSION_RE = /^[a-z0-9]{1,12}$/;
const MAX_DATA_URL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

type AttachmentKind = 'audio' | 'file' | 'image' | 'video';

interface SaveAttachmentInput {
  dataUrl: string;
  existingFile?: string;
  kind?: AttachmentKind;
  mimeType?: string;
  suggestedName?: string;
}

interface SaveAttachmentFileInput {
  kind?: AttachmentKind;
  mimeType?: string;
  sourcePath: string;
  suggestedName?: string;
}

interface WorkspaceAttachmentPath {
  fullPath: string;
  relativePath: string;
}

const MIME_EXTENSION_MAP: Record<string, string> = {
  'application/gzip': 'gz',
  'application/json': 'json',
  'application/pdf': 'pdf',
  'application/rtf': 'rtf',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/x-7z-compressed': '7z',
  'application/x-rar-compressed': 'rar',
  'application/x-tar': 'tar',
  'application/x-zip-compressed': 'zip',
  'application/zip': 'zip',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'image/bmp': 'bmp',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/tiff': 'tiff',
  'image/webp': 'webp',
  'text/csv': 'csv',
  'text/html': 'html',
  'text/markdown': 'md',
  'text/plain': 'txt',
  'video/mp4': 'mp4',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

function normalizeManifestPath(filePath: string): string {
  return normalize(filePath).replaceAll('\\', '/');
}

export function assertWorkspaceAttachmentPath(
  wsPath: string,
  filePath: string
): WorkspaceAttachmentPath {
  if (!filePath.trim()) {
    throw new Error('Attachment path is required.');
  }
  if (isAbsolute(filePath)) {
    throw new Error('Attachment path must be relative.');
  }

  const relativePath = normalizeManifestPath(filePath);
  if (
    relativePath === 'attachments' ||
    !relativePath.startsWith('attachments/') ||
    relativePath.split('/').includes('..')
  ) {
    throw new Error('Attachment path must stay inside attachments/.');
  }

  const attachmentRoot = resolve(wsPath, 'attachments');
  const fullPath = resolve(wsPath, relativePath);
  const rootRelative = relative(attachmentRoot, fullPath);
  if (rootRelative.startsWith('..') || isAbsolute(rootRelative)) {
    throw new Error('Attachment path escapes the workspace.');
  }

  return { fullPath, relativePath };
}

function extensionFromName(name: string | undefined): string {
  const trimmed = name?.trim() ?? '';
  const dot = trimmed.lastIndexOf('.');
  if (dot < 0 || dot === trimmed.length - 1) {
    return '';
  }
  const extension = trimmed.slice(dot + 1).toLowerCase();
  return SAFE_EXTENSION_RE.test(extension) ? extension : '';
}

function extensionForMime(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  const known = MIME_EXTENSION_MAP[normalized];
  if (known) {
    return known;
  }
  const slash = normalized.indexOf('/');
  if (slash >= 0) {
    const subtype = normalized.slice(slash + 1).replace(/[^a-z0-9]+/g, '');
    if (subtype && subtype.length <= 12) {
      return subtype === 'jpeg' ? 'jpg' : subtype;
    }
  }
  return 'bin';
}

function prefixForAttachment(kind: AttachmentKind, mimeType: string): string {
  if (kind === 'image' || mimeType.startsWith('image/')) {
    return 'img';
  }
  if (kind === 'video' || mimeType.startsWith('video/')) {
    return 'video';
  }
  if (kind === 'audio' || mimeType.startsWith('audio/')) {
    return 'audio';
  }
  return 'file';
}

function inferAttachmentKind(mimeType: string): AttachmentKind {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }
  return 'file';
}

function parseDataUrl(dataUrl: string): {
  base64Data: string;
  mimeType: string;
} {
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) {
    throw new Error('Invalid data URL');
  }
  return {
    mimeType: match[1]!.toLowerCase(),
    base64Data: match[2]!,
  };
}

export async function saveAttachment(
  wsPath: string,
  input: SaveAttachmentInput
): Promise<{ filePath: string }> {
  const parsed = parseDataUrl(input.dataUrl);
  const mimeType = (input.mimeType || parsed.mimeType).toLowerCase();
  const buffer = Buffer.from(parsed.base64Data, 'base64');
  if (buffer.byteLength > MAX_DATA_URL_ATTACHMENT_BYTES) {
    throw new Error('Attachment is too large for data URL upload.');
  }

  if (input.existingFile) {
    const { fullPath, relativePath } = assertWorkspaceAttachmentPath(
      wsPath,
      input.existingFile
    );
    await Bun.write(fullPath, new Uint8Array(buffer));
    return { filePath: relativePath };
  }

  const kind = input.kind ?? inferAttachmentKind(mimeType);
  const prefix = prefixForAttachment(kind, mimeType);
  const extension =
    extensionFromName(input.suggestedName) || extensionForMime(mimeType);
  const filePath = `attachments/${prefix}_${crypto
    .randomUUID()
    .slice(0, 8)}.${extension}`;
  const { fullPath, relativePath } = assertWorkspaceAttachmentPath(
    wsPath,
    filePath
  );
  await Bun.write(fullPath, new Uint8Array(buffer));
  return { filePath: relativePath };
}

export async function loadAttachment(
  wsPath: string,
  filePath: string
): Promise<{ dataUrl: string } | null> {
  const { fullPath } = assertWorkspaceAttachmentPath(wsPath, filePath);
  const file = Bun.file(fullPath);
  if (!(await file.exists())) {
    return null;
  }

  const buffer = await file.arrayBuffer();
  const mimeType = file.type || 'application/octet-stream';
  const base64 = Buffer.from(buffer).toString('base64');
  return { dataUrl: `data:${mimeType};base64,${base64}` };
}

export async function attachmentExists(
  wsPath: string,
  filePath: string
): Promise<boolean> {
  const { fullPath } = assertWorkspaceAttachmentPath(wsPath, filePath);
  return await Bun.file(fullPath).exists();
}

export async function openAttachment(
  wsPath: string,
  filePath: string
): Promise<{ success: boolean }> {
  const { fullPath } = assertWorkspaceAttachmentPath(wsPath, filePath);
  const file = Bun.file(fullPath);
  if (!(await file.exists())) {
    return { success: false };
  }
  return { success: Utils.openPath(fullPath) };
}

export async function revealAttachment(
  wsPath: string,
  filePath: string
): Promise<{ success: boolean }> {
  const { fullPath } = assertWorkspaceAttachmentPath(wsPath, filePath);
  const file = Bun.file(fullPath);
  if (!(await file.exists())) {
    return { success: false };
  }
  Utils.showItemInFolder(fullPath);
  return { success: true };
}

/**
 * Copy a file from an absolute OS path into `attachments/` without round-
 * tripping through a base64 data URL. Used for imports that already have a
 * stable filesystem location (e.g. native file picker) so the renderer never
 * has to hold the full bytes in memory — the data URL path caps at
 * {@link MAX_DATA_URL_ATTACHMENT_BYTES} which is too small for typical video.
 */
export async function saveAttachmentFile(
  wsPath: string,
  input: SaveAttachmentFileInput
): Promise<{ filePath: string }> {
  if (!input.sourcePath.trim()) {
    throw new Error('Source path is required.');
  }
  if (!isAbsolute(input.sourcePath)) {
    throw new Error('Source path must be absolute.');
  }

  const sourceFile = Bun.file(input.sourcePath);
  if (!(await sourceFile.exists())) {
    throw new Error('Source file does not exist.');
  }

  const mimeType = (
    input.mimeType ||
    sourceFile.type ||
    'application/octet-stream'
  ).toLowerCase();
  const kind = input.kind ?? inferAttachmentKind(mimeType);
  const prefix = prefixForAttachment(kind, mimeType);
  const extension =
    extensionFromName(input.suggestedName) ||
    extensionFromName(input.sourcePath) ||
    extensionForMime(mimeType);
  const filePath = `attachments/${prefix}_${crypto
    .randomUUID()
    .slice(0, 8)}.${extension}`;
  const { fullPath, relativePath } = assertWorkspaceAttachmentPath(
    wsPath,
    filePath
  );

  // Stream the bytes through Bun.write to avoid loading the whole file into
  // memory; Bun handles BunFile -> path copies as a streamed operation.
  await Bun.write(fullPath, sourceFile);
  return { filePath: relativePath };
}
