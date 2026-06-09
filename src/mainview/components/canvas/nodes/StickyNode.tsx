import { NodeResizeControl } from '@xyflow/react';
import { memo, useCallback, useRef, useState } from 'react';
import { NodeTagChips } from '@/components/card/NodeTagChips';
import { useNodeTagEditing } from '@/components/card/useNodeTagEditing';
import { useIsZoomedOut } from '@/contexts/ZoomLevelContext';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { editableElementToText } from '@/lib/editableText';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import { NodeHandles } from './_shared/NodeHandles';

type CaretPositionFromPoint = (
  x: number,
  y: number
) => { offsetNode: Node; offset: number } | null;

const caretRangeFromPoint = (x: number, y: number): Range | null => {
  if (typeof document.caretRangeFromPoint === 'function') {
    return document.caretRangeFromPoint(x, y);
  }
  const caretPositionFromPoint = (
    document as Document & {
      caretPositionFromPoint?: CaretPositionFromPoint;
    }
  ).caretPositionFromPoint;
  if (typeof caretPositionFromPoint === 'function') {
    const position = caretPositionFromPoint(x, y);
    if (position) {
      const range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      return range;
    }
  }
  return null;
};

export interface StickyData {
  color?: string;
  content?: string;
  isHidden?: boolean;
}

export interface StickyContentProps {
  data: StickyData;
  /** Enables contentEditable on the body text. */
  editing?: boolean;
  /** When true, renders the simplified zoomed-out placeholder. */
  isZoomedOut?: boolean;
  /** Blur handler for the body text (ignored unless `editing`). */
  onBlur?: () => void;
  /** Keydown handler for the body text (ignored unless `editing`). */
  onKeyDown?: (e: React.KeyboardEvent) => void;
  /** Ref forwarded to the contentEditable body text element. */
  textRef?: React.Ref<HTMLDivElement>;
}

/**
 * Pure presentational sticky-note content. Renders the colored body, editable
 * (or read-only) text area, and the folded-corner decoration. No store / RPC
 * coupling — reusable for template previews, exports, thumbnails.
 */
export const StickyContent = ({
  data,
  isZoomedOut = false,
  editing = false,
  textRef,
  onBlur,
  onKeyDown,
}: StickyContentProps) => (
  <>
    {isZoomedOut ? (
      <div className="size-full p-3" style={colorToStyle(data.color)}>
        {data.content ? (
          <p className="wrap-break-word line-clamp-3 font-medium text-2xl/snug">
            {data.content.length > 16
              ? `${data.content.slice(0, 16)}…`
              : data.content}
          </p>
        ) : (
          <div className="mt-1 space-y-2 opacity-30">
            <div className="h-2 w-full rounded-full bg-current" />
            <div className="h-2 w-4/6 rounded-full bg-current" />
          </div>
        )}
      </div>
    ) : (
      <div
        className={cn(
          'flex size-full flex-col p-4 transition-shadow duration-150',
          editing && 'ring-2 ring-blue-400/40 ring-inset'
        )}
        style={colorToStyle(data.color)}
      >
        <div
          className={cn(
            'wrap-break-word custom-scrollbar flex-1 overflow-y-auto whitespace-pre-wrap text-sm/relaxed outline-none',
            editing ? 'nodrag nopan cursor-text' : 'pointer-events-none'
          )}
          contentEditable={editing}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          ref={textRef}
          suppressContentEditableWarning
        >
          {data.content}
        </div>
      </div>
    )}
    <div className="pointer-events-none absolute top-0 right-0 size-6">
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.3,
          background: 'linear-gradient(225deg, #ddd 50%, transparent 50%)',
        }}
      />
      <div
        className="absolute bottom-0 left-0"
        style={{
          width: '100%',
          height: '100%',
          background:
            'linear-gradient(45deg, rgba(0,0,0,0.07) 50%, transparent 50%)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(225deg, transparent 46%, rgba(0,0,0,0.15) 50%, transparent 54%)',
        }}
      />
    </div>
  </>
);

const StickyNode = ({ id, data }: { id: string; data: StickyData }) => {
  const { tag, tagColor, tags, dimmedByFilter, tagEditor } = useNodeTagEditing(
    id,
    data as unknown as Record<string, unknown>
  );
  const isDark = isColorDark(data.color);
  const onUpdate = useCanvasStore((s) => s.commitNodeData);
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const isZoomedOut = useIsZoomedOut();
  const [editing, setEditing] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  const handleBlur = useCallback(() => {
    const text = textRef.current ? editableElementToText(textRef.current) : '';
    if (text !== data.content) {
      onUpdate(id, { content: text });
    }
    setEditing(false);
  }, [id, data.content, onUpdate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      textRef.current?.blur();
    }
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (editing) {
        return;
      }
      e.stopPropagation();
      const { clientX, clientY } = e;
      setEditing(true);
      setTimeout(() => {
        const el = textRef.current;
        if (!el) {
          return;
        }
        el.focus();
        const range = caretRangeFromPoint(clientX, clientY);
        if (range) {
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }, 10);
    },
    [editing]
  );

  return (
    <div
      className={cn(
        'group/sticky size-full transition-opacity',
        data.isHidden
          ? 'pointer-events-none opacity-0'
          : dimmedByFilter
            ? 'opacity-30'
            : 'opacity-100'
      )}
    >
      {tagEditor}
      <NodeResizeControl
        className="z-10 border-none! bg-transparent!"
        maxHeight={500}
        maxWidth={500}
        minHeight={120}
        minWidth={120}
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
        <div className="absolute right-2 bottom-2 cursor-nwse-resize opacity-0 group-hover/sticky:opacity-100">
          <svg
            height="12"
            viewBox="0 0 16 16"
            width="12"
            xmlns="http://www.w3.org/2000/svg"
          >
            <title>Resize</title>
            <g fill="none" fillRule="evenodd">
              <path
                d="M13.146 12.146a.5.5 0 0 1 .708.708l-1 1a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-5 5a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-9 9a.5.5 0 0 1-.708-.708z"
                fill="#1B2536"
                fillOpacity="0.3"
              />
            </g>
          </svg>
        </div>
      </NodeResizeControl>

      <NodeHandles />

      <div
        className={cn(
          'node-visual relative z-0 size-full cursor-grab overflow-hidden rounded-sm border border-black/5 shadow-card transition-shadow duration-200 ease-out hover:shadow-card-hover'
        )}
        onClick={handleClick}
      >
        <StickyContent
          data={data}
          editing={editing}
          isZoomedOut={isZoomedOut}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          textRef={textRef}
        />
        {!isZoomedOut && (tag || (tags && tags.length > 0)) ? (
          <div className="pointer-events-none absolute right-2 bottom-2 left-2">
            <NodeTagChips
              isDark={isDark}
              tag={tag}
              tagColor={tagColor}
              tags={tags}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default memo(StickyNode);
