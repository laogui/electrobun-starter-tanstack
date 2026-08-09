import type { RecordingNodeData } from '@/lib/contentTypes';
import {
  resolveAttachmentStreamUrl,
  rpcSaveAttachment,
  uploadAttachmentBlob,
} from '@/lib/rpc';

/** Map a recorder MIME type to a friendly file extension for the saved memo. */
function extensionForMime(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.startsWith('audio/mp4')) {
    return 'm4a';
  }
  if (normalized.startsWith('audio/webm')) {
    return 'webm';
  }
  if (normalized.startsWith('audio/ogg')) {
    return 'ogg';
  }
  if (normalized.startsWith('audio/wav')) {
    return 'wav';
  }
  if (normalized.startsWith('audio/mpeg')) {
    return 'mp3';
  }
  return 'audio';
}

/** Prefer RPC data-URL for voice memos under this size (25 MB hard cap on Bun). */
const RPC_DATA_URL_MAX_BYTES = 20 * 1024 * 1024;
/** Hard ceiling so a hung RPC / fetch never leaves the UI on "Saving…". */
const SAVE_TIMEOUT_MS = 12_000;
const PREVIEW_URL_TIMEOUT_MS = 2000;

export interface SaveRecordingInput {
  blob: Blob;
  /** Wall-clock recording length in ms, used as a duration fallback. */
  durationMs: number;
  mimeType: string;
  recordingNumber: number;
  /** Optional peaks computed during capture (avoids re-decoding the blob). */
  waveform?: number[];
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => T | Promise<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        resolve(onTimeout());
      } catch (error) {
        reject(error);
      }
    }, timeoutMs);
    promise.then(
      (value) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Encode a Blob as a `data:` URL via FileReader.
 *
 * Avoids hand-rolling base64 with `String.fromCharCode(...largeSlice)`, which
 * can throw RangeError under WKWebView's argument-count limits. FileReader is
 * the browser-native path for Blob → data URL and works reliably in WebKit.
 */
function blobToDataUrl(blob: Blob, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const timer = window.setTimeout(() => {
      try {
        reader.abort();
      } catch {
        // ignore
      }
      reject(new Error('Timed out serializing recording blob.'));
    }, 8000);
    reader.onload = () => {
      window.clearTimeout(timer);
      if (typeof reader.result === 'string') {
        const comma = reader.result.indexOf(',');
        const base64 =
          comma >= 0 ? reader.result.slice(comma + 1) : reader.result;
        resolve(
          `data:${mimeType || 'application/octet-stream'};base64,${base64}`
        );
        return;
      }
      reject(new Error('Unable to serialize recording blob.'));
    };
    reader.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('Unable to serialize recording blob.'));
    };
    reader.readAsDataURL(blob);
  });
}

async function persistRecordingBlob(
  blob: Blob,
  options: { fileName: string; mimeType: string }
): Promise<{ filePath?: string }> {
  // Voice memos are typically well under the RPC data-URL cap. Prefer RPC over
  // the localhost HTTP bridge — WKWebView has been observed to leave
  // `fetch(127.0.0.1/attachment/upload)` pending forever with a Blob body,
  // which previously stuck the UI on "Saving recording…".
  if (blob.size > 0 && blob.size <= RPC_DATA_URL_MAX_BYTES) {
    try {
      const dataUrl = await blobToDataUrl(blob, options.mimeType);
      const saved = await rpcSaveAttachment(dataUrl, undefined, {
        kind: 'audio',
        mimeType: options.mimeType,
        suggestedName: options.fileName,
      });
      if (saved?.filePath) {
        return saved;
      }
    } catch (error) {
      console.warn(
        '[recording] RPC save failed, falling back to HTTP upload:',
        error
      );
    }
  }

  return uploadAttachmentBlob(blob, {
    fileName: options.fileName,
    kind: 'audio',
    mimeType: options.mimeType,
  });
}

/**
 * Persist a captured microphone Blob as a regular audio attachment and build
 * the `recording` node payload. Uses the RPC data-URL path for typical voice
 * memo sizes so we never depend on a potentially hung localhost upload.
 *
 * Waveform decoding is intentionally NOT performed here — callers should pass
 * peaks captured live during recording. Re-decoding MediaRecorder/WAV blobs
 * via AudioContext has hung indefinitely on WKWebView.
 */
export async function saveRecording(
  input: SaveRecordingInput
): Promise<RecordingNodeData> {
  const ext = extensionForMime(input.mimeType);
  const fileName = `recording-${input.recordingNumber}.${ext}`;

  const savePromise = (async (): Promise<RecordingNodeData> => {
    const saved = await persistRecordingBlob(input.blob, {
      fileName,
      mimeType: input.mimeType,
    });
    if (!saved?.filePath) {
      throw new Error('Failed to save the recording to the workspace.');
    }

    // Stream URL is nice-to-have for immediate playback; never block the node
    // on a slow/hung local HTTP endpoint lookup.
    const previewUrl =
      (await withTimeout(
        resolveAttachmentStreamUrl(saved.filePath).catch(() => null),
        PREVIEW_URL_TIMEOUT_MS,
        () => null
      )) ?? undefined;

    const duration = input.durationMs > 0 ? input.durationMs / 1000 : undefined;

    return {
      attachmentFile: saved.filePath,
      color: '#FFFFFF',
      ...(duration ? { duration } : {}),
      fileName,
      mimeType: input.mimeType,
      ...(previewUrl ? { previewUrl } : {}),
      recordingNumber: input.recordingNumber,
      ...(input.blob.size ? { size: input.blob.size } : {}),
      title: '',
      ...(input.waveform && input.waveform.length > 0
        ? { waveform: input.waveform }
        : {}),
    };
  })();

  return withTimeout(savePromise, SAVE_TIMEOUT_MS, () => {
    throw new Error('Timed out while saving the recording.');
  });
}
