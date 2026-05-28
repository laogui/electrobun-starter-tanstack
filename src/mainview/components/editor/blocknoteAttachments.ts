import { rpcLoadAttachment, rpcSaveAttachment } from '@/lib/rpc';

/**
 * Map a File MIME type to one of the GhostBoard attachment kinds the
 * Bun pipeline recognises. Unknown types fall back to `'file'`.
 */
export function inferAttachmentKind(
  mimeType: string | undefined
): 'audio' | 'file' | 'image' | 'video' {
  if (!mimeType) {
    return 'file';
  }
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
        return;
      }
      reject(new Error('Unsupported FileReader result'));
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('Failed to read file'));
    });
    reader.readAsDataURL(file);
  });
}

/**
 * BlockNote `uploadFile` adapter. Persists the dropped/pasted/picked file
 * into the workspace `attachments/` folder via the existing Bun RPC and
 * returns the workspace-relative path so it can be embedded directly into
 * the BlockNote document and the Markdown mirror.
 *
 * The returned string is opaque to BlockNote — it is only resolved back to
 * a renderable URL via `resolveBlockNoteFileUrl`. Storing the relative path
 * (instead of a data URL) keeps the JSON sidecar and `.md` mirror compact
 * and portable across workspaces.
 */
export async function uploadBlockNoteFile(file: File): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  const response = await rpcSaveAttachment(dataUrl, undefined, {
    kind: inferAttachmentKind(file.type),
    mimeType: file.type || undefined,
    suggestedName: file.name,
  });
  if (!response?.filePath) {
    throw new Error('Failed to save attachment to workspace.');
  }
  return response.filePath;
}

const PASSTHROUGH_PROTOCOL_RE = /^(?:https?:|data:|blob:|file:)/i;

/**
 * BlockNote `resolveFileUrl` adapter. Already-resolvable URLs (http/https,
 * data:, blob:, file:) are passed through untouched; otherwise the value is
 * treated as a workspace attachment path and rehydrated to a data URL via
 * `rpcLoadAttachment`.
 */
export async function resolveBlockNoteFileUrl(url: string): Promise<string> {
  if (!url) {
    return url;
  }
  if (PASSTHROUGH_PROTOCOL_RE.test(url)) {
    return url;
  }
  try {
    const result = await rpcLoadAttachment(url);
    if (result?.dataUrl) {
      return result.dataUrl;
    }
  } catch (error) {
    console.warn('[blocknote] Failed to resolve attachment:', url, error);
  }
  // Fall back to the raw value so the UI can render a broken-link state
  // instead of silently swallowing the asset.
  return url;
}
