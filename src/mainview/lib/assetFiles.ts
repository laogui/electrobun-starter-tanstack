import {
  type AssetNodeData,
  classifyFile,
  createAssetNodeData,
} from '@/lib/contentTypes';
import { rpcSaveAttachment, rpcSaveAttachmentFile } from '@/lib/rpc';
import {
  createAudioWaveform,
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

function readFileAsDataUrl(
  file: File,
  reportProgress: ProgressReporter,
  progressStart: number,
  progressEnd: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('progress', (event) => {
      if (!(event.lengthComputable && event.total > 0)) {
        return;
      }
      const ratio = event.loaded / event.total;
      reportProgress(
        progressStart + ratio * (progressEnd - progressStart),
        'Reading file'
      );
    });
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        reportProgress(progressEnd, 'Reading file');
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

async function saveVideoThumbnail(
  thumbnailUrl: string | undefined,
  suggestedName: string
): Promise<string | undefined> {
  if (!thumbnailUrl) {
    return;
  }
  try {
    const saved = await rpcSaveAttachment(thumbnailUrl, undefined, {
      kind: 'image',
      mimeType: 'image/jpeg',
      suggestedName: `${suggestedName || 'video'}-thumbnail.jpg`,
    });
    return saved?.filePath;
  } catch {
    return;
  }
}

export async function saveAssetFile(
  file: File,
  options?: SaveAssetFileOptions
): Promise<AssetNodeData> {
  const classified = classifyFile(file);
  const reportProgress = createProgressReporter(file, options);
  reportProgress(0.02, 'Preparing file');

  const isMedia = classified.kind === 'video' || classified.kind === 'audio';
  let videoMetadata: { duration?: number; thumbnailUrl?: string } = {};
  let audioMetadata: { duration?: number; waveform?: number[] } = {};
  if (classified.kind === 'video') {
    reportProgress(0.08, 'Reading media metadata');
    videoMetadata = await createVideoThumbnail(file);
    reportProgress(0.22, 'Reading file');
  } else if (classified.kind === 'audio') {
    reportProgress(0.08, 'Reading media metadata');
    audioMetadata = await createAudioWaveform(file);
    reportProgress(0.18, 'Reading file');
  }

  const dataUrl = await readFileAsDataUrl(
    file,
    reportProgress,
    isMedia ? 0.22 : 0.08,
    0.78
  );
  reportProgress(0.84, 'Saving attachment');
  const result = await rpcSaveAttachment(dataUrl, undefined, {
    kind: classified.kind,
    mimeType: classified.mimeType,
    suggestedName: file.name,
  });
  reportProgress(0.9, 'Saving attachment');
  let thumbnailFile: string | undefined;
  if (classified.kind === 'video') {
    reportProgress(0.92, 'Saving thumbnail');
    thumbnailFile = await saveVideoThumbnail(
      videoMetadata.thumbnailUrl,
      file.name
    );
    reportProgress(0.96, 'Saving thumbnail');
  } else if (classified.kind === 'audio') {
    reportProgress(0.94, 'Reading waveform');
  }

  const duration = videoMetadata.duration ?? audioMetadata.duration;
  const waveform = audioMetadata.waveform;
  const data = createAssetNodeData(file, {
    attachmentFile: result?.filePath,
  });
  reportProgress(1, 'Added to canvas');
  return {
    ...data,
    ...(duration ? { duration } : {}),
    ...(thumbnailFile ? { thumbnailFile } : {}),
    ...(videoMetadata.thumbnailUrl
      ? { thumbnailUrl: videoMetadata.thumbnailUrl }
      : {}),
    ...(waveform && waveform.length > 0 ? { waveform } : {}),
  };
}

export interface SaveAssetFromPathInput {
  fileName: string;
  mimeType?: string;
  size?: number;
  sourcePath: string;
}

/**
 * Save an asset whose bytes already live at a known OS path. This is the
 * "large file" import path: it skips the data URL round-trip (capped at
 * 25 MB) and lets the Bun main process copy the file directly. Media
 * metadata and thumbnails are skipped because the renderer never reads the
 * bytes — callers can generate them lazily once the asset is hydrated.
 */
export async function saveAssetFromPath(
  input: SaveAssetFromPathInput
): Promise<AssetNodeData> {
  const classified = classifyFile({
    name: input.fileName,
    type: input.mimeType,
    size: input.size,
  });
  const result = await rpcSaveAttachmentFile(input.sourcePath, {
    kind: classified.kind,
    mimeType: classified.mimeType,
    suggestedName: input.fileName,
  });
  return createAssetNodeData(
    { name: input.fileName, type: input.mimeType, size: input.size },
    { attachmentFile: result?.filePath }
  );
}
