/**
 * Open Graph preview images are specified at 1200×630 (1.91:1). The link card
 * shows a wide image as a full-width hero at that ratio; square logos and
 * small icons (common as og:image on Chinese sites) become a side thumbnail
 * instead of being blown up and cropped.
 */
export const OG_IMAGE_ASPECT = 1.91;

const MIN_HERO_ASPECT = 1.3;
const MIN_HERO_WIDTH = 400;

export type LinkPreviewImageShape = 'hero' | 'thumb';

export function classifyLinkPreviewImage(
  naturalWidth: number,
  naturalHeight: number
): LinkPreviewImageShape {
  if (!(naturalWidth > 0 && naturalHeight > 0)) {
    return 'thumb';
  }
  const aspect = naturalWidth / naturalHeight;
  return aspect >= MIN_HERO_ASPECT && naturalWidth >= MIN_HERO_WIDTH
    ? 'hero'
    : 'thumb';
}
