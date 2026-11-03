import {
  type AssetKind,
  type AssetNodeData,
  classifyFile,
  createAssetNodeData,
} from '@/lib/contentTypes';
import {
  resolveAttachmentStreamUrl,
  rpcGenerateVideoThumbnail,
  uploadAttachmentBlob,
} from '@/lib/rpc';
import {
  createAudioWaveform,
  createImageThumbnail,
  createVideoThumbnail,
  summarizeWaveform,
} from '@/lib/thumbnail';
import * as m from '../../paraglide/messages.js';

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
function assertAttachmentSaved(
  result: SaveAttachmentRpcResult | null | undefined,
  fileName: string
): string {
  const filePath = result?.filePath;
  if (!filePath) {
    throw new Error(m.asset_save_failed_workspace({ fileName }));
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
    reportProgress(0.08, m.asset_progress_reading_metadata());
    const videoMetadata = await createVideoThumbnail(file);
    const savedThumb = await saveVideoThumbnail(
      videoMetadata.thumbnailUrl,
      file.name
    );
    reportProgress(0.22, m.asset_progress_copying());
    return {
      ...(videoMetadata.duration ? { duration: videoMetadata.duration } : {}),
      ...savedThumb,
    };
  }
  if (kind === 'audio') {
    reportProgress(0.08, m.asset_progress_reading_metadata());
    const audioMetadata = await createAudioWaveform(file);
    reportProgress(0.18, m.asset_progress_copying());
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
    reportProgress(0.12, m.asset_progress_thumbnail());
    const imageThumb = await saveImageAssetThumbnail(file, file.name);
    reportProgress(0.22, m.asset_progress_copying());
    return imageThumb;
  }
  return {};
}

async function copyFileIntoWorkspace(
  file: File,
  classified: ReturnType<typeof classifyFile>,
  reportProgress: ProgressReporter
): Promise<SaveAttachmentRpcResult> {
  reportProgress(0.84, m.asset_progress_copying());
  const result = await uploadAttachmentBlob(file, {
    fileName: file.name,
    kind: classified.kind,
    mimeType: classified.mimeType,
  });
  reportProgress(0.96, m.asset_progress_copying());
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
  reportProgress(0.02, m.asset_progress_preparing());

  let [media, result] = await Promise.all([
    extractMediaMetadata(file, classified.kind, reportProgress),
    copyFileIntoWorkspace(file, classified, reportProgress),
  ]);
  const attachmentFile = assertAttachmentSaved(result, file.name);

  if (classified.kind === 'video') {
    media = await ensureVideoThumbnail(attachmentFile, media);
  }

  reportProgress(1, m.asset_progress_added());
  return buildAssetNodePayload(file, attachmentFile, result, media);
}
