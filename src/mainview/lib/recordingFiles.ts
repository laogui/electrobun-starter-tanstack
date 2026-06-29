import type { RecordingNodeData } from '@/lib/contentTypes';
import { resolveAttachmentStreamUrl, uploadAttachmentBlob } from '@/lib/rpc';
import { createAudioWaveform } from '@/lib/thumbnail';

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

export interface SaveRecordingInput {
  blob: Blob;
  /** Wall-clock recording length in ms, used as a duration fallback. */
  durationMs: number;
  mimeType: string;
  recordingNumber: number;
}

/**
 * Persist a captured microphone Blob as a regular audio attachment and build
 * the `recording` node payload (waveform + duration + stream URL). Reuses the
 * shared attachment-upload bridge so recordings live alongside other media in
 * the workspace `attachments/` directory.
 */
export async function saveRecording(
  input: SaveRecordingInput
): Promise<RecordingNodeData> {
  const ext = extensionForMime(input.mimeType);
  const fileName = `recording-${input.recordingNumber}.${ext}`;

  // Compute the waveform/duration from the in-memory blob before upload so the
  // card can render its peaks immediately. Best-effort: both may be omitted.
  const file = new File([input.blob], fileName, { type: input.mimeType });
  const [media, saved] = await Promise.all([
    createAudioWaveform(file).catch(
      () =>
        ({}) as {
          duration?: number;
          waveform?: number[];
        }
    ),
    uploadAttachmentBlob(input.blob, {
      fileName,
      kind: 'audio',
      mimeType: input.mimeType,
    }),
  ]);
  if (!saved.filePath) {
    throw new Error('Failed to save the recording to the workspace.');
  }

  const previewUrl = await resolveAttachmentStreamUrl(saved.filePath).catch(
    () => undefined
  );

  const duration =
    typeof media.duration === 'number' && media.duration > 0
      ? media.duration
      : input.durationMs / 1000;

  return {
    attachmentFile: saved.filePath,
    color: '#FFFFFF',
    ...(duration > 0 ? { duration } : {}),
    fileName,
    mimeType: input.mimeType,
    ...(previewUrl ? { previewUrl } : {}),
    recordingNumber: input.recordingNumber,
    ...(input.blob.size ? { size: input.blob.size } : {}),
    title: '',
    ...(media.waveform && media.waveform.length > 0
      ? { waveform: media.waveform }
      : {}),
  };
}
