import {
  type AssetKind,
  type AssetNodeData,
  classifyFile,
  createAssetNodeData,
} from '@/lib/contentTypes';
import {
  resolveAttachmentStreamUrl,
  rpcGenerateVideoThumbnail,
  rpcSaveAttachmentFile,
  uploadAttachmentBlob,
} from '@/lib/rpc';
import {
  createAudioWaveform,
  createImageThumbnail,
  createVideoThumbnail,
  summarizeWaveform,
} from '@/lib/thumbnail';

// Re-export for the test surface that historically lived in this module.
export { summarizeWaveform };

export interface AssetImportProgress {
  fileName: string;
  label: string;
  progress: number;
}

export interface SaveAssetFileOptions {
  onProgress?: (progress: AssetImportProgress) => void;
}

type ProgressReporter = (progress: number, label: string) => void;

interface SaveAttachmentRpcResult {
  archiveSummary?: { entryCount: number; topFiles: string[] };
  filePath?: string;
  previewExcerpt?: string;
}

interface MediaMetadata {
  duration?: number;
  thumbnailFile?: string;
  thumbnailUrl?: string;
  waveform?: number[];
}

function createProgressReporter(
  file: File,
  options: SaveAssetFileOptions | undefined
): ProgressReporter {
  let currentProgress = 0;
  return (progress, label) => {
    currentProgress = Math.max(currentProgress, Math.min(1, progress));
    options?.onProgress?.({
      fileName: file.name,
      label,
      progress: currentProgress,
    });
  };
}

const FILE_EXT_RE = /\.[^.]+$/;
const WINDOWS_ABSOLUTE_PATH_RE = /^[A-Za-z]:[\\/]/;

/**
 * Desktop webviews may expose the dropped file's absolute OS path on the File
 * object. When present the Bun process can copy bytes without streaming them
 * through the renderer.
 */
export function getDesktopFilePath(file: File): string | undefined {
  const candidate = (file as File & { path?: unknown }).path;
  if (typeof candidate !== 'string') {
    return;
  }
  const trimmed = candidate.trim();
  if (!trimmed) {
    return;
  }
  if (trimmed.startsWith('/') || WINDOWS_ABSOLUTE_PATH_RE.test(trimmed)) {
    return trimmed;
  }
  return;
}

function assertAttachmentSaved(
  result: SaveAttachmentRpcResult | null | undefined,
  fileName: string
): string {
  const filePath = result?.filePath;
  if (!filePath) {
    throw new Error(
      `Failed to save "${fileName}" to the workspace. Is GhostBoard connected to a workspace?`
    );
  }
  return filePath;
}

function buildAssetNodePayload(
  file: File | { name: string; size?: number; type?: string },
  attachmentFile: string,
  result: SaveAttachmentRpcResult | null | undefined,
  media: MediaMetadata = {}
): AssetNodeData {
  const data = createAssetNodeData(file, { attachmentFile });
  return {
    ...data,
    ...(media.duration ? { duration: media.duration } : {}),
    ...(media.thumbnailFile ? { thumbnailFile: media.thumbnailFile } : {}),
    ...(media.thumbnailUrl ? { thumbnailUrl: media.thumbnailUrl } : {}),
    ...(media.waveform && media.waveform.length > 0
      ? { waveform: media.waveform }
      : {}),
    ...(result?.previewExcerpt
      ? { previewExcerpt: result.previewExcerpt }
      : {}),
    ...(result?.archiveSummary
      ? { archiveSummary: result.archiveSummary }
      : {}),
  };
}

async function persistThumbnailBlob(
  blob: Blob,
  suggestedName: string
): Promise<{ thumbnailFile?: string; thumbnailUrl?: string }> {
  try {
    const saved = await uploadAttachmentBlob(blob, {
      fileName: suggestedName,
      kind: 'image',
      mimeType: blob.type || 'image/jpeg',
    });
    if (!saved.filePath) {
      return {};
    }
    const thumbnailUrl = await resolveAttachmentStreamUrl(saved.filePath);
    return {
      thumbnailFile: saved.filePath,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
    };
  } catch {
    return {};
  }
}

async function saveVideoThumbnail(
  thumbnailUrl: string | undefined,
  suggestedName: string
): Promise<{ thumbnailFile?: string; thumbnailUrl?: string }> {
  if (!thumbnailUrl) {
    return {};
  }
  try {
    const response = await fetch(thumbnailUrl);
    const blob = await response.blob();
    const baseName = suggestedName.replace(FILE_EXT_RE, '') || 'video';
    return persistThumbnailBlob(blob, `${baseName}-thumbnail.jpg`);
  } catch {
    return {};
  }
}

