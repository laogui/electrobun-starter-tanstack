import { NodeResizeControl } from '@xyflow/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { NodeTagChips } from '@/components/card/NodeTagChips';
import { useNodeTagEditing } from '@/components/card/useNodeTagEditing';
import { useIsZoomedOut } from '@/contexts/ZoomLevelContext';
import {
  colorToStyle,
  isColorDark,
  stickyPushpinBackground,
} from '@/lib/colorUtils';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../../paraglide/messages.js';
import { NodeHandles } from './_shared/NodeHandles';
import {
  SkeletonLines,
  ZoomedOutPlaceholder,
} from './_shared/ZoomedOutPlaceholder';

export interface StickyData {
  color?: string;
  content?: string;
  isHidden?: boolean;
}

export interface StickyContentProps {
  data: StickyData;
  /** Enables textarea editing on the body text. */
  editing?: boolean;
  /** When true, renders the simplified zoomed-out placeholder. */
  isZoomedOut?: boolean;
  /** Blur handler for the body text (ignored unless `editing`). */
  onBlur?: () => void;
  /** Keydown handler for the body text (ignored unless `editing`). */
  onKeyDown?: (e: React.KeyboardEvent) => void;
  /** Paste handler for the body text (ignored unless `editing`). */
  onPaste?: (e: React.ClipboardEvent) => void;
  /** Ref forwarded to the editable body text element. */
  textRef?: React.Ref<HTMLTextAreaElement>;
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
        <ZoomedOutPlaceholder
          className="overflow-hidden rounded-sm"
          color={data.color}
          padding="sm"
        >
          {data.content ? (
            <p className="wrap-break-word line-clamp-3 font-medium text-2xl/snug">
              {data.content.length > 16
                ? `${data.content.slice(0, 16)}…`
                : data.content}
            </p>
          ) : (
            <SkeletonLines
              className="mt-1"
              size="sm"
              widths={['w-full', 'w-4/6']}
            />
          )}
        </ZoomedOutPlaceholder>
      ) : (
        <div
          className="flex size-full flex-col overflow-hidden rounded-sm p-4 pt-10 transition-shadow duration-150"
          style={colorToStyle(data.color)}
        >
          {editing ? (
            <textarea
              aria-label="Sticky note text"
              className="sticky-editable nodrag nopan custom-scrollbar flex-1 resize-none overflow-y-auto border-none bg-transparent p-0 text-sm/relaxed outline-hidden"
              defaultValue={data.content ?? ''}
              onBlur={onBlur}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              placeholder={m.sticky_empty_placeholder()}
              ref={textRef}
            />
          ) : (
            <div
              className={cn(
                'sticky-editable wrap-break-word custom-scrollbar pointer-events-none flex-1 overflow-y-auto whitespace-pre-wrap text-sm/relaxed outline-hidden',
                !data.content && 'sticky-editable-empty'
              )}
              contentEditable={false}
              data-placeholder={undefined}
            >
              {data.content}
            </div>
          )}
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
        className="sticky-pushpin pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 select-none"
        data-sticky-pushpin
        style={
          {
            '--sticky-pushpin-background': stickyPushpinBackground(data.color),
            borderRadius: '50%',
          } as React.CSSProperties
        }
      >
        {/* Edge reflection glint (the reference's ::before) */}
        <span className="sticky-pushpin-glint" />
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
  const textRef = useRef<HTMLTextAreaElement>(null);
  const focusAfterEditRequestRef = useRef(false);

  const handleBlur = useCallback(() => {
    const text = textRef.current?.value ?? '';
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
  const focusEditable = useCallback(() => {
    setTimeout(() => {
      const el = textRef.current;
      if (!el) {
        return;
      }
      el.focus();
      const caretIndex = el.value.length;
      el.setSelectionRange(caretIndex, caretIndex);
    }, 10);
  }, []);

  const enterEditing = useCallback(
    (_caretPoint?: { x: number; y: number }) => {
      setEditing(true);
      focusEditable();
    },
    [focusEditable]
  );

  // Enter-to-edit: useCanvasKeyboard stamps `editingStickyId` when Enter is
  // pressed with this sticky as the sole selection.
  const editRequested = useCanvasStore((s) => s.editingStickyId === id);
  const setEditingStickyId = useCanvasStore((s) => s.setEditingStickyId);
  if (editRequested) {
    if (!editing) {
      focusAfterEditRequestRef.current = true;
      setEditing(true);
    }
    setEditingStickyId(null);
  }
  useEffect(() => {
    if (editing && focusAfterEditRequestRef.current) {
      focusAfterEditRequestRef.current = false;
      focusEditable();
    }
  }, [editing, focusEditable]);

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
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            enterEditing();
          }
        }}
        role="presentation"
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
