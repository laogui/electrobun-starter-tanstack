// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getDesktopFilePath,
  saveAssetFile,
  summarizeWaveform,
} from '@/lib/assetFiles';

const rpcSaveAttachmentFileMock = vi.hoisted(() => vi.fn());
const uploadAttachmentBlobMock = vi.hoisted(() => vi.fn());
const resolveAttachmentStreamUrlMock = vi.hoisted(() => vi.fn());
const rpcGenerateVideoThumbnailMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rpc', () => ({
  resolveAttachmentStreamUrl: resolveAttachmentStreamUrlMock,
  rpcGenerateVideoThumbnail: rpcGenerateVideoThumbnailMock,
  rpcSaveAttachmentFile: rpcSaveAttachmentFileMock,
  uploadAttachmentBlob: uploadAttachmentBlobMock,
}));

function mockVideoElementMetadata() {
  const createObjectUrl = vi.fn(() => 'blob:video');
  const revokeObjectUrl = vi.fn();
  vi.stubGlobal('URL', {
    createObjectURL: createObjectUrl,
    revokeObjectURL: revokeObjectUrl,
  });

  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
    if (tagName === 'video') {
      const video = originalCreateElement('video') as HTMLVideoElement;
      Object.defineProperties(video, {
        duration: { configurable: true, value: 12 },
        load: { configurable: true, value: vi.fn() },
        src: {
          configurable: true,
          get: () => 'blob:video',
          set: () => {
            window.setTimeout(() => {
              video.dispatchEvent(new Event('loadedmetadata'));
            }, 0);
          },
        },
        videoHeight: { configurable: true, value: 720 },
        videoWidth: { configurable: true, value: 1280 },
      });
      let currentTime = 0;
      Object.defineProperty(video, 'currentTime', {
        configurable: true,
        get: () => currentTime,
        set: (value: number) => {
          currentTime = value;
          window.setTimeout(() => {
            video.dispatchEvent(new Event('seeked'));
          }, 0);
        },
      });
      return video;
    }
    if (tagName === 'canvas') {
      const canvas = originalCreateElement('canvas') as HTMLCanvasElement;
      vi.spyOn(canvas, 'getContext').mockReturnValue({
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D);
      vi.spyOn(canvas, 'toDataURL').mockReturnValue(
        'data:image/jpeg;base64,dGh1bWI='
      );
      return canvas;
    }
    return originalCreateElement(tagName);
  }) as unknown as typeof document.createElement);

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('data:image/jpeg')) {
        return new Response(new Blob(['thumb'], { type: 'image/jpeg' }));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    })
  );

  return { createObjectUrl, revokeObjectUrl };
}

