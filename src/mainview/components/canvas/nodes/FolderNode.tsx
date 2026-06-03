import { Handle, Position, useViewport } from '@xyflow/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import { ResizeHandle } from './_shared/ResizeHandle';

const handleClassName = 'conn-handle nodrag';

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

interface FolderChildPreview {
  color?: string;
  imageUrl?: string;
}

/**
 * Only data:/http(s) URLs render directly in an <img>. Workspace-relative
 * attachment paths need an async load the pure folder visual can't perform, so
 * we skip them and fall back to a color swatch.
 */
function isRenderableUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value.startsWith('data:') || value.startsWith('http'))
  );
}

/** Pull up to three lightweight previews from a folder's children. */
function toFolderChildPreviews(children: unknown): FolderChildPreview[] {
  if (!Array.isArray(children)) {
    return [];
  }
  const previews: FolderChildPreview[] = [];
  for (const child of children) {
    if (!child || typeof child !== 'object') {
      continue;
    }
    const childData = (child as { data?: Record<string, unknown> }).data ?? {};
    const imageUrl = [
      childData.thumbnailUrl,
      childData.imageUrl,
      childData.previewUrl,
    ].find(isRenderableUrl);
    previews.push({
      color: typeof childData.color === 'string' ? childData.color : undefined,
      imageUrl,
    });
    if (previews.length >= 3) {
      break;
    }
  }
  return previews;
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

function hexToRgb(hex: string): [number, number, number] | null {
  if (!HEX_RE.test(hex)) {
    return null;
  }
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/** Mixes `hex` toward `target` by `amount` (0–1). Plain-hex output keeps the
 * folder recolor working without relying on CSS `color-mix` support. */
function mixHex(hex: string, target: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  if (!(a && b)) {
    return hex;
  }
  const blend = (from: number, to: number) =>
    Math.round(from + (to - from) * amount)
      .toString(16)
      .padStart(2, '0');
  return `#${blend(a[0], b[0])}${blend(a[1], b[1])}${blend(a[2], b[2])}`;
}

interface FolderSurfaces {
  back1: string;
  back2: string;
  cover: string;
  front: string;
  tab: string;
}

/**
 * Derives folder gradient surfaces from a custom accent color. Returns null for
 * missing / white / non-hex colors so the signature purple cover is kept.
 */
function folderSurfaces(color: string | undefined): FolderSurfaces | null {
  if (!(color && HEX_RE.test(color)) || color.toLowerCase() === '#ffffff') {
    return null;
  }
  const dark = mixHex(color, '#140d30', 0.32);
  const darker = mixHex(color, '#140d30', 0.5);
  const light = mixHex(color, '#ffffff', 0.42);
  return {
    back1: mixHex(color, '#ffffff', 0.66),
    back2: mixHex(color, '#ffffff', 0.78),
    cover: `linear-gradient(140deg, ${dark} 0%, ${color} 52%, ${darker} 100%)`,
    tab: `linear-gradient(135deg, ${darker}, ${mixHex(color, '#ffffff', 0.12)})`,
    front: `linear-gradient(180deg, ${light} 0%, ${color} 55%, ${darker} 100%)`,
  };
}

/** Up to three child previews fanned out as papers peeking from the folder. */
const FolderThumbStack = ({ previews }: { previews: FolderChildPreview[] }) => {
  const transforms = [
    'translateX(0) rotate(0deg)',
    'translateX(-7%) rotate(-5deg)',
    'translateX(7%) rotate(5deg)',
  ];
  return (
    <div className="absolute inset-x-[13%] top-[18%] h-[30%]">
      {previews
        .slice(0, 3)
        .map((preview, index) => ({ preview, index }))
        .reverse()
        .map(({ preview, index }) => (
          <div
            className="absolute inset-0 overflow-hidden rounded-xl border border-white/70 bg-white shadow-[0_8px_16px_rgba(40,22,116,0.22)] dark:border-white/15 dark:bg-neutral-800"
            key={index}
            style={{ transform: transforms[index], zIndex: 10 - index }}
          >
            {preview.imageUrl ? (
              <img
                alt=""
                className="size-full object-cover"
                draggable={false}
                src={preview.imageUrl}
              />
            ) : (
              <div
                className={cn(
                  'size-full p-2',
                  isColorDark(preview.color) && 'text-white'
                )}
                style={colorToStyle(preview.color ?? '#FFFFFF')}
              >
                <div className="space-y-1.5 opacity-25">
                  <div className="h-1.5 w-3/4 rounded-full bg-current" />
                  <div className="h-1.5 w-full rounded-full bg-current" />
                  <div className="h-1.5 w-2/3 rounded-full bg-current" />
                </div>
              </div>
            )}
          </div>
        ))}
    </div>
  );
};

/**
 * Pure presentational folder visual: stacked layers + main cover (signature
 * purple, or tinted from `data.color`) + child thumbnail stack +
 * title/subtitle/footer. No store / RPC coupling — reusable for template
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
  const childCount = Array.isArray(data.children) ? data.children.length : 0;
  const childCountLabel =
    childCount === 1 ? '1 item' : childCount > 1 ? `${childCount} items` : '';
  const surfaces = folderSurfaces(data.color);
  const previews = toFolderChildPreviews(data.children);

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
          'absolute inset-x-5 top-8 bottom-1 rounded-[28px] shadow-sm transition-transform duration-200 ease-out',
          surfaces ? '' : 'bg-violet-100/45 dark:bg-violet-400/10',
          data.isDropTarget
            ? 'translate-y-3 scale-[0.9]'
            : 'translate-y-2 scale-[0.92]'
        )}
        style={surfaces ? { backgroundColor: surfaces.back1 } : undefined}
      />
      <div
        className={cn(
          'absolute inset-x-3 top-5 bottom-3 rounded-[28px] shadow-sm transition-transform duration-200 ease-out',
          surfaces ? '' : 'bg-violet-50/75 dark:bg-violet-400/15',
          data.isDropTarget
            ? 'translate-y-2 scale-[0.96]'
            : 'translate-y-1 scale-[0.98]'
        )}
        style={surfaces ? { backgroundColor: surfaces.back2 } : undefined}
      />

      {/* Main folder cover */}
      <div
        className={cn(
          'node-visual absolute inset-0 overflow-hidden rounded-[30px] border shadow-[0_18px_42px_rgba(81,52,190,0.22),inset_0_1px_0_rgba(255,255,255,0.38)] transition-all duration-200 ease-out',
          surfaces
            ? 'border-black/10 dark:border-white/10'
            : 'border-violet-300/55 bg-[linear-gradient(140deg,#6550dd_0%,#8f71ef_52%,#5b39d0_100%)] dark:border-violet-400/20 dark:bg-[linear-gradient(140deg,#3a2e7d_0%,#5743b0_52%,#2c1c6b_100%)]',
          data.isDropTarget
            ? '-translate-y-1 border-2 border-blue-400 shadow-[0_20px_46px_rgba(96,165,250,0.28),inset_0_1px_0_rgba(255,255,255,0.42)]'
            : 'group-hover/folder:-translate-y-0.5 group-hover/folder:shadow-[0_26px_54px_rgba(81,52,190,0.32),inset_0_1px_0_rgba(255,255,255,0.42)]'
        )}
        style={surfaces ? { background: surfaces.cover } : undefined}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_10%,rgba(255,255,255,0.24),transparent_34%),radial-gradient(circle_at_82%_16%,rgba(255,255,255,0.18),transparent_28%)]" />
        <div
          className={cn(
            'absolute -top-px left-0 h-[39%] w-[43%] rounded-tl-[30px] rounded-tr-[22px] shadow-[inset_0_1px_0_rgba(255,255,255,0.38)]',
            surfaces
              ? ''
              : 'bg-[linear-gradient(135deg,#6550dd,#8268ea)] dark:bg-[linear-gradient(135deg,#3a2e7d,#4a3a9e)]'
          )}
          style={surfaces ? { background: surfaces.tab } : undefined}
        />
        <div
          className={cn(
            'absolute top-[20%] left-[36%] h-[19%] w-[18%] rounded-br-[28px]',
            surfaces
              ? ''
              : 'bg-[linear-gradient(135deg,#6550dd_10%,#8268ea_80%)] dark:bg-[linear-gradient(135deg,#3a2e7d_10%,#4a3a9e_80%)]'
          )}
          style={surfaces ? { background: surfaces.tab } : undefined}
        />
        {previews.length > 0 ? (
          <FolderThumbStack previews={previews} />
        ) : (
          <div className="absolute top-[26%] right-[8%] left-[8%] h-[21%] rounded-t-[14px] bg-white/95 shadow-[0_-1px_0_rgba(255,255,255,0.65),0_12px_22px_rgba(51,31,128,0.16)] dark:bg-neutral-200/90" />
        )}
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 flex h-[62%] flex-col rounded-t-[26px] border border-white/30 px-7 pt-6 pb-5 text-left shadow-[0_-10px_30px_rgba(48,28,130,0.18),inset_0_1px_0_rgba(255,255,255,0.52),inset_0_-24px_38px_rgba(55,34,173,0.28)] backdrop-blur-md transition-transform duration-200 ease-out',
            surfaces
              ? ''
              : 'bg-[linear-gradient(180deg,rgba(183,159,255,0.8)_0%,rgba(126,95,231,0.78)_54%,rgba(83,58,206,0.94)_100%)] dark:bg-[linear-gradient(180deg,rgba(120,98,200,0.82)_0%,rgba(78,58,168,0.85)_54%,rgba(46,29,104,0.96)_100%)]',
            data.isDropTarget && '-translate-y-1'
          )}
          style={surfaces ? { background: surfaces.front } : undefined}
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
                <p
                  className="mt-2 truncate font-medium text-sm text-white/92 leading-none"
                  title={
                    typeof data.subtitle === 'string'
                      ? data.subtitle
                      : undefined
                  }
                >
                  {data.subtitle}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {childCountLabel ? (
                <span className="rounded-full border border-white/55 bg-white/16 px-2.5 py-1 font-semibold text-[11px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
                  {childCountLabel}
                </span>
              ) : null}
              <button
                aria-label="Folder menu"
                className="nodrag grid size-7 shrink-0 place-items-center rounded-full border border-white/80 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-all hover:scale-110 hover:bg-white/20"
                onClick={onMenuClick}
                type="button"
              >
                <span className="-mt-0.5 text-lg leading-none">⋮</span>
              </button>
            </div>
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

const FolderNode = ({ id, data }: { id: string; data: FolderData }) => {
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
    const next = titleRef.current?.textContent?.trim() || data.title || '';
    if (next !== data.title) {
      commitNodeData(id, { title: next });
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
          titleRef.current.textContent = data.title ?? '';
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
      <ResizeHandle
        hoverClassName="group-hover/folder:opacity-100"
        maxHeight={600}
        maxWidth={600}
        minHeight={250}
        minWidth={250}
        onResizeStart={saveSnapshot}
      />

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
