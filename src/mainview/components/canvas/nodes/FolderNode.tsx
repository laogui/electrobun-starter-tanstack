import { memo, useCallback } from 'react';
import { FolderChildPreview } from '@/components/canvas/FolderChildPreview';
import { FolderExpandedChildVisual } from '@/components/canvas/nodes/FolderExpandedChildNode';

import {
  FOLDER_THUMBNAIL_SLOTS,
  type FolderChildEntry,
  type FolderExpandedChildData,
  MAX_FOLDER_PREVIEWS,
} from '@/lib/folderExpansion';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import { NodeHandles } from './_shared/NodeHandles';
import { ResizeHandle } from './_shared/ResizeHandle';

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
  onExpandedChildClick?: (
    event: React.MouseEvent<HTMLDivElement>,
    item: FolderExpandedChildData
  ) => void;
  /** Click handler for the three-dot menu icon. */
  onMenuClick?: (e: React.MouseEvent) => void;
}

/**
 * Folder visual using the custom SVG icon.
 */
export const FolderContent = ({
  data,
  onExpandedChildClick,
  onMenuClick,
}: FolderContentProps) => {
  const footerText = data.footer ?? data.updatedAt;
  const childCount = Array.isArray(data.children) ? data.children.length : 0;
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
  const childCountLabel =
    childCount === 1 ? '1 item' : childCount > 1 ? `${childCount} items` : '';

  return (
    <div
      className={cn(
        'node-visual absolute inset-0 cursor-pointer rounded-[20px] transition-[transform,box-shadow] duration-200 ease-out will-change-transform',
        data.isDropTarget
          ? 'scale-105 ring-2 ring-accent ring-offset-2'
          : data.isExpanded
            ? ''
            : 'group-hover/folder:-translate-y-1.5'
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
            const slot = FOLDER_THUMBNAIL_SLOTS[index]!;
            return (
              <div
                className={cn(
                  'absolute h-[52%] w-[32%] overflow-hidden rounded-md border border-black/8 bg-white shadow-sm transition-opacity duration-100 ease-out [&_.conn-handle]:hidden',
                  data.isExpanded
                    ? data.isClosing
                      ? 'opacity-100 delay-200'
                      : 'opacity-0'
                    : 'opacity-100'
                )}
                data-folder-thumbnail-id={child.id}
                key={child.id}
                style={{
                  left: `${slot.leftPercent}%`,
                  top: `${slot.topPercent}%`,
                  transform: `rotate(${slot.rotation}deg)`,
                  zIndex: index + 1,
                }}
              >
                <div className="h-[333.333%] w-[333.333%] origin-top-left scale-[0.3]">
                  <FolderChildPreview child={child} />
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

const FolderNode = ({ id, data }: { id: string; data: FolderData }) => {
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
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
        'group/folder relative size-full',
        data.isHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
    >
      <ResizeHandle
        hoverClassName="group-hover/folder:opacity-100"
        maxHeight={600}
        maxWidth={600}
        minHeight={250}
        minWidth={250}
        nodeId={id}
        onResizeStart={saveSnapshot}
      />

      <NodeHandles topStyle={{ top: '12%' }} />

      <FolderContent
        data={data}
        onExpandedChildClick={handleExpandedChildClick}
        onMenuClick={handleMenuClick}
      />
    </div>
  );
};

export default memo(FolderNode);
