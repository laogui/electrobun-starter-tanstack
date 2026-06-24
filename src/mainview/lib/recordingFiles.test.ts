// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveRecording } from '@/lib/recordingFiles';

const uploadAttachmentBlobMock = vi.hoisted(() => vi.fn());
const resolveAttachmentStreamUrlMock = vi.hoisted(() => vi.fn());
const createAudioWaveformMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rpc', () => ({
  resolveAttachmentStreamUrl: resolveAttachmentStreamUrlMock,
  uploadAttachmentBlob: uploadAttachmentBlobMock,
}));

vi.mock('@/lib/thumbnail', () => ({
  createAudioWaveform: createAudioWaveformMock,
}));

describe('saveRecording', () => {
  afterEach(() => {
    uploadAttachmentBlobMock.mockReset();
    resolveAttachmentStreamUrlMock.mockReset();
    createAudioWaveformMock.mockReset();
  });

  it('saves an m4a attachment with waveform metadata and a stream URL', async () => {
    createAudioWaveformMock.mockResolvedValueOnce({
      duration: 12.5,
      waveform: [0.1, 0.8],
    });
    uploadAttachmentBlobMock.mockResolvedValueOnce({
      filePath: 'attachments/recording_abc.m4a',
    });
    resolveAttachmentStreamUrlMock.mockResolvedValueOnce(
      'http://127.0.0.1:4242/attachment?path=recording_abc.m4a'
    );
    const blob = new Blob(['audio'], { type: 'audio/mp4' });

    await expect(
      saveRecording({
        blob,
        durationMs: 9000,
        mimeType: 'audio/mp4',
        recordingNumber: 6,
      })
    ).resolves.toEqual({
      attachmentFile: 'attachments/recording_abc.m4a',
      color: '#FFFFFF',
      duration: 12.5,
      fileName: 'recording-6.m4a',
      mimeType: 'audio/mp4',
      previewUrl: 'http://127.0.0.1:4242/attachment?path=recording_abc.m4a',
      recordingNumber: 6,
      size: 5,
      title: '',
      waveform: [0.1, 0.8],
    });

    expect(uploadAttachmentBlobMock).toHaveBeenCalledWith(blob, {
      fileName: 'recording-6.m4a',
      kind: 'audio',
      mimeType: 'audio/mp4',
    });
  });

  it('falls back to recorder duration when waveform extraction fails', async () => {
    createAudioWaveformMock.mockRejectedValueOnce(new Error('decode failed'));
    uploadAttachmentBlobMock.mockResolvedValueOnce({
      filePath: 'attachments/recording_abc.webm',
    });
    resolveAttachmentStreamUrlMock.mockResolvedValueOnce(undefined);

    const result = await saveRecording({
      blob: new Blob(['audio'], { type: 'audio/webm' }),
      durationMs: 4500,
      mimeType: 'audio/webm',
      recordingNumber: 2,
    });

    expect(result).toMatchObject({
      attachmentFile: 'attachments/recording_abc.webm',
      duration: 4.5,
      fileName: 'recording-2.webm',
      recordingNumber: 2,
    });
    expect(result).not.toHaveProperty('previewUrl');
    expect(result).not.toHaveProperty('waveform');
  });

  it('throws when the attachment upload does not return a workspace file path', async () => {
    createAudioWaveformMock.mockResolvedValueOnce({});
    uploadAttachmentBlobMock.mockResolvedValueOnce({});

    await expect(
      saveRecording({
        blob: new Blob(['audio'], { type: 'audio/ogg' }),
        durationMs: 1000,
        mimeType: 'audio/ogg',
        recordingNumber: 1,
      })
    ).rejects.toThrow('Failed to save the recording to the workspace.');
  });
});
