import { memo, useCallback } from 'react';
import { FolderChildPreview } from '@/components/canvas/FolderChildPreview';
import { FolderExpandedChildVisual } from '@/components/canvas/nodes/FolderExpandedChildNode';

import {
  type FolderChildEntry,
  type FolderExpandedChildData,
  getFolderChildShapeClass,
  getFolderThumbnailContentTransform,
  getFolderThumbnailSlots,
  getFolderThumbnailTransform,
  getFolderThumbnailTransformFromOrigin,
  MAX_FOLDER_PREVIEWS,
  THUMBNAIL_HEIGHT_PERCENT,
  THUMBNAIL_WIDTH_PERCENT,
} from '@/lib/folderExpansion';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import { NodeHandles } from './_shared/NodeHandles';

/** Fallback when React Flow has not measured the node yet. */
const DEFAULT_FOLDER_SIZE = 280;

export interface FolderData {
  children?: unknown[];
  color?: string;
  expansionChildren?: FolderExpandedChildData[];
  footer?: string;
  isClosing?: boolean;
  isDropTarget?: boolean;
  isExpanded?: boolean;
  isHidden?: boolean;
  onCollapseComplete?: (folderId: string) => void;
  subtitle?: string;
  title?: string;
  updatedAt?: string;
}

export interface FolderContentProps {
  data: FolderData;
  /** Measured folder height in flow coordinates (matches expansion origin math). */
  height?: number | null;
  onExpandedChildClick?: (
    event: React.MouseEvent<HTMLDivElement>,
    item: FolderExpandedChildData
  ) => void;
  /** Click handler for the three-dot menu icon. */
  onMenuClick?: (e: React.MouseEvent) => void;
  /** Measured folder width in flow coordinates (matches expansion origin math). */
  width?: number | null;
}

/**
 * Folder visual using the custom SVG icon.
 */
