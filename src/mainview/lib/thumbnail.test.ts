// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createImageThumbnail } from '@/lib/thumbnail';

interface FakeImageOptions {
  height: number;
  shouldFail?: boolean;
  width: number;
}

function installFakeImage({ width, height, shouldFail }: FakeImageOptions) {
  class FakeImage {
    decoding = 'async';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = width;
    naturalHeight = height;
    width = width;
    height = height;
    set src(_value: string) {
      window.setTimeout(() => {
        if (shouldFail) {
          this.onerror?.();
          return;
        }
        this.onload?.();
      }, 0);
    }
  }
  vi.stubGlobal('Image', FakeImage);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createImageThumbnail', () => {
  it('returns a downscaled data URL for large images', async () => {
    installFakeImage({ width: 4000, height: 2000 });
    const drawImage = vi.fn();
    const toDataURL = vi.fn(() => 'data:image/jpeg;base64,thumbnail');
    vi.spyOn(document, 'createElement').mockImplementation(((
      tagName: string
    ) => {
      if (tagName === 'canvas') {
        const canvas = {
          width: 0,
          height: 0,
          getContext: () =>
            ({
              drawImage,
            }) as unknown as CanvasRenderingContext2D,
          toDataURL,
        } as unknown as HTMLCanvasElement;
        return canvas;
      }
      throw new Error('unexpected tag');
    }) as typeof document.createElement);

    const result = await createImageThumbnail(
      'data:image/png;base64,fakedata',
      { maxEdge: 800 }
    );

    expect(result).toBe('data:image/jpeg;base64,thumbnail');
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.82);
    expect(drawImage).toHaveBeenCalledTimes(1);
    const drawArgs = drawImage.mock.calls[0];
    expect(drawArgs?.[3]).toBe(800);
    expect(drawArgs?.[4]).toBe(400);
  });

  it('returns null for images that already fit within maxEdge', async () => {
    installFakeImage({ width: 200, height: 100 });
    const result = await createImageThumbnail(
      'data:image/png;base64,fakedata',
      { maxEdge: 400 }
    );
    expect(result).toBeNull();
  });

  it('returns null when the image fails to decode', async () => {
    installFakeImage({ width: 4000, height: 4000, shouldFail: true });
    const result = await createImageThumbnail(
      'data:image/png;base64,fakedata',
      { maxEdge: 400 }
    );
    expect(result).toBeNull();
  });

  it('returns null when no DOM is available', async () => {
    vi.stubGlobal('Image', undefined);
    const result = await createImageThumbnail('data:image/png;base64,fakedata');
    expect(result).toBeNull();
  });
});
