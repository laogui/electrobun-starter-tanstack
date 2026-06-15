import { classifyFile } from '@/lib/contentTypes';
import { rpcSaveAttachment } from '@/lib/rpc';
import { createImageThumbnail } from '@/lib/thumbnail';

const FILE_EXT_RE = /\.[^.]+$/;

export function isImageFile(file: File): boolean {
  return classifyFile(file).mimeType.startsWith('image/');
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
