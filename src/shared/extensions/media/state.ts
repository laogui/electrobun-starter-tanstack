import { type ExtensionPresentation, emptyPresentation } from '../presentation';

export interface ImageState {
  color: string;
  imageFile?: string;
  thumbnailFile?: string;
  title: string;
}

export interface FileState {
  archiveSummary?: { entryCount: number; topFiles: string[] };
  attachmentFile?: string;
  color: string;
  duration?: number;
  fileName: string;
  kind: 'video' | 'audio' | 'file';
  mimeType: string;
  previewExcerpt?: string;
  size?: number;
  thumbnailFile?: string;
  title: string;
  waveform?: number[];
}

export interface RecordingState {
  attachmentFile?: string;
  color: string;
  duration?: number;
  fileName: string;
  mimeType: string;
  recordingNumber: number;
  size?: number;
  title: string;
  waveform?: number[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function createImageInitialState(): ImageState {
  return { title: '', color: '#FFFFFF' };
}

export function createFileInitialState(): FileState {
  return {
    title: '',
    color: '#FFFFFF',
    fileName: '',
    mimeType: 'application/octet-stream',
    kind: 'file',
  };
}

export function isImageState(value: unknown): value is ImageState {
  return isRecord(value);
}

export function isFileState(value: unknown): value is FileState {
  return isRecord(value) && typeof value.fileName === 'string';
}

export function normalizeImageState(value: unknown): ImageState {
  const defaults = createImageInitialState();
  if (!isRecord(value)) {
    return defaults;
  }
  const imageFile = readString(value.imageFile);
  const thumbnailFile = readString(value.thumbnailFile);
  return {
    title: readString(value.title) ?? '',
    color: readString(value.color) ?? defaults.color,
    ...(imageFile ? { imageFile } : {}),
    ...(thumbnailFile ? { thumbnailFile } : {}),
  };
}

export function normalizeFileState(value: unknown): FileState {
  const defaults = createFileInitialState();
  if (!isRecord(value)) {
    return defaults;
  }
  const kind =
    value.kind === 'video' || value.kind === 'audio' || value.kind === 'file'
      ? value.kind
      : defaults.kind;
  const attachmentFile = readString(value.attachmentFile);
  const thumbnailFile = readString(value.thumbnailFile);
  const previewExcerpt = readString(value.previewExcerpt);
  return {
    title: readString(value.title) ?? '',
    color: readString(value.color) ?? defaults.color,
    fileName: readString(value.fileName) ?? '',
    mimeType: readString(value.mimeType) ?? defaults.mimeType,
    kind,
    ...(attachmentFile ? { attachmentFile } : {}),
    ...(thumbnailFile ? { thumbnailFile } : {}),
    ...(typeof value.duration === 'number' ? { duration: value.duration } : {}),
    ...(typeof value.size === 'number' ? { size: value.size } : {}),
    ...(previewExcerpt ? { previewExcerpt } : {}),
    ...(Array.isArray(value.waveform)
      ? {
          waveform: value.waveform.filter(
            (n): n is number => typeof n === 'number'
          ),
        }
      : {}),
    ...(isRecord(value.archiveSummary)
      ? {
          archiveSummary: {
            entryCount:
              typeof value.archiveSummary.entryCount === 'number'
                ? value.archiveSummary.entryCount
                : 0,
            topFiles: Array.isArray(value.archiveSummary.topFiles)
              ? value.archiveSummary.topFiles.filter(
                  (name): name is string => typeof name === 'string'
                )
              : [],
          },
        }
      : {}),
  };
}

/** Recording cards were retired; this only reads old recording state. */
export function normalizeRecordingState(value: unknown): RecordingState {
  const defaults: RecordingState = {
    title: '',
    color: '#FFFFFF',
    fileName: '',
    mimeType: 'audio/wav',
    recordingNumber: 1,
  };
  if (!isRecord(value)) {
    return defaults;
  }
  const attachmentFile = readString(value.attachmentFile);
  return {
    title: readString(value.title) ?? '',
    color: readString(value.color) ?? defaults.color,
    fileName: readString(value.fileName) ?? '',
    mimeType: readString(value.mimeType) ?? defaults.mimeType,
    recordingNumber:
      typeof value.recordingNumber === 'number' && value.recordingNumber > 0
        ? value.recordingNumber
        : 1,
    ...(attachmentFile ? { attachmentFile } : {}),
    ...(typeof value.duration === 'number' ? { duration: value.duration } : {}),
    ...(typeof value.size === 'number' ? { size: value.size } : {}),
    ...(Array.isArray(value.waveform)
      ? {
          waveform: value.waveform.filter(
            (n): n is number => typeof n === 'number'
          ),
        }
      : {}),
  };
}

export function buildImagePresentation(
  state: ImageState
): ExtensionPresentation {
  const title = state.title.trim() || 'Image';
  return {
    ...emptyPresentation(title),
    plainText: title,
    accessibilityLabel: title,
  };
}

export function buildFilePresentation(state: FileState): ExtensionPresentation {
  const title = state.title.trim() || state.fileName.trim() || 'File';
  return {
    ...emptyPresentation(title),
    subtitle: state.fileName || state.mimeType || undefined,
    plainText: [title, state.fileName, state.mimeType]
      .filter(Boolean)
      .join('\n'),
    accessibilityLabel: title,
  };
}

/**
 * Recording cards were retired; an old recording becomes an ordinary audio
 * file card that points at the same attachment, so nothing recorded is lost.
 */
export function fileStateFromRecording(state: RecordingState): FileState {
  return {
    title: state.title.trim() || `Recording #${state.recordingNumber}`,
    color: state.color,
    fileName: state.fileName,
    mimeType: state.mimeType,
    kind: 'audio',
    ...(state.attachmentFile ? { attachmentFile: state.attachmentFile } : {}),
    ...(state.duration !== undefined ? { duration: state.duration } : {}),
    ...(state.size !== undefined ? { size: state.size } : {}),
    ...(state.waveform ? { waveform: state.waveform } : {}),
  };
}

export function collectAttachmentPaths(state: unknown): string[] {
  if (!isRecord(state)) {
    return [];
  }
  const paths = [
    readString(state.attachmentFile),
    readString(state.imageFile),
    readString(state.thumbnailFile),
  ].filter((path): path is string => Boolean(path));
  return [...new Set(paths)];
}
