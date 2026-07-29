import { FolderChildPreview } from '@/components/canvas/FolderChildPreview';
import type { CardContentData } from '@/components/canvas/nodes/CardNode';
import { CardContent } from '@/components/canvas/nodes/CardNode';
import {
  type FolderChildEntry,
  getFolderChildPreviewSize,
} from '@/lib/folderExpansion';

import type { LibraryItem } from './useLibraryData';

/**
 * Fixed preview viewport. Library cards are fixed-size (unlike the canvas,
 * where cards are free-form), so every miniature lands in the same frame.
 */
export const LIBRARY_PREVIEW_WIDTH = 208;
export const LIBRARY_PREVIEW_HEIGHT = 156;

/**
 * Renders the real canvas card content as a scaled-down miniature, mirroring
 * the folder thumbnail approach: lay out at the natural preview size, then
 * uniformly scale into the fixed viewport. Tall cards clip at the bottom so
 * the header stays visible; short cards (e.g. links) center vertically.
 */
export function LibraryItemPreview({ item }: { item: LibraryItem }) {
  const natural = getFolderChildPreviewSize(item.type, item.size);
  const scale = LIBRARY_PREVIEW_WIDTH / natural.width;
  const scaledHeight = natural.height * scale;
  const clipsBottom = scaledHeight > LIBRARY_PREVIEW_HEIGHT;
  const topOffset = clipsBottom
    ? 0
    : (LIBRARY_PREVIEW_HEIGHT - scaledHeight) / 2;
  const entry: FolderChildEntry = {
    data: item.data,
    id: item.id,
    size: item.size,
    type: item.type,
  };
  // Fade clipped content into the frame edge so tall cards read as a
  // continuation instead of a hard slice (Electrobun needs the -webkit- mask).
  const fadeMask = clipsBottom
    ? 'linear-gradient(to bottom, black 62%, transparent 96%)'
    : undefined;

  return (
    <div
      aria-hidden
      className="pointer-events-none relative select-none overflow-hidden bg-white dark:bg-neutral-900"
      inert
      style={{
        height: LIBRARY_PREVIEW_HEIGHT,
        maskImage: fadeMask,
        WebkitMaskImage: fadeMask,
        width: LIBRARY_PREVIEW_WIDTH,
      }}
    >
      <div
        className="absolute left-0 overflow-hidden"
        style={{
          height: natural.height,
          top: topOffset,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: natural.width,
        }}
      >
        {item.type === 'widget' ? (
          // WidgetNodeReadOnly carries React Flow Handle elements that need a
          // ReactFlowProvider; the library popup must render without one. The
          // enriched widget data (title + excerpt) still yields a faithful
          // note-style miniature through CardContent.
          <CardContent
            data={item.data as unknown as CardContentData}
            readOnly
          />
        ) : (
          <FolderChildPreview child={entry} />
        )}
      </div>
    </div>
  );
}
