// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveRecording } from '@/lib/recordingFiles';

const rpcSaveAttachmentMock = vi.hoisted(() => vi.fn());
const uploadAttachmentBlobMock = vi.hoisted(() => vi.fn());
const resolveAttachmentStreamUrlMock = vi.hoisted(() => vi.fn());

const DATA_URL_WAV_RE = /^data:audio\/wav;base64,/;

vi.mock('@/lib/rpc', () => ({
  resolveAttachmentStreamUrl: resolveAttachmentStreamUrlMock,
  rpcSaveAttachment: rpcSaveAttachmentMock,
  uploadAttachmentBlob: uploadAttachmentBlobMock,
}));

describe('saveRecording', () => {
  afterEach(() => {
    rpcSaveAttachmentMock.mockReset();
    uploadAttachmentBlobMock.mockReset();
    resolveAttachmentStreamUrlMock.mockReset();
  });

  it('saves via RPC data URL with caller-supplied waveform and a stream URL', async () => {
    rpcSaveAttachmentMock.mockResolvedValueOnce({
      filePath: 'attachments/recording_abc.wav',
    });
    resolveAttachmentStreamUrlMock.mockResolvedValueOnce(
      'http://127.0.0.1:4242/attachment?path=recording_abc.wav'
    );
    const blob = new Blob(['audio-bytes'], { type: 'audio/wav' });

    await expect(
      saveRecording({
        blob,
        durationMs: 9000,
        mimeType: 'audio/wav',
        recordingNumber: 6,
        waveform: [0.1, 0.8],
      })
    ).resolves.toEqual({
      attachmentFile: 'attachments/recording_abc.wav',
      color: '#FFFFFF',
      duration: 9,
      fileName: 'recording-6.wav',
      mimeType: 'audio/wav',
      previewUrl: 'http://127.0.0.1:4242/attachment?path=recording_abc.wav',
      recordingNumber: 6,
      size: 11,
      title: '',
      waveform: [0.1, 0.8],
    });

    expect(rpcSaveAttachmentMock).toHaveBeenCalledTimes(1);
    const [dataUrl, existing, options] = rpcSaveAttachmentMock.mock.calls[0]!;
    expect(String(dataUrl)).toMatch(DATA_URL_WAV_RE);
    expect(existing).toBeUndefined();
    expect(options).toEqual({
      kind: 'audio',
      mimeType: 'audio/wav',
      suggestedName: 'recording-6.wav',
    });
    expect(uploadAttachmentBlobMock).not.toHaveBeenCalled();
  });

  it('falls back to HTTP upload when RPC save returns no path', async () => {
    rpcSaveAttachmentMock.mockResolvedValueOnce(null);
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
    expect(uploadAttachmentBlobMock).toHaveBeenCalledWith(expect.any(Blob), {
      fileName: 'recording-2.webm',
      kind: 'audio',
      mimeType: 'audio/webm',
    });
  });

  it('throws when neither RPC nor HTTP upload returns a workspace file path', async () => {
    rpcSaveAttachmentMock.mockResolvedValueOnce({});
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
