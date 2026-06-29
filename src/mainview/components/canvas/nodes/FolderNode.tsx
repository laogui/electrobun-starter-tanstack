import { memo, useCallback } from 'react';
import { useIsZoomedOut } from '@/contexts/ZoomLevelContext';

import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import { NodeHandles } from './_shared/NodeHandles';
import { ResizeHandle } from './_shared/ResizeHandle';

export interface FolderData {
  children?: unknown[];
  color?: string;
  footer?: string;
  isDropTarget?: boolean;
  isHidden?: boolean;
  subtitle?: string;
  title?: string;
  updatedAt?: string;
}

export interface FolderContentProps {
  data: FolderData;
  /** When true, hides subtitle/footer and bumps the title to a larger size. */
  isZoomedOut?: boolean;
  /** Click handler for the three-dot menu icon. */
  onMenuClick?: (e: React.MouseEvent) => void;
}

/**
 * Folder visual using the custom SVG icon.
 */
export const FolderContent = ({
  data,
  isZoomedOut = false,
  onMenuClick,
}: FolderContentProps) => {
  const footerText = data.footer ?? data.updatedAt;
  const childCount = Array.isArray(data.children) ? data.children.length : 0;
  const childCountLabel =
    childCount === 1 ? '1 item' : childCount > 1 ? `${childCount} items` : '';

  return (
    <div
      className={cn(
        'node-visual absolute inset-0 cursor-pointer rounded-[20px] transition-transform duration-200 ease-out will-change-transform',
        data.isDropTarget ? 'scale-105' : 'group-hover/folder:-translate-y-1.5'
      )}
      style={{ transform: 'translateZ(0)' }}
    >
      {/* Background SVG */}
      <div className="pointer-events-none absolute inset-0">
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
          <rect
            fill="#93F004"
            height="125"
            rx="12"
            transform="rotate(-4 190 160)"
            vectorEffect="non-scaling-stroke"
            width="230"
            x="75"
            y="95"
          />
          <rect
            fill="#00F260"
            height="125"
            rx="12"
            transform="rotate(3 205 175)"
            vectorEffect="non-scaling-stroke"
            width="240"
            x="85"
            y="103"
          />
          <rect
            fill="#E0F6E3"
            height="125"
            rx="12"
            transform="rotate(-1 197 190)"
            vectorEffect="non-scaling-stroke"
            width="235"
            x="80"
            y="111"
          />
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
              className={cn(
                'truncate font-bold text-slate-800 leading-none',
                isZoomedOut ? 'text-3xl' : 'text-xl'
              )}
            >
              {data.title}
            </h3>
            {isZoomedOut ? null : (
              <p
                className="mt-2 truncate font-medium text-slate-500 text-sm leading-none"
                title={
                  typeof data.subtitle === 'string' ? data.subtitle : undefined
                }
              >
                {data.subtitle}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {childCountLabel ? (
              <span className="rounded-full border border-slate-300/70 bg-slate-900/5 px-2.5 py-1 font-semibold text-[11px] text-slate-600">
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
        {isZoomedOut || !footerText ? null : (
          <p className="relative mt-auto truncate text-slate-400 text-sm leading-none">
            {footerText}
          </p>
        )}
      </div>
    </div>
  );
};

const FolderNode = ({ id, data }: { id: string; data: FolderData }) => {
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const isZoomedOut = useIsZoomedOut();

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
        isZoomedOut={isZoomedOut}
        onMenuClick={handleMenuClick}
      />
    </div>
  );
};

export default memo(FolderNode);
