import { describe, expect, it } from 'vitest';
import { classifyLinkPreviewImage } from './linkPreviewImage';

describe('classifyLinkPreviewImage', () => {
  it('treats standard OG images as hero', () => {
    expect(classifyLinkPreviewImage(1200, 630)).toBe('hero');
    expect(classifyLinkPreviewImage(900, 383)).toBe('hero'); // 2.35:1 cover
    expect(classifyLinkPreviewImage(1280, 720)).toBe('hero');
  });

  it('treats square or small images as thumbnails', () => {
    expect(classifyLinkPreviewImage(512, 512)).toBe('thumb');
    expect(classifyLinkPreviewImage(300, 157)).toBe('thumb');
    expect(classifyLinkPreviewImage(600, 800)).toBe('thumb');
    expect(classifyLinkPreviewImage(0, 0)).toBe('thumb');
  });
});
