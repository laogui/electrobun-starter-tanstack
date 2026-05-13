// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveAssetFile } from '@/lib/assetFiles';

const rpcSaveAttachmentMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rpc', () => ({
  rpcSaveAttachment: rpcSaveAttachmentMock,
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

  return { createObjectUrl, revokeObjectUrl };
}

afterEach(() => {
  rpcSaveAttachmentMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('saveAssetFile', () => {
  it('saves a file through the attachment RPC and returns lightweight metadata', async () => {
    rpcSaveAttachmentMock.mockResolvedValueOnce({
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

    expect(rpcSaveAttachmentMock).toHaveBeenCalledWith(
      'data:text/plain;base64,aGVsbG8=',
      undefined,
      {
        kind: 'file',
        mimeType: 'text/plain',
        suggestedName: 'notes.txt',
      }
    );
  });

  it('reports staged import progress while saving a file', async () => {
    rpcSaveAttachmentMock.mockResolvedValueOnce({
      filePath: 'attachments/file_abc.txt',
    });
    const onProgress = vi.fn();
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    await saveAssetFile(file, { onProgress });

    expect(onProgress).toHaveBeenCalledWith({
      fileName: 'notes.txt',
      label: 'Preparing file',
      progress: 0.02,
    });
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'notes.txt',
        label: 'Saving attachment',
      })
    );
    expect(onProgress).toHaveBeenLastCalledWith({
      fileName: 'notes.txt',
      label: 'Added to canvas',
      progress: 1,
    });
  });

  it('extracts video duration and saves a best-effort thumbnail', async () => {
    const { createObjectUrl, revokeObjectUrl } = mockVideoElementMetadata();
    rpcSaveAttachmentMock
      .mockResolvedValueOnce({ filePath: 'attachments/video_abc.mp4' })
      .mockResolvedValueOnce({ filePath: 'attachments/img_thumb.jpg' });
    const file = new File(['movie'], 'clip.mp4', { type: 'video/mp4' });

    await expect(saveAssetFile(file)).resolves.toEqual({
      attachmentFile: 'attachments/video_abc.mp4',
      color: '#FFFFFF',
      duration: 12,
      fileName: 'clip.mp4',
      kind: 'video',
      mimeType: 'video/mp4',
      size: 5,
      thumbnailFile: 'attachments/img_thumb.jpg',
      thumbnailUrl: 'data:image/jpeg;base64,dGh1bWI=',
      title: 'clip.mp4',
    });

    expect(createObjectUrl).toHaveBeenCalledWith(file);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:video');
    expect(rpcSaveAttachmentMock).toHaveBeenNthCalledWith(
      1,
      'data:video/mp4;base64,bW92aWU=',
      undefined,
      {
        kind: 'video',
        mimeType: 'video/mp4',
        suggestedName: 'clip.mp4',
      }
    );
    expect(rpcSaveAttachmentMock).toHaveBeenNthCalledWith(
      2,
      'data:image/jpeg;base64,dGh1bWI=',
      undefined,
      {
        kind: 'image',
        mimeType: 'image/jpeg',
        suggestedName: 'clip.mp4-thumbnail.jpg',
      }
    );
  });
});
