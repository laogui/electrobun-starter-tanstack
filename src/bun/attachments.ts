import {
  link,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { Utils } from 'electrobun/bun';
import { fsyncDirectory } from './atomicWrite';
import { withNoteWorkspace } from './noteTransactions';
import {
  hasWorkspaceFileTransaction,
  journalWrite,
} from './workspaceFileJournal';
import { resolveWorkspaceSubpath } from './workspacePaths';

const DATA_URL_RE = /^data:([^;,]+)(?:;[^,]*)*;base64,(.+)$/i;
const SAFE_EXTENSION_RE = /^[a-z0-9]{1,12}$/;
/** Cap for the legacy `saveAttachment` data-URL RPC path (images, BlockNote, etc.). */
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

export function assertWorkspaceAttachmentPath(
  wsPath: string,
  filePath: string
): WorkspaceAttachmentPath {
  return resolveWorkspaceSubpath(wsPath, filePath, {
    dir: 'attachments',
    label: 'Attachment',
  });
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

function resolveAttachmentTarget(
  wsPath: string,
  input: {
    existingFile?: string;
    kind: AttachmentKind;
    mimeType: string;
    suggestedName?: string;
  }
): WorkspaceAttachmentPath {
  if (input.existingFile) {
    return assertWorkspaceAttachmentPath(wsPath, input.existingFile);
  }
  const mimeType = input.mimeType.toLowerCase();
  const prefix = prefixForAttachment(input.kind, mimeType);
  const extension =
    extensionFromName(input.suggestedName) || extensionForMime(mimeType);
  const filePath = `attachments/${prefix}_${crypto.randomUUID()}.${extension}`;
  return assertWorkspaceAttachmentPath(wsPath, filePath);
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

  const kind = input.kind ?? inferAttachmentKind(mimeType);
  return await saveAttachmentStream(wsPath, {
    ...input,
    body: new Uint8Array(buffer),
    kind,
    mimeType,
  });
}

interface SaveAttachmentStreamInput {
  body: NonNullable<ConstructorParameters<typeof Response>[0]>;
  existingFile?: string;
  kind?: AttachmentKind;
  mimeType?: string;
  suggestedName?: string;
}

/**
 * Persist a streamed upload into `attachments/` without decoding a data URL.
 * Used by the localhost `/attachment/upload` route so drag-and-drop imports
 * can copy bytes straight from the renderer `File` body.
 */
async function saveAttachmentStreamUnlocked(
  wsPath: string,
  input: SaveAttachmentStreamInput
): Promise<{ filePath: string }> {
  const mimeType = (input.mimeType ?? 'application/octet-stream').toLowerCase();
  const kind = input.kind ?? inferAttachmentKind(mimeType);
  let target = resolveAttachmentTarget(wsPath, { ...input, kind, mimeType });
  await mkdir(dirname(target.fullPath), { recursive: true });
  const tempPath = `${target.fullPath}.upload-${crypto.randomUUID()}.tmp`;
  // Exclusive staging creation prevents collisions from touching any existing file.
  const file = await open(tempPath, 'wx');
  try {
    const reader = new Response(input.body).body?.getReader();
    try {
      if (reader) {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) {
            break;
          }
          await file.writeFile(chunk.value);
        }
      }
      await file.sync();
    } finally {
      await reader?.cancel().catch(() => undefined);
      await file.close();
    }
    if (input.existingFile) {
      // Explicit replacement is atomic, so interruption preserves the old bytes.
      if (hasWorkspaceFileTransaction()) {
        await journalWrite(
          target.fullPath,
          new Uint8Array(await readFile(tempPath)),
          {},
          () => rename(tempPath, target.fullPath)
        );
      } else {
        await rename(tempPath, target.fullPath);
      }
    } else {
      for (let attempt = 0; ; attempt += 1) {
        try {
          // A hard link publishes completed bytes without replacing a collision.
          if (hasWorkspaceFileTransaction()) {
            await journalWrite(
              target.fullPath,
              new Uint8Array(await readFile(tempPath)),
              {},
              () => link(tempPath, target.fullPath)
            );
          } else {
            await link(tempPath, target.fullPath);
          }
          break;
        } catch (error) {
          if (
            (error as NodeJS.ErrnoException).code !== 'EEXIST' ||
            attempt >= 7
          ) {
            throw error;
          }
          target = resolveAttachmentTarget(wsPath, {
            ...input,
            kind,
            mimeType,
          });
        }
      }
    }
    await fsyncDirectory(dirname(target.fullPath));
    return { filePath: target.relativePath };
  } finally {
    await file.close().catch(() => undefined);
    await rm(tempPath, { force: true });
  }
}

