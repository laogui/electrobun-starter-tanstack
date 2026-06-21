// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  computeImageNodeSize,
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

describe('computeImageNodeSize', () => {
  it('keeps a fixed base width snapped to the 24px grid', () => {
    // 350 -> nearest multiple of 24 is 360.
    const { width } = computeImageNodeSize(1000, 1000);
    expect(width).toBe(360);
  });

  it('makes a square card for a square image', () => {
    expect(computeImageNodeSize(800, 800)).toEqual({
      width: 360,
      height: 360,
    });
  });

  it('derives a shorter card for a wide image (height from aspect)', () => {
    // 16:9 ~= 1.78 aspect -> height = 350 / 1.78 ~= 197 -> snap to 192.
    const { width, height } = computeImageNodeSize(1600, 900);
    expect(width).toBe(360);
    expect(height).toBe(192);
    expect(height).toBeLessThan(width);
  });

  it('derives a taller card for a portrait image', () => {
    // 9:16 ~= 0.5625 aspect -> height = 350 / 0.5625 ~= 622 -> snap to 624.
    const { width, height } = computeImageNodeSize(900, 1600);
    expect(width).toBe(360);
    expect(height).toBe(624);
    expect(height).toBeGreaterThan(width);
  });

  it('clamps an extremely tall image to the max height (center-cropped)', () => {
    // Aspect clamped to 1:3 -> height = 350 * 3 = 1050 -> clamped to 900.
    const { width, height } = computeImageNodeSize(200, 4000);
    expect(width).toBe(360);
    expect(height).toBe(900);
  });

  it('clamps an extremely wide image to the min height (center-cropped)', () => {
    // Aspect clamped to 3:1 -> height = 350 / 3 ~= 117 -> clamped to 150.
    const { width, height } = computeImageNodeSize(4000, 200);
    expect(width).toBe(360);
    expect(height).toBe(150);
  });

  it('falls back to a square card for degenerate dimensions', () => {
    expect(computeImageNodeSize(0, 0)).toEqual({ width: 350, height: 350 });
    expect(computeImageNodeSize(Number.NaN, 100)).toEqual({
      width: 350,
      height: 350,
    });
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