afterEach(() => {
  rpcSaveAttachmentFileMock.mockReset();
  uploadAttachmentBlobMock.mockReset();
  resolveAttachmentStreamUrlMock.mockReset();
  rpcGenerateVideoThumbnailMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('saveAssetFile', () => {
  it('streams files into the workspace when no desktop path is available', async () => {
    uploadAttachmentBlobMock.mockResolvedValueOnce({
      filePath: 'attachments/file_abc.txt',
    });
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    await expect(saveAssetFile(file)).resolves.toEqual({
      attachmentFile: 'attachments/file_abc.txt',
      color: '#FFFFFF',
      fileName: 'notes.txt',
      kind: 'file',
      mimeType: 'text/plain',
      size: 5,
      title: 'notes.txt',
    });

    expect(uploadAttachmentBlobMock).toHaveBeenCalledWith(file, {
      fileName: 'notes.txt',
      kind: 'file',
      mimeType: 'text/plain',
    });
    expect(rpcSaveAttachmentFileMock).not.toHaveBeenCalled();
  });

  it('copies video files through the path-based RPC when a desktop path exists', async () => {
    mockVideoElementMetadata();
    resolveAttachmentStreamUrlMock.mockResolvedValue(
      'http://127.0.0.1:4242/attachment?path=attachments%2Fimg_thumb.png'
    );
    uploadAttachmentBlobMock.mockResolvedValueOnce({
      filePath: 'attachments/img_thumb.png',
    });
    rpcSaveAttachmentFileMock.mockResolvedValueOnce({
      filePath: 'attachments/video_abc.mp4',
    });
    rpcGenerateVideoThumbnailMock.mockResolvedValue(null);
    const file = new File(['movie'], 'clip.mp4', { type: 'video/mp4' });
    Object.defineProperty(file, 'path', {
      value: '/Users/test/Movies/clip.mp4',
    });

    await expect(saveAssetFile(file)).resolves.toEqual({
      attachmentFile: 'attachments/video_abc.mp4',
      color: '#FFFFFF',
      duration: 12,
      fileName: 'clip.mp4',
      kind: 'video',
      mimeType: 'video/mp4',
      size: 5,
      thumbnailFile: 'attachments/img_thumb.png',
      thumbnailUrl:
        'http://127.0.0.1:4242/attachment?path=attachments%2Fimg_thumb.png',
      title: 'clip.mp4',
    });

    expect(getDesktopFilePath(file)).toBe('/Users/test/Movies/clip.mp4');
    expect(rpcSaveAttachmentFileMock).toHaveBeenCalledWith(
      '/Users/test/Movies/clip.mp4',
      {
        kind: 'video',
        mimeType: 'video/mp4',
        suggestedName: 'clip.mp4',
      }
    );
    expect(uploadAttachmentBlobMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to bun-side poster generation when renderer thumbnail extraction fails', async () => {
    vi.stubGlobal('URL', {});
    uploadAttachmentBlobMock.mockResolvedValueOnce({
      filePath: 'attachments/video_abc.mp4',
    });
    rpcGenerateVideoThumbnailMock.mockResolvedValueOnce({
      thumbnailFile: 'attachments/img_poster.png',
    });
    resolveAttachmentStreamUrlMock.mockResolvedValue(
      'http://127.0.0.1:4242/attachment?path=attachments%2Fimg_poster.png'
    );
    const file = new File(['movie'], 'clip.mp4', { type: 'video/mp4' });

    const result = await saveAssetFile(file);

    expect(result.thumbnailFile).toBe('attachments/img_poster.png');
    expect(rpcGenerateVideoThumbnailMock).toHaveBeenCalledWith(
      'attachments/video_abc.mp4'
    );
  });

  it('extracts an audio waveform when AudioContext is available', async () => {
    uploadAttachmentBlobMock.mockResolvedValueOnce({
      filePath: 'attachments/audio_abc.mp3',
    });

    const objectUrl = 'blob:audio';
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn(),
    });

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((
      tagName: string
    ) => {
      if (tagName === 'audio') {
        const audio = originalCreateElement('audio') as HTMLAudioElement;
        Object.defineProperties(audio, {
          duration: { configurable: true, value: 30 },
          load: { configurable: true, value: vi.fn() },
          src: {
            configurable: true,
            get: () => objectUrl,
            set: () => {
              window.setTimeout(() => {
                audio.dispatchEvent(new Event('loadedmetadata'));
              }, 0);
            },
          },
        });
        return audio;
      }
      return originalCreateElement(tagName);
    }) as unknown as typeof document.createElement);

    const decodeAudioData = vi.fn(async () => ({
      getChannelData: () =>
        new Float32Array(
          Array.from({ length: 96 }, (_, index) => Math.sin(index / 4) * 0.6)
        ),
    }));
    const close = vi.fn(async () => undefined);
    class FakeAudioContext {
      decodeAudioData = decodeAudioData;
      close = close;
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);

    const file = new File(['music'], 'song.mp3', { type: 'audio/mpeg' });
    const result = await saveAssetFile(file);

    expect(result.duration).toBe(30);
    expect(result.waveform).toHaveLength(48);
  });
});

describe('summarizeWaveform', () => {
  it('returns an empty array when given no samples', () => {
    expect(summarizeWaveform(new Float32Array(0))).toEqual([]);
  });

  it('reduces a long channel into a normalized peak summary', () => {
    const channel = new Float32Array(960);
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.sin(index / 5) * 0.5;
    }
    const summary = summarizeWaveform(channel, 32);
    expect(summary).toHaveLength(32);
    expect(Math.max(...summary)).toBeCloseTo(1, 2);
  });
});
