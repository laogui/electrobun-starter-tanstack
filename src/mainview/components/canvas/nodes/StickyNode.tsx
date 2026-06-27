import { NodeResizeControl } from '@xyflow/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { NodeTagChips } from '@/components/card/NodeTagChips';
import { useNodeTagEditing } from '@/components/card/useNodeTagEditing';
import { useIsZoomedOut } from '@/contexts/ZoomLevelContext';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { editableElementToText } from '@/lib/editableText';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../../paraglide/messages.js';
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

// Insert a literal newline at the caret. The sticky body renders with
// `white-space: pre-wrap`, so a `\n` text node breaks the line reliably across
// WebKit/Chromium without relying on the browser's native (and inconsistent)
// contentEditable Enter handling, which injects block/`<br>` structure into a
// subtree React owns as the `{data.content}` child.
const insertNewlineAtCaret = (root: HTMLElement): boolean => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return false;
  }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) {
    return false;
  }
  range.deleteContents();
  const newline = document.createTextNode('\n');
  range.insertNode(newline);
  range.setStartAfter(newline);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
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
  /** Paste handler for the body text (ignored unless `editing`). */
  onPaste?: (e: React.ClipboardEvent) => void;
  /** Ref forwarded to the contentEditable body text element. */
  textRef?: React.Ref<HTMLDivElement>;
}

/**
 * Pure presentational sticky-note content. Renders the colored body, editable
 * (or read-only) text area, and the pushpin decoration. No store / RPC
 * coupling — reusable for template previews, exports, thumbnails.
 */
export const StickyContent = ({
  data,
  isZoomedOut = false,
  editing = false,
  textRef,
  onBlur,
  onKeyDown,
  onPaste,
}: StickyContentProps) => {
  return (
    <>
      {isZoomedOut ? (
        <div
          className="size-full overflow-hidden rounded-sm p-3"
          style={colorToStyle(data.color)}
        >
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
          className="flex size-full flex-col overflow-hidden rounded-sm p-4 pt-8 transition-shadow duration-150"
          style={colorToStyle(data.color)}
        >
          <div
            className={cn(
              'sticky-editable wrap-break-word custom-scrollbar flex-1 overflow-y-auto whitespace-pre-wrap text-sm/relaxed outline-none',
              editing ? 'nodrag nopan cursor-text' : 'pointer-events-none',
              !data.content && 'sticky-editable-empty'
            )}
            contentEditable={editing}
            data-placeholder={
              editing ? m.sticky_empty_placeholder() : undefined
            }
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            ref={textRef}
            suppressContentEditableWarning
          >
            {data.content}
          </div>
        </div>
      )}
      {/* Pushpin centered at the top, pressing the note flat against the wall.
          Half floats above the note so the head reads as sitting on top of the
          paper — the body div clips its own corners, so the pin (a sibling) is
          never cut off by the note's rounded container. Rendered as a pure-CSS
          metallic ball (gradient + inset highlight/shadow + cast shadow) with a
          nested glint instead of a bitmap, so it stays crisp at any zoom. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 select-none"
        data-sticky-pushpin
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 34% 30%, #b6ffd2 0%, #00f260 38%, #00b347 74%, #00742d 100%)',
          boxShadow: [
            'inset 1.5px 1.5px 3px rgba(255,255,255,0.35)',
            'inset -2px -2px 4px rgba(0,0,0,0.45)',
            '1px 2px 2.5px rgba(0,0,0,0.3)',
          ].join(', '),
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '14%',
            left: '20%',
            width: '34%',
            height: '24%',
            background: 'rgba(255,255,255,0.6)',
            borderRadius: '50%',
            transform: 'rotate(-20deg)',
            filter: 'blur(0.8px)',
          }}
        />
      </div>
    </>
  );
};

const StickyNode = ({
  id,
  data,
  dragging = false,
}: {
  id: string;
  data: StickyData;
  dragging?: boolean;
}) => {
  const { tag, tagColor, tagColors, tags, dimmedByFilter, tagEditor } =
    useNodeTagEditing(id, data as unknown as Record<string, unknown>);
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
      return;
    }
    // Enter inserts a newline (sticky notes are multi-line plain text).
    // Skip while an IME composition is active so it can commit normally.
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      const el = textRef.current;
      if (el && insertNewlineAtCaret(el)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, []);

  // Strip formatting on paste so the sticky stays plain text. The body renders
  // React's `{data.content}` as a single text node, so any block/inline
  // structure the browser would inject (divs, spans, <br>) desyncs the DOM
  // from React's model and can jump the caret. `document.execCommand` is
  // deprecated but remains the only way to insert at the caret without a
  // manual selection-range dance; insertText is the only command used here.
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text) {
      return;
    }
    e.preventDefault();
    document.execCommand('insertText', false, text);
  }, []);

  // Focus the contentEditable and place the caret: at the click point when
  // available, otherwise at the end of the text (keyboard entry).
  const enterEditing = useCallback((caretPoint?: { x: number; y: number }) => {
    setEditing(true);
    setTimeout(() => {
      const el = textRef.current;
      if (!el) {
        return;
      }
      el.focus();
      const selection = window.getSelection();
      const range = caretPoint
        ? caretRangeFromPoint(caretPoint.x, caretPoint.y)
        : null;
      if (range) {
        selection?.removeAllRanges();
        selection?.addRange(range);
      } else if (!caretPoint) {
        const endRange = document.createRange();
        endRange.selectNodeContents(el);
        endRange.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(endRange);
      }
    }, 10);
  }, []);

  // Enter-to-edit: useCanvasKeyboard stamps `editingStickyId` when Enter is
  // pressed with this sticky as the sole selection.
  const editRequested = useCanvasStore((s) => s.editingStickyId === id);
  const setEditingStickyId = useCanvasStore((s) => s.setEditingStickyId);
  useEffect(() => {
    if (!editRequested) {
      return;
    }
    setEditingStickyId(null);
    if (!editing) {
      enterEditing();
    }
  }, [editRequested, editing, enterEditing, setEditingStickyId]);

  // Single-click-to-edit model (mirrors the canvas' single-click-to-open): a
  // plain click enters edit mode directly, since editing IS a sticky's "open".
  // Modifier-clicks are reserved for selection and a drag never emits a click,
  // so neither starts editing.
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (editing || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      e.stopPropagation();
      enterEditing({ x: e.clientX, y: e.clientY });
    },
    [editing, enterEditing]
  );

  // Double-click stays as a redundant edit path in case the first click is
  // swallowed (e.g. by a drag threshold). Harmless once the click already
  // entered editing.
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (editing) {
        return;
      }
      e.stopPropagation();
      enterEditing({ x: e.clientX, y: e.clientY });
    },
    [editing, enterEditing]
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
          'node-visual relative z-0 size-full rounded-sm',
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        )}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        <StickyContent
          data={data}
          editing={editing}
          isZoomedOut={isZoomedOut}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          textRef={textRef}
        />
        {!isZoomedOut && (tag || (tags && tags.length > 0)) ? (
          <div className="pointer-events-none absolute right-2 bottom-2 left-2">
            <NodeTagChips
              isDark={isDark}
              tag={tag}
              tagColor={tagColor}
              tagColors={tagColors}
              tags={tags}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default memo(StickyNode);
