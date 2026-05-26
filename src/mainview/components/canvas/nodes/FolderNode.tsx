import {
  Handle,
  NodeResizeControl,
  Position,
  useViewport,
} from '@xyflow/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

const handleClassName = 'conn-handle nodrag';

export interface FolderContentProps {
  data: any;
  /** Enables contentEditable on the folder title. */
  editingTitle?: boolean;
  /** When true, hides subtitle/footer and bumps the title to a larger size. */
  isZoomedOut?: boolean;
  /** Click handler for the three-dot menu icon. */
  onMenuClick?: (e: React.MouseEvent) => void;
  /** Blur handler for the title (ignored unless `editingTitle`). */
  onTitleBlur?: () => void;
  /** Keydown handler for the title (ignored unless `editingTitle`). */
  onTitleKeyDown?: (e: React.KeyboardEvent) => void;
  /** Ref forwarded to the contentEditable title element. */
  titleRef?: React.Ref<HTMLHeadingElement>;
}

/**
 * Pure presentational folder visual: three stacked layers + main purple cover
 * + title/subtitle/footer. No store / RPC coupling — reusable for template
 * previews, exports, thumbnails.
 */
export const FolderContent = ({
  data,
  isZoomedOut = false,
  editingTitle = false,
  onMenuClick,
  titleRef,
  onTitleBlur,
  onTitleKeyDown,
}: FolderContentProps) => {
  const footerText = data.footer ?? data.updatedAt;

  return (
    <div
      className={cn(
        'absolute inset-0 cursor-pointer transition-all duration-200 ease-out',
        data.isDropTarget && 'scale-105'
      )}
    >
      {/* Stack backgrounds */}
      <div
        className={cn(
          'absolute inset-x-5 top-8 bottom-1 rounded-[28px] bg-violet-100/45 shadow-sm transition-transform duration-200 ease-out',
          data.isDropTarget
            ? 'translate-y-3 scale-[0.9]'
            : 'translate-y-2 scale-[0.92]'
        )}
      />
      <div
        className={cn(
          'absolute inset-x-3 top-5 bottom-3 rounded-[28px] bg-violet-50/75 shadow-sm transition-transform duration-200 ease-out',
          data.isDropTarget
            ? 'translate-y-2 scale-[0.96]'
            : 'translate-y-1 scale-[0.98]'
        )}
      />

      {/* Main folder cover */}
      <div
        className={cn(
          'node-visual absolute inset-0 overflow-hidden rounded-[30px] border border-violet-300/55 bg-[linear-gradient(140deg,#6550dd_0%,#8f71ef_52%,#5b39d0_100%)] shadow-[0_18px_42px_rgba(81,52,190,0.22),inset_0_1px_0_rgba(255,255,255,0.38)] transition-all duration-200 ease-out',
          data.isDropTarget
            ? '-translate-y-1 border-2 border-blue-400 shadow-[0_20px_46px_rgba(96,165,250,0.28),inset_0_1px_0_rgba(255,255,255,0.42)]'
            : 'border-violet-300/55'
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_10%,rgba(255,255,255,0.24),transparent_34%),radial-gradient(circle_at_82%_16%,rgba(255,255,255,0.18),transparent_28%)]" />
        <div className="absolute -top-px left-0 h-[39%] w-[43%] rounded-tl-[30px] rounded-tr-[22px] bg-[linear-gradient(135deg,#6550dd,#8268ea)] shadow-[inset_0_1px_0_rgba(255,255,255,0.38)]" />
        <div className="absolute top-[20%] left-[36%] h-[19%] w-[18%] rounded-br-[28px] bg-[linear-gradient(135deg,#6550dd_10%,#8268ea_80%)]" />
        <div className="absolute top-[26%] right-[8%] left-[8%] h-[21%] rounded-t-[14px] bg-white/95 shadow-[0_-1px_0_rgba(255,255,255,0.65),0_12px_22px_rgba(51,31,128,0.16)]" />
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 flex h-[62%] flex-col rounded-t-[26px] border border-white/30 bg-[linear-gradient(180deg,rgba(183,159,255,0.8)_0%,rgba(126,95,231,0.78)_54%,rgba(83,58,206,0.94)_100%)] px-7 pt-6 pb-5 text-left shadow-[0_-10px_30px_rgba(48,28,130,0.18),inset_0_1px_0_rgba(255,255,255,0.52),inset_0_-24px_38px_rgba(55,34,173,0.28)] backdrop-blur-md transition-transform duration-200 ease-out',
            data.isDropTarget && '-translate-y-1'
          )}
        >
          <div className="absolute inset-x-6 top-5 h-16 rounded-[20px] bg-white/8 blur-xl" />
          <div className="relative flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <h3
                aria-label="Folder name"
                className={cn(
                  'nodrag nopan truncate font-bold text-white leading-none outline-none drop-shadow-[0_1px_2px_rgba(40,22,116,0.28)]',
                  editingTitle &&
                    'rounded-md bg-white/12 px-1 ring-1 ring-white/45',
                  isZoomedOut ? 'text-3xl' : 'text-xl'
                )}
                contentEditable={editingTitle}
                onBlur={onTitleBlur}
                onKeyDown={onTitleKeyDown}
                ref={titleRef}
                suppressContentEditableWarning
              >
                {data.title}
              </h3>
              {isZoomedOut ? null : (
                <p className="mt-2 truncate font-medium text-sm text-white/92 leading-none">
                  {data.subtitle}
                </p>
              )}
            </div>
            <button
              aria-label="Folder menu"
              className="nodrag grid size-7 shrink-0 place-items-center rounded-full border border-white/80 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-all hover:scale-110 hover:bg-white/20"
              onClick={onMenuClick}
              type="button"
            >
              <span className="-mt-0.5 text-lg leading-none">⋮</span>
            </button>
          </div>
          {isZoomedOut || !footerText ? null : (
            <p className="relative mt-auto truncate text-sm text-white/92 leading-none">
              {footerText}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const FolderNode = ({ id, data }: any) => {
  const { zoom } = useViewport();
  const [editingTitle, setEditingTitle] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const commitNodeData = useCanvasStore((s) => s.commitNodeData);
  const renamingFolderId = useCanvasStore((s) => s.renamingFolderId);
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const setRenamingFolderId = useCanvasStore((s) => s.setRenamingFolderId);
  const isZoomedOut = zoom < 0.4;

  useEffect(() => {
    if (renamingFolderId !== id) {
      return;
    }
    setEditingTitle(true);
  }, [id, renamingFolderId]);

  useEffect(() => {
    if (!editingTitle) {
      return;
    }
    const frameId = globalThis.requestAnimationFrame(() => {
      titleRef.current?.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      if (titleRef.current) {
        range.selectNodeContents(titleRef.current);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    });

    return () => {
      globalThis.cancelAnimationFrame(frameId);
    };
  }, [editingTitle]);

  const handleTitleBlur = useCallback(() => {
    const title = titleRef.current?.textContent?.trim() || data.title;
    if (title !== data.title) {
      commitNodeData(id, { title });
    }
    setEditingTitle(false);
    setRenamingFolderId(null);
  }, [id, data.title, commitNodeData, setRenamingFolderId]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        titleRef.current?.blur();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        if (titleRef.current) {
          titleRef.current.textContent = data.title;
        }
        setRenamingFolderId(null);
        titleRef.current?.blur();
      }
    },
    [data.title, setRenamingFolderId]
  );

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
      <NodeResizeControl
        className="border-none! bg-transparent!"
        maxHeight={600}
        maxWidth={600}
        minHeight={250}
        minWidth={250}
        onResizeEnd={() => {
          document.body.classList.remove('resizing-nwse');
        }}
        onResizeStart={() => {
          document.body.classList.add('resizing-nwse');
          saveSnapshot();
        }}
        position="bottom-right"
        style={{ padding: 0 }}
      >
        <div className="absolute right-2 bottom-2 cursor-nwse-resize opacity-0 group-hover/folder:opacity-100">
          <svg
            height="16"
            viewBox="0 0 16 16"
            width="16"
            xmlns="http://www.w3.org/2000/svg"
          >
            <title>Resize</title>
            <g fill="none" fillRule="evenodd">
              <path
                d="M13.146 12.146a.5.5 0 0 1 .708.708l-1 1a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-5 5a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-9 9a.5.5 0 0 1-.708-.708z"
                fill="#1B2536"
                fillOpacity="0.5"
              />
              <path
                d="M13.146 6.146a.5.5 0 0 1 .708.708l-7 7a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-11 11a.5.5 0 0 1-.708-.708zm0 8a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708-.708z"
                fill="#FFF"
                fillOpacity="0.7"
              />
            </g>
          </svg>
        </div>
      </NodeResizeControl>

      <Handle
        className={handleClassName}
        id="top"
        position={Position.Top}
        type="source"
      />
      <Handle
        className={handleClassName}
        id="right"
        position={Position.Right}
        type="source"
      />
      <Handle
        className={handleClassName}
        id="bottom"
        position={Position.Bottom}
        type="source"
      />
      <Handle
        className={handleClassName}
        id="left"
        position={Position.Left}
        type="source"
      />

      <FolderContent
        data={data}
        editingTitle={editingTitle}
        isZoomedOut={isZoomedOut}
        onMenuClick={handleMenuClick}
        onTitleBlur={handleTitleBlur}
        onTitleKeyDown={handleTitleKeyDown}
        titleRef={titleRef}
      />
    </div>
  );
};

export default memo(FolderNode);