async function loadAttachmentUnlocked(
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

async function attachmentExistsUnlocked(
  wsPath: string,
  filePath: string
): Promise<boolean> {
  const { fullPath } = assertWorkspaceAttachmentPath(wsPath, filePath);
  return await Bun.file(fullPath).exists();
}

/**
 * Extensions the OS would execute, install, or hand to an interpreter when
 * "opened". A shared or git-pulled workspace can contain any file, and files
 * the app copied in carry no quarantine flag, so these are never opened
 * directly; the user can still reveal them in the file manager.
 */
const BLOCKED_OPEN_EXTENSIONS = new Set([
  // macOS bundles, installers, and launchers
  'action',
  'app',
  'applescript',
  'command',
  'dmg',
  'fileloc',
  'inetloc',
  'kext',
  'mpkg',
  'osax',
  'pkg',
  'plugin',
  'prefpane',
  'scpt',
  'scptd',
  'service',
  'terminal',
  'tool',
  'workflow',
  'xpc',
  // Shell and interpreter scripts
  'bash',
  'csh',
  'fish',
  'ksh',
  'php',
  'pl',
  'py',
  'pyc',
  'pyw',
  'rb',
  'sh',
  'zsh',
  // Cross-platform runtimes and Linux packages
  'appimage',
  'deb',
  'desktop',
  'jar',
  'rpm',
  'run',
  // Windows executables and script hosts
  'bat',
  'cmd',
  'com',
  'cpl',
  'exe',
  'hta',
  'js',
  'jse',
  'lnk',
  'msc',
  'msi',
  'pif',
  'ps1',
  'psm1',
  'reg',
  'scr',
  'url',
  'vbe',
  'vbs',
  'wsf',
  'wsh',
]);

const EXECUTABLE_MODE_BITS = 0o111;

export type OpenAttachmentResult =
  | { success: true }
  | { error?: 'blocked-executable' | 'missing'; success: false };

/** True when the OS would run (rather than view) a file with this name. */
export function isBlockedOpenExtension(filePath: string): boolean {
  const name = filePath.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) {
    return false;
  }
  return BLOCKED_OPEN_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

export async function openAttachment(
  wsPath: string,
  filePath: string
): Promise<OpenAttachmentResult> {
  const { fullPath, relativePath } = assertWorkspaceAttachmentPath(
    wsPath,
    filePath
  );
  let mode: number;
  try {
    mode = (await stat(fullPath)).mode;
  } catch {
    return { success: false, error: 'missing' };
  }
  // Extension-less files with an exec bit (Mach-O binaries, shebang scripts)
  // launch in Terminal on macOS, so they are blocked too.
  // biome-ignore lint/suspicious/noBitwiseOperators: POSIX permission mask
  const executableBit = (mode & EXECUTABLE_MODE_BITS) !== 0;
  if (
    isBlockedOpenExtension(relativePath) ||
    (executableBit && !relativePath.split('/').pop()?.includes('.'))
  ) {
    console.warn(`[attachments] Refused to open executable ${relativePath}`);
    return { success: false, error: 'blocked-executable' };
  }
  return Utils.openPath(fullPath) ? { success: true } : { success: false };
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
  return await saveAttachmentStream(wsPath, {
    // BunFile implements Blob at runtime; Bun's published stream types differ
    // from the DOM Blob interface used by Response in this mixed TS project.
    body: sourceFile as unknown as Blob,
    kind,
    mimeType,
    suggestedName: input.suggestedName || input.sourcePath,
  });
}

export const saveAttachmentStream = (
  ...args: Parameters<typeof saveAttachmentStreamUnlocked>
) => withNoteWorkspace(args[0], () => saveAttachmentStreamUnlocked(...args));

export const loadAttachment = (
  ...args: Parameters<typeof loadAttachmentUnlocked>
) => withNoteWorkspace(args[0], () => loadAttachmentUnlocked(...args));

export const attachmentExists = (
  ...args: Parameters<typeof attachmentExistsUnlocked>
) => withNoteWorkspace(args[0], () => attachmentExistsUnlocked(...args));
