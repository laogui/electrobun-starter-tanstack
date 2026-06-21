/**
 * Thumbnail and waveform extraction helpers for canvas asset previews.
 *
 * These run inside the renderer because they depend on the DOM (`Image`,
 * `<video>`, `<audio>`, `AudioContext`, `<canvas>`). They are best-effort:
 * callers must tolerate a `null` / `undefined` result and fall back to a
 * non-preview rendering when the source cannot be decoded.
 */

const DEFAULT_IMAGE_MAX_EDGE = 480;
const DEFAULT_IMAGE_QUALITY = 0.82;
const DEFAULT_IMAGE_MIME_TYPE = 'image/jpeg';

const MEDIA_METADATA_TIMEOUT_MS = 4500;
const VIDEO_THUMBNAIL_MAX_EDGE = 640;
const VIDEO_THUMBNAIL_QUALITY = 0.82;
const VIDEO_THUMBNAIL_SEEK_FRACTIONS = [0.1, 0.25, 0.5, 0] as const;
const AUDIO_WAVEFORM_SAMPLE_COUNT = 48;
const AUDIO_WAVEFORM_MAX_DURATION_S = 10 * 60;

export interface CreateImageThumbnailOptions {
  /** Largest edge (in pixels) of the resulting thumbnail. */
  maxEdge?: number;
  /** Output MIME type. WebP and JPEG are sensible choices. */
  mimeType?: string;
  /** Encoder quality between 0 and 1. */
  quality?: number;
}

export interface VideoThumbnailResult {
  duration?: number;
  thumbnailUrl?: string;
}

export interface AudioWaveformResult {
  duration?: number;
  waveform?: number[];
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image failed to load.'));
    image.src = src;
  });
}

function computeImageThumbnailSize(
  sourceWidth: number,
  sourceHeight: number,
  maxEdge: number
): { width: number; height: number } {
  const longestEdge = Math.max(sourceWidth, sourceHeight);
  if (longestEdge <= maxEdge) {
    return {
      width: Math.max(1, Math.round(sourceWidth)),
      height: Math.max(1, Math.round(sourceHeight)),
    };
  }
  const scale = maxEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

/**
 * Generate a small JPEG/WebP preview from an image data URL. Returns `null`
 * when the source already fits within `maxEdge` or the runtime lacks a DOM.
 */
export async function createImageThumbnail(
  imageDataUrl: string,
  options: CreateImageThumbnailOptions = {}
): Promise<string | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return null;
  }
  const maxEdge = options.maxEdge ?? DEFAULT_IMAGE_MAX_EDGE;
  const mimeType = options.mimeType ?? DEFAULT_IMAGE_MIME_TYPE;
  const quality = options.quality ?? DEFAULT_IMAGE_QUALITY;

  try {
    const image = await loadImageElement(imageDataUrl);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!(sourceWidth && sourceHeight)) {
      return null;
    }
    if (Math.max(sourceWidth, sourceHeight) <= maxEdge) {
      return null;
    }

    const { width, height } = computeImageThumbnailSize(
      sourceWidth,
      sourceHeight,
      maxEdge
    );
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL(mimeType, quality);
  } catch {
    return null;
  }
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

/**
 * Extract a still-frame thumbnail and duration from a video file. Returns an
 * empty object if the runtime lacks `URL.createObjectURL` or decoding fails.
 */
export async function createVideoThumbnail(
  file: File
): Promise<VideoThumbnailResult> {
  if (!('createObjectURL' in URL)) {
    return {};
  }

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

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
  } catch {
    return {};
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

type AudioContextLike = AudioContext & { close(): Promise<void> };

function getAudioContextConstructor(): (new () => AudioContextLike) | null {
  const w = globalThis as unknown as {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
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

async function extractAudioDuration(file: File): Promise<number | undefined> {
  if (!('createObjectURL' in URL)) {
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  try {
    audio.src = objectUrl;
    await waitForMediaEvent(audio, 'loadedmetadata');
    return finiteDuration(audio.duration);
  } catch {
    return;
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

async function decodeAudioWaveform(
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

/**
 * Extract the duration and a small waveform summary from an audio file.
 * Both fields are best-effort and may be omitted independently when decoding
 * fails or the file is too long to summarize.
 */
export async function createAudioWaveform(
  file: File
): Promise<AudioWaveformResult> {
  const duration = await extractAudioDuration(file);
  const waveform = await decodeAudioWaveform(file, duration);
  return {
    ...(duration ? { duration } : {}),
    ...(waveform && waveform.length > 0 ? { waveform } : {}),
  };
}
