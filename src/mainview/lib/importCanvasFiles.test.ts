// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createImageDropPreview,
  isImageFile,
  isOsFileDrag,
  persistImportedImage,
  revokeImageDropPreview,
} from '@/lib/importCanvasFiles';

const rpcSaveAttachmentMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rpc', () => ({
  rpcSaveAttachment: rpcSaveAttachmentMock,
}));

vi.mock('@/lib/thumbnail', () => ({
  createImageThumbnail: vi.fn(async () => 'data:image/jpeg;base64,dGh1bWI='),
}));

afterEach(() => {
  rpcSaveAttachmentMock.mockReset();
  vi.restoreAllMocks();
});

describe('isOsFileDrag', () => {
  it('detects file drags from the Files type', () => {
    expect(
      isOsFileDrag({
        types: ['Files'],
        files: [],
        items: [],
      } as unknown as DataTransfer)
    ).toBe(true);
  });

  it('detects file drags when only files are populated', () => {
    expect(
      isOsFileDrag({
        types: [],
        files: [new File(['x'], 'a.png', { type: 'image/png' })],
        items: [],
      } as unknown as DataTransfer)
    ).toBe(true);
  });

  it('ignores internal drags without file payloads', () => {
    expect(
      isOsFileDrag({
        types: ['text/plain'],
        files: [],
        items: [],
      } as unknown as DataTransfer)
    ).toBe(false);
  });
});

describe('isImageFile', () => {
  it('classifies images by extension when MIME is missing', () => {
    expect(isImageFile(new File(['x'], 'photo.png'))).toBe(true);
  });
});

describe('createImageDropPreview', () => {
  it('returns an object URL preview and title', () => {
    const file = new File(['x'], 'vacation.jpg', { type: 'image/jpeg' });
    const preview = createImageDropPreview(file);
    expect(preview.title).toBe('vacation');
    expect(preview.imageUrl.startsWith('blob:')).toBe(true);
    revokeImageDropPreview(preview.imageUrl);
  });
});

describe('persistImportedImage', () => {
  it('saves the attachment and thumbnail metadata', async () => {
    rpcSaveAttachmentMock
      .mockResolvedValueOnce({ filePath: 'attachments/img_abc.png' })
      .mockResolvedValueOnce({ filePath: 'attachments/img_thumb.jpg' });
    const updateNodeData = vi.fn();
    const file = new File(['pixels'], 'shot.png', { type: 'image/png' });

    await persistImportedImage('image-1', file, updateNodeData);

    expect(updateNodeData).toHaveBeenNthCalledWith(1, 'image-1', {
      imageFile: 'attachments/img_abc.png',
      imageUrl: 'data:image/png;base64,cGl4ZWxz',
    });
    expect(updateNodeData).toHaveBeenNthCalledWith(2, 'image-1', {
      thumbnailFile: 'attachments/img_thumb.jpg',
      thumbnailUrl: 'data:image/jpeg;base64,dGh1bWI=',
    });
  });
});