async function saveImageAssetThumbnail(
  file: File,
  suggestedName: string
): Promise<{ thumbnailFile?: string; thumbnailUrl?: string }> {
  try {
    const objectUrl = URL.createObjectURL(file);
    try {
      const thumbnailDataUrl = await createImageThumbnail(objectUrl);
      if (!thumbnailDataUrl) {
        return persistThumbnailBlob(file, `${suggestedName}-thumbnail.jpg`);
      }
      const response = await fetch(thumbnailDataUrl);
      const blob = await response.blob();
      const baseName = suggestedName.replace(FILE_EXT_RE, '') || 'image';
      return persistThumbnailBlob(blob, `${baseName}-thumbnail.jpg`);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return {};
  }
}

async function extractMediaMetadata(
  file: File,
  kind: AssetKind,
  reportProgress: ProgressReporter
): Promise<MediaMetadata> {
  if (kind === 'video') {
    reportProgress(0.08, 'Reading media metadata');
    const videoMetadata = await createVideoThumbnail(file);
    const savedThumb = await saveVideoThumbnail(
      videoMetadata.thumbnailUrl,
      file.name
    );
    reportProgress(0.22, 'Copying file');
    return {
      ...(videoMetadata.duration ? { duration: videoMetadata.duration } : {}),
      ...savedThumb,
    };
  }
  if (kind === 'audio') {
    reportProgress(0.08, 'Reading media metadata');
    const audioMetadata = await createAudioWaveform(file);
    reportProgress(0.18, 'Copying file');
    return {
      ...(audioMetadata.duration ? { duration: audioMetadata.duration } : {}),
      ...(audioMetadata.waveform && audioMetadata.waveform.length > 0
        ? { waveform: audioMetadata.waveform }
        : {}),
    };
  }
  if (
    file.type.startsWith('image/') ||
    classifyFile(file).mimeType.startsWith('image/')
  ) {
    reportProgress(0.12, 'Generating thumbnail');
    const imageThumb = await saveImageAssetThumbnail(file, file.name);
    reportProgress(0.22, 'Copying file');
    return imageThumb;
  }
  return {};
}

async function copyFileIntoWorkspace(
  file: File,
  classified: ReturnType<typeof classifyFile>,
  reportProgress: ProgressReporter
): Promise<SaveAttachmentRpcResult> {
  const sourcePath = getDesktopFilePath(file);
  reportProgress(0.84, 'Copying file');
  if (sourcePath) {
    const result = await rpcSaveAttachmentFile(sourcePath, {
      kind: classified.kind,
      mimeType: classified.mimeType,
      suggestedName: file.name,
    });
    reportProgress(0.96, 'Copying file');
    return result ?? {};
  }
  const result = await uploadAttachmentBlob(file, {
    fileName: file.name,
    kind: classified.kind,
    mimeType: classified.mimeType,
  });
  reportProgress(0.96, 'Copying file');
  return result;
}

async function ensureVideoThumbnail(
  attachmentFile: string,
  media: MediaMetadata
): Promise<MediaMetadata> {
  if (media.thumbnailFile) {
    return media;
  }
  const generated = await rpcGenerateVideoThumbnail(attachmentFile);
  if (!generated?.thumbnailFile) {
    return media;
  }
  const thumbnailUrl = await resolveAttachmentStreamUrl(
    generated.thumbnailFile
  );
  return {
    ...media,
    thumbnailFile: generated.thumbnailFile,
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  };
}

export async function saveAssetFile(
  file: File,
  options?: SaveAssetFileOptions
): Promise<AssetNodeData> {
  const classified = classifyFile(file);
  const reportProgress = createProgressReporter(file, options);
  reportProgress(0.02, 'Preparing file');

  let media = await extractMediaMetadata(file, classified.kind, reportProgress);
  const result = await copyFileIntoWorkspace(file, classified, reportProgress);
  const attachmentFile = assertAttachmentSaved(result, file.name);

  if (classified.kind === 'video') {
    media = await ensureVideoThumbnail(attachmentFile, media);
  }

  reportProgress(1, 'Added to canvas');
  return buildAssetNodePayload(file, attachmentFile, result, media);
}

export interface SaveAssetFromPathInput {
  file?: File;
  fileName: string;
  mimeType?: string;
  size?: number;
  sourcePath: string;
}

/**
 * Save an asset whose bytes already live at a known OS path. When a matching
 * `File` is available, media metadata and thumbnails are extracted in the
 * renderer before the Bun process copies the bytes.
 */
export async function saveAssetFromPath(
  input: SaveAssetFromPathInput,
  options?: SaveAssetFileOptions
): Promise<AssetNodeData> {
  const classified = classifyFile({
    name: input.fileName,
    type: input.mimeType,
    size: input.size,
  });
  const fileLike = input.file ?? {
    name: input.fileName,
    type: input.mimeType,
    size: input.size,
  };

  let media: MediaMetadata = {};
  if (input.file) {
    const reportProgress = createProgressReporter(input.file, options);
    reportProgress(0.08, 'Reading media metadata');
    media = await extractMediaMetadata(
      input.file,
      classified.kind,
      reportProgress
    );
  }

  const result = await rpcSaveAttachmentFile(input.sourcePath, {
    kind: classified.kind,
    mimeType: classified.mimeType,
    suggestedName: input.fileName,
  });
  const attachmentFile = assertAttachmentSaved(result, input.fileName);

  if (classified.kind === 'video') {
    media = await ensureVideoThumbnail(attachmentFile, media);
  }

  return buildAssetNodePayload(fileLike, attachmentFile, result, media);
}