export const FolderContent = ({
  data,
  height,
  onExpandedChildClick,
  onMenuClick,
  width,
}: FolderContentProps) => {
  const footerText = data.footer ?? data.updatedAt;
  const childCount = Array.isArray(data.children) ? data.children.length : 0;
  const folderWidth = width && width > 0 ? width : DEFAULT_FOLDER_SIZE;
  const folderHeight = height && height > 0 ? height : DEFAULT_FOLDER_SIZE;
  const previewChildren = Array.isArray(data.children)
    ? data.children
        .filter((child): child is FolderChildEntry =>
          Boolean(
            child &&
              typeof child === 'object' &&
              typeof (child as FolderChildEntry).id === 'string' &&
              typeof (child as FolderChildEntry).type === 'string' &&
              (child as FolderChildEntry).data &&
              typeof (child as FolderChildEntry).data === 'object'
          )
        )
        .slice(0, MAX_FOLDER_PREVIEWS)
    : [];
  const thumbnailSlots = getFolderThumbnailSlots(
    previewChildren.map((child) => child.id)
  );
  const childCountLabel =
    childCount === 1 ? '1 item' : childCount > 1 ? `${childCount} items` : '';

  return (
    <div
      className={cn(
        'node-visual absolute inset-0 cursor-pointer rounded-[20px] transition-[transform,box-shadow] duration-200 ease-out will-change-transform',
        data.isDropTarget && 'scale-105 ring-2 ring-accent ring-offset-2'
      )}
      style={{ transform: 'translateZ(0)' }}
    >
      {/* Layer 1: folder back shell. */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        data-folder-layer="back"
      >
        <svg
          height="100%"
          preserveAspectRatio="none"
          role="img"
          style={{
            filter: 'drop-shadow(0px 12px 15px rgba(0, 24, 48, 0.12))',
            transform: 'translateZ(0)',
          }}
          viewBox="48 73 304 189"
          width="100%"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>Folder</title>
          <path
            d="M 50, 240 V 95 A 20,20 0 0 1 70,75 H 140 C 180,75 180,100 220,100 H 330 A 20,20 0 0 1 350,120 V 240 A 20,20 0 0 1 330,260 H 70 A 20,20 0 0 1 50,240 Z"
            fill="#E2E8F0"
            stroke="#FFFFFF"
            strokeLinejoin="round"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      {/* Layer 2: real child previews, sandwiched between the folder shells. */}
      <div
        className="pointer-events-none absolute inset-0 z-[1] overflow-visible"
        data-folder-layer="middle"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 overflow-hidden rounded-[20px]"
        >
          {previewChildren.map((child, index) => {
            const slot = thumbnailSlots[index]!;
            // Prefer the live expansion origin so the static stack is
            // bit-identical to the shared-element landing frame.
            const expansion = data.expansionChildren?.find(
              (item) => item.child.id === child.id
            );
            const thumbnail = expansion
              ? getFolderThumbnailTransformFromOrigin({
                  height: expansion.target.height,
                  rotation: expansion.origin.rotation,
                  scaleX: expansion.origin.scaleX,
                  scaleY: expansion.origin.scaleY,
                  width: expansion.target.width,
                })
              : getFolderThumbnailTransform({
                  folderHeight,
                  folderWidth,
                  rotation: slot.rotation,
                  type: child.type,
                });
            const thumbnailContent = getFolderThumbnailContentTransform({
              scaleX: thumbnail.scaleX,
              scaleY: thumbnail.scaleY,
            });
            // Hide only while open and flying out. During close the stack sits
            // under the returning cards so unmounting them is a no-op visually.
            const thumbsVisible = !data.isExpanded || Boolean(data.isClosing);
            return (
              <div
                className="absolute"
                data-folder-thumbnail-id={child.id}
                key={child.id}
                style={{
                  height: `${THUMBNAIL_HEIGHT_PERCENT}%`,
                  left: `${slot.leftPercent}%`,
                  top: `${slot.topPercent}%`,
                  width: `${THUMBNAIL_WIDTH_PERCENT}%`,
                  zIndex: index + 1,
                }}
              >
                <div
                  className={cn(
                    'absolute top-1/2 left-1/2 overflow-hidden border border-black/7 bg-white shadow-card will-change-transform dark:border-white/10 dark:bg-neutral-800 [&_.conn-handle]:hidden',
                    getFolderChildShapeClass(child.type),
                    thumbsVisible ? 'opacity-100' : 'opacity-0'
                  )}
                  style={{
                    height: thumbnail.height,
                    transform: thumbnail.transform,
                    transformOrigin: 'center center',
                    width: thumbnail.width,
                  }}
                >
                  <div
                    className="h-full"
                    style={{
                      transform: thumbnailContent.transform,
                      transformOrigin: 'left center',
                      width: `${thumbnailContent.widthPercent}%`,
                    }}
                  >
                    <FolderChildPreview child={child} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {data.isExpanded
          ? data.expansionChildren?.map((item, index) => (
              <div
                className="pointer-events-auto absolute"
                data-folder-expanded-visual-id={item.child.id}
                key={item.child.id}
                style={{
                  height: item.target.height,
                  left: item.target.x,
                  top: item.target.y,
                  width: item.target.width,
                  zIndex: MAX_FOLDER_PREVIEWS + index + 1,
                }}
              >
                <FolderExpandedChildVisual
                  data={item}
                  onAnimationComplete={
                    data.isClosing &&
                    index === (data.expansionChildren?.length ?? 0) - 1
                      ? () => data.onCollapseComplete?.(item.folderId)
                      : undefined
                  }
                  onClick={(event) => onExpandedChildClick?.(event, item)}
                />
              </div>
            ))
          : null}
      </div>

      {/* Layer 3: front shell masks the lower part of the preview stack. */}
      <div
        className="pointer-events-none absolute inset-0 z-[2]"
        data-folder-layer="front"
      >
        <svg
          aria-hidden="true"
          height="100%"
          preserveAspectRatio="none"
          viewBox="48 73 304 189"
          width="100%"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M 50, 240 V 145 A 20,20 0 0 1 70,125 H 330 A 20,20 0 0 1 350,145 V 240 A 20,20 0 0 1 330,260 H 70 A 20,20 0 0 1 50,240 Z"
            fill="#F1F5F9"
            stroke="#FFFFFF"
            strokeLinejoin="round"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      {/* Front panel — holds the title/subtitle/footer */}
      <div className="absolute inset-x-0 top-[27.5%] bottom-0 z-10 flex flex-col px-6 pt-4 pb-5 text-left">
        <div className="relative flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <h3
              aria-label="Folder name"
              className="truncate font-bold text-slate-800 text-xl leading-none"
            >
              {data.title}
            </h3>
            <p
              className="mt-2 truncate font-medium text-slate-500 text-sm leading-none"
              title={
                typeof data.subtitle === 'string' ? data.subtitle : undefined
              }
            >
              {data.subtitle}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {childCountLabel ? (
              <span className="rounded-full border border-slate-300/70 bg-slate-900/5 px-2.5 py-1 font-semibold text-2xs text-slate-600">
                {childCountLabel}
              </span>
            ) : null}
            <button
              aria-label="Folder menu"
              className="nodrag grid size-7 shrink-0 place-items-center rounded-full border border-slate-300/80 text-slate-500 transition-[transform,background-color] hover:scale-110 hover:bg-slate-900/5"
              onClick={onMenuClick}
              type="button"
            >
              <span className="-mt-0.5 text-lg leading-none">⋮</span>
            </button>
          </div>
        </div>
        {footerText ? (
          <p className="relative mt-auto truncate text-slate-400 text-sm leading-none">
            {footerText}
          </p>
        ) : null}
      </div>
    </div>
  );
};

const FolderNode = ({
  id,
  data,
  height,
  width,
}: {
  data: FolderData;
  height?: number | null;
  id: string;
  width?: number | null;
}) => {
  const setFocusedNode = useCanvasStore((s) => s.setFocusedNode);

  const handleMenuClick = useCallback((e: React.MouseEvent) => {
    // Trigger the node context menu by dispatching a contextmenu event on
    // the node DOM element, so the React Flow onNodeContextMenu fires.
    e.stopPropagation();
    const nodeEl = (e.currentTarget as HTMLElement).closest(
      '.react-flow__node'
    );
    if (nodeEl) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const contextEvent = new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: rect.right - 30,
        clientY: rect.bottom - 10,
      });
      nodeEl.dispatchEvent(contextEvent);
    }
  }, []);

  const handleExpandedChildClick = useCallback(
    (
      event: React.MouseEvent<HTMLDivElement>,
      item: FolderExpandedChildData
    ) => {
      event.stopPropagation();
      if (data.isClosing) {
        return;
      }
      setFocusedNode({
        data: item.child.data,
        folderId: id,
        id: item.child.id,
        rect: event.currentTarget.getBoundingClientRect(),
        type: item.child.type,
      });
    },
    [data.isClosing, id, setFocusedNode]
  );

  return (
    <div
      className={cn(
        'relative size-full',
        data.isHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
    >
      <NodeHandles topStyle={{ top: '12%' }} />

      <FolderContent
        data={data}
        height={height}
        onExpandedChildClick={handleExpandedChildClick}
        onMenuClick={handleMenuClick}
        width={width}
      />
    </div>
  );
};

export default memo(FolderNode);
