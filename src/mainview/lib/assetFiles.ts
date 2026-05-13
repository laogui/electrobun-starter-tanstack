import {
  type AssetKind,
  type AssetNodeData,
  classifyFile,
  createAssetNodeData,
} from '@/lib/contentTypes';
import { rpcSaveAttachment } from '@/lib/rpc';

const MEDIA_METADATA_TIMEOUT_MS = 4500;
const VIDEO_THUMBNAIL_MAX_EDGE = 640;
const VIDEO_THUMBNAIL_QUALITY = 0.82;
const VIDEO_THUMBNAIL_SEEK_FRACTIONS = [0.1, 0.25, 0.5, 0] as const;
const AUDIO_WAVEFORM_SAMPLE_COUNT = 48;
const AUDIO_WAVEFORM_MAX_DURATION_S = 10 * 60;

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

function finiteDuration(value: number): number | undefined {
  if (!(Number.isFinite(value) && value > 0)) {
    return;
  }
  return value;
}

function waitForMediaEvent(
  media: HTMLMediaElement,
  eventName: 'loadeddata' | 'loadedmetadata' | 'seeked'
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}.`));
    }, MEDIA_METADATA_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeout);
      media.removeEventListener(eventName, handleReady);
      media.removeEventListener('error', handleError);
    };

    const handleReady = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error(`Media ${eventName} failed.`));
    };

    media.addEventListener(eventName, handleReady, { once: true });
    media.addEventListener('error', handleError, { once: true });
  });
}

function sizeVideoThumbnail(video: HTMLVideoElement): {
  height: number;
  width: number;
} {
  const sourceWidth = video.videoWidth || VIDEO_THUMBNAIL_MAX_EDGE;
  const sourceHeight = video.videoHeight || VIDEO_THUMBNAIL_MAX_EDGE;
  const scale = Math.min(
    VIDEO_THUMBNAIL_MAX_EDGE / sourceWidth,
    VIDEO_THUMBNAIL_MAX_EDGE / sourceHeight,
    1
  );
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

function drawVideoThumbnail(video: HTMLVideoElement): string | undefined {
  const { width, height } = sizeVideoThumbnail(video);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }
  context.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', VIDEO_THUMBNAIL_QUALITY);
}

async function captureVideoThumbnail(
  video: HTMLVideoElement,
  duration: number | undefined
): Promise<string | undefined> {
  if (!(video.videoWidth && video.videoHeight)) {
    await waitForMediaEvent(video, 'loadeddata');
  }

  // Try a sequence of seek targets so codecs that fail at one timestamp can
  // still produce a usable thumbnail. The frame may be black at t=0 for some
  // encoders, so prefer a small offset first and fall back to the start.
  const candidates: number[] = duration
    ? VIDEO_THUMBNAIL_SEEK_FRACTIONS.map((fraction) => {
        if (fraction === 0) {
          return 0;
        }
        return Math.min(Math.max(0.5, duration * fraction), duration - 0.01);
      })
    : [0];

  let lastError: unknown;
  for (const target of candidates) {
    try {
      if (target > 0) {
        video.currentTime = target;
        await waitForMediaEvent(video, 'seeked');
      }
      const dataUrl = drawVideoThumbnail(video);
      if (dataUrl) {
        return dataUrl;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }
  return;
}

async function extractVideoMetadata(file: File): Promise<{
  duration?: number;
  thumbnailUrl?: string;
}> {
  if (!('createObjectURL' in URL)) {
    return {};
  }

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';

  try {
    video.src = objectUrl;
    await waitForMediaEvent(video, 'loadedmetadata');
    const duration = finiteDuration(video.duration);
    let thumbnailUrl: string | undefined;
    try {
      thumbnailUrl = await captureVideoThumbnail(video, duration);
    } catch {
      thumbnailUrl = undefined;
    }
    return { duration, thumbnailUrl };
  } finally {
    video.removeAttribute('src');
    try {
      video.load();
    } catch {
      // jsdom and some embedded runtimes do not implement media reset.
    }
    URL.revokeObjectURL(objectUrl);
  }
}

async function extractAudioMetadata(file: File): Promise<{
  duration?: number;
}> {
  if (!('createObjectURL' in URL)) {
    return {};
  }

  const objectUrl = URL.createObjectURL(file);
  const audio = document.createElement('audio');
  audio.preload = 'metadata';

  try {
    audio.src = objectUrl;
    await waitForMediaEvent(audio, 'loadedmetadata');
    return { duration: finiteDuration(audio.duration) };
  } finally {
    audio.removeAttribute('src');
    try {
      audio.load();
    } catch {
      // jsdom and some embedded runtimes do not implement media reset.
    }
    URL.revokeObjectURL(objectUrl);
  }
}

type AudioContextLike = AudioContext & { close(): Promise<void> };

function getAudioContextConstructor(): (new () => AudioContextLike) | null {
  const w = globalThis as unknown as {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Reduce a PCM channel to a small array of normalized peak amplitudes that
 * can be persisted in the manifest. Values are clamped to the [0, 1] range
 * so renderers can scale them to bar heights without further bookkeeping.
 */
export function summarizeWaveform(
  channel: Float32Array,
  sampleCount = AUDIO_WAVEFORM_SAMPLE_COUNT
): number[] {
  if (sampleCount <= 0 || channel.length === 0) {
    return [];
  }
  const buckets = Math.max(1, Math.floor(sampleCount));
  const bucketSize = Math.max(1, Math.floor(channel.length / buckets));
  const peaks = new Array<number>(buckets);
  let maxPeak = 0;
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const start = bucket * bucketSize;
    const end =
      bucket === buckets - 1
        ? channel.length
        : Math.min(start + bucketSize, channel.length);
    let peak = 0;
    for (let index = start; index < end; index += 1) {
      const value = Math.abs(channel[index] ?? 0);
      if (value > peak) {
        peak = value;
      }
    }
    peaks[bucket] = peak;
    if (peak > maxPeak) {
      maxPeak = peak;
    }
  }
  if (maxPeak <= 0) {
    return peaks.fill(0);
  }
  return peaks.map((value) => Math.min(1, value / maxPeak));
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }
      reject(new Error('Unable to read file as ArrayBuffer.'));
    });
    reader.addEventListener('error', () => {
      reject(new Error('Unable to read file.'));
    });
    reader.readAsArrayBuffer(file);
  });
}

async function extractAudioWaveform(
  file: File,
  duration: number | undefined
): Promise<number[] | undefined> {
  // Skip very long clips to keep decode time and memory bounded; the waveform
  // is decorative and a stable fallback bar set already exists.
  if (duration && duration > AUDIO_WAVEFORM_MAX_DURATION_S) {
    return;
  }
  const Ctor = getAudioContextConstructor();
  if (!Ctor) {
    return;
  }

  let context: AudioContextLike | null = null;
  try {
    const buffer = await readFileAsArrayBuffer(file);
    context = new Ctor();
    const decoded = await context.decodeAudioData(buffer.slice(0));
    const channel = decoded.getChannelData(0);
    return summarizeWaveform(channel);
  } catch {
    return;
  } finally {
    try {
      await context?.close();
    } catch {
      // Some runtimes (jsdom) do not implement close(); ignore.
    }
  }
}

async function extractMediaMetadata(
  file: File,
  kind: AssetKind
): Promise<{ duration?: number; thumbnailUrl?: string }> {
  try {
    if (kind === 'video') {
      return await extractVideoMetadata(file);
    }
    if (kind === 'audio') {
      return await extractAudioMetadata(file);
    }
  } catch {
    // Media metadata and thumbnails are best-effort; a playable attachment is
    // more important than blocking node creation on codec/browser quirks.
  }
  return {};
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
  let mediaMetadata: { duration?: number; thumbnailUrl?: string } = {};
  if (isMedia) {
    reportProgress(0.08, 'Reading media metadata');
    mediaMetadata = await extractMediaMetadata(file, classified.kind);
    reportProgress(classified.kind === 'video' ? 0.22 : 0.18, 'Reading file');
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
  if (classified.kind === 'video') {
    reportProgress(0.92, 'Saving thumbnail');
  }
  const thumbnailFile =
    classified.kind === 'video'
      ? await saveVideoThumbnail(mediaMetadata.thumbnailUrl, file.name)
      : undefined;
  if (classified.kind === 'video') {
    reportProgress(0.96, 'Saving thumbnail');
  }

  let waveform: number[] | undefined;
  if (classified.kind === 'audio') {
    reportProgress(0.94, 'Reading waveform');
    waveform = await extractAudioWaveform(file, mediaMetadata.duration);
  }

  const data = createAssetNodeData(file, {
    attachmentFile: result?.filePath,
  });
  reportProgress(1, 'Added to canvas');
  return {
    ...data,
    ...(mediaMetadata.duration ? { duration: mediaMetadata.duration } : {}),
    ...(thumbnailFile ? { thumbnailFile } : {}),
    ...(mediaMetadata.thumbnailUrl
      ? { thumbnailUrl: mediaMetadata.thumbnailUrl }
      : {}),
    ...(waveform && waveform.length > 0 ? { waveform } : {}),
  };
}
