import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { getTopicPalette } from '@/lib/topicColors';
import { buildTopicIndex } from '@/lib/topicTree';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../../paraglide/messages.js';
import {
  isTopicTitleWithinLimit,
  normalizeTopicTitle,
  parseTopicData,
} from '../../../../shared/topic';
import { NodeHandles } from './_shared/NodeHandles';

export interface TopicData {
  color?: unknown;
  /** Set on the temporary draft node that is not in the persisted graph yet. */
  isDraft?: boolean;
  isHidden?: boolean;
  locked?: boolean;
  title?: unknown;
  topicVersion?: unknown;
}

export interface TopicContentProps {
  data: TopicData;
}

/**
 * Pure presentational Topic body: a compact, self-sizing title chip. No store
 * or RPC coupling, so template previews, PNG export and thumbnails can reuse
 * it.
 *
 * A Topic whose `topicVersion` this build does not understand still renders its
 * title, read-only. Failing closed to a blank node would make a forward-version
 * file look like data loss.
 */
export const TopicContent = ({ data }: TopicContentProps) => {
  const parsed = parseTopicData(data);
  const palette = getTopicPalette(data.color);
  const unreadable = parsed.status === 'invalid';
  return (
    <div
      className={cn(
        'topic-body flex size-full items-center overflow-hidden rounded-md border px-3 py-2',
        unreadable && 'border-dashed'
      )}
      style={{
        backgroundColor: palette.background,
        borderColor: palette.border,
        color: palette.foreground,
      }}
    >
      <span className="topic-title w-full whitespace-pre-wrap break-words text-sm/snug">
        {unreadable ? m.topic_unreadable_placeholder() : parsed.title}
      </span>
    </div>
  );
};

interface TopicEditorProps {
  autoFocus: boolean;
  /** False for a root, which has no sibling slot — Enter just commits. */
  canCreateSibling: boolean;
  initialValue: string;
  onCancel: () => void;
  /** Commit, then open a new editor in the requested tree position. */
  onCommit: (value: string, then: 'child' | 'sibling' | 'none') => void;
  /** Reports every keystroke so the node can resize while typing. */
  onDraftChange: (value: string) => void;
}

/**
 * Single-line-feel plain text editor. A textarea (not contentEditable) keeps
 * paste, IME composition and caret handling simple and guarantees the value is
 * literal text — Topic titles never render HTML or Markdown.
 */
const TopicEditor = ({
  autoFocus,
  canCreateSibling,
  initialValue,
  onCancel,
  onCommit,
  onDraftChange,
}: TopicEditorProps) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);

  useEffect(() => {
    if (!autoFocus) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) {
        return;
      }
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocus]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // While an IME candidate window is open, Enter/Tab belong to the input
      // method. `keyCode === 229` covers browsers that fire keydown before
      // `isComposing` is set.
      if (
        composingRef.current ||
        e.nativeEvent.isComposing ||
        e.keyCode === 229
      ) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }
      // Tab is intercepted only inside this editor (and the Topic command
      // context), never globally, so ordinary focus navigation elsewhere is
      // untouched. Shift+Tab keeps its "focus backwards" meaning rather than
      // becoming an outdent.
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        onCommit(e.currentTarget.value, 'child');
        return;
      }
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          // Shift+Enter inserts a literal newline; the commit path collapses it
          // back to a space so the stored title stays single-line.
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        // Mod+Enter commits without chaining, which is the only way to finish
        // a run of siblings without creating an extra empty one.
        const chain =
          e.metaKey || e.ctrlKey || !canCreateSibling ? 'none' : 'sibling';
        onCommit(e.currentTarget.value, chain);
      }
    },
    [canCreateSibling, onCancel, onCommit]
  );

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text) {
      return;
    }
    e.preventDefault();
    document.execCommand('insertText', false, text);
  }, []);

  return (
    <textarea
      aria-label={m.topic_title_label()}
      className="topic-title nodrag nopan w-full resize-none overflow-hidden whitespace-pre-wrap break-words border-none bg-transparent p-0 text-sm/snug outline-hidden"
      defaultValue={initialValue}
      onBlur={(e) => onCommit(e.currentTarget.value, 'none')}
      onChange={(e) => onDraftChange(e.currentTarget.value)}
      onCompositionEnd={() => {
        composingRef.current = false;
      }}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      ref={ref}
      rows={1}
    />
  );
};

const TopicNode = ({
  id,
  data,
  dragging = false,
}: {
  data: TopicData;
  dragging?: boolean;
  id: string;
}) => {
  const parsed = parseTopicData(data);
  const palette = getTopicPalette(data.color);
  const locked = Boolean(data.locked);
  const isDraft = Boolean(data.isDraft);

  const commitTopicTitle = useCanvasStore((s) => s.commitTopicTitle);
  const commitTopicDraft = useCanvasStore((s) => s.commitTopicDraft);
  const cancelTopicDraft = useCanvasStore((s) => s.cancelTopicDraft);
  const setTopicDraftText = useCanvasStore((s) => s.setTopicDraftText);
  const beginTopicRelativeDraft = useCanvasStore(
    (s) => s.beginTopicRelativeDraft
  );
  const editRequested = useCanvasStore((s) => s.editingTopicId === id);
  const setEditingTopicId = useCanvasStore((s) => s.setEditingTopicId);
  // A root has no sibling slot, so Enter there commits instead of chaining.
  // A draft has no relation yet either, so Enter ends the run.
  const canCreateSibling = useCanvasStore((s) =>
    isDraft ? false : buildTopicIndex(s.nodes, s.edges).parentByChild.has(id)
  );

  const [editing, setEditing] = useState(isDraft);
  const [error, setError] = useState<string | null>(null);
  // Remount the editor after a rejected commit so the textarea keeps the user's
  // text but the `defaultValue` baseline stays correct on the next entry.
  const [editorKey, setEditorKey] = useState(0);

  useEffect(() => {
    if (editRequested && !editing) {
      setEditing(true);
    }
    if (editRequested) {
      setEditingTopicId(null);
    }
  }, [editRequested, editing, setEditingTopicId]);

  const leaveEditing = useCallback(() => {
    setEditing(false);
    setError(null);
    setEditorKey((key) => key + 1);
  }, []);

  const handleDraftChange = useCallback(
    (value: string) => {
      setError(null);
      if (isDraft) {
        setTopicDraftText(value);
      }
    },
    [isDraft, setTopicDraftText]
  );

  const handleCommit = useCallback(
    (raw: string, then: 'child' | 'sibling' | 'none') => {
      const title = normalizeTopicTitle(raw);
      if (!isTopicTitleWithinLimit(title)) {
        // Keep the draft rather than truncating: silently dropping the tail of
        // a long paste loses the user's text with no way back.
        setError(m.topic_error_too_long());
        return;
      }
      if (isDraft) {
        if (!title) {
          // An untouched new Topic simply disappears — it never entered the
          // graph, so there is nothing to undo.
          cancelTopicDraft();
          return;
        }
        // The chained draft opens only after the commit resolves. A failed
        // commit must not leave a child hanging off a Topic that was never
        // created.
        commitTopicDraft(title).then((newId) => {
          if (newId && then !== 'none') {
            beginTopicRelativeDraft(then, newId);
          }
        });
        return;
      }
      if (!title) {
        // An existing Topic cannot become untitled; stay in the editor so the
        // user can retype or press Escape to restore.
        setError(m.topic_error_empty_title());
        return;
      }
      if (title !== parsed.title) {
        commitTopicTitle(id, title);
      }
      leaveEditing();
      if (then !== 'none') {
        beginTopicRelativeDraft(then, id);
      }
    },
    [
      beginTopicRelativeDraft,
      cancelTopicDraft,
      commitTopicDraft,
      commitTopicTitle,
      id,
      isDraft,
      leaveEditing,
      parsed.title,
    ]
  );

  const handleCancel = useCallback(() => {
    if (isDraft) {
      cancelTopicDraft();
      return;
    }
    leaveEditing();
  }, [cancelTopicDraft, isDraft, leaveEditing]);

  // Single click opens the Topic, mirroring the canvas' click-to-open rule for
  // every other node. Modifier clicks are reserved for selection, and a drag
  // never emits a click, so neither starts editing.
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (
        editing ||
        locked ||
        e.shiftKey ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      ) {
        return;
      }
      if (parsed.status !== 'valid') {
        // A record this build cannot interpret stays read-only, so editing it
        // cannot overwrite data written by a newer version.
        return;
      }
      e.stopPropagation();
      setEditing(true);
    },
    [editing, locked, parsed.status]
  );

  return (
    <div
      className={cn(
        'group/topic relative size-full transition-opacity',
        data.isHidden ? 'pointer-events-none opacity-0' : 'opacity-100',
        dragging ? 'cursor-grabbing' : 'cursor-grab'
      )}
    >
      <NodeHandles />
      {editing ? (
        <div
          className="topic-body flex size-full items-center overflow-hidden rounded-md border px-3 py-2 ring-1 ring-accent"
          style={{
            backgroundColor: palette.background,
            borderColor: palette.border,
            color: palette.foreground,
          }}
        >
          <TopicEditor
            autoFocus
            canCreateSibling={canCreateSibling}
            initialValue={parsed.title}
            key={editorKey}
            onCancel={handleCancel}
            onCommit={handleCommit}
            onDraftChange={handleDraftChange}
          />
        </div>
      ) : (
        <button
          className="block size-full cursor-inherit text-left"
          onClick={handleClick}
          type="button"
        >
          <TopicContent data={data} />
        </button>
      )}
      {error ? (
        <div
          className="pointer-events-none absolute top-full left-0 mt-1 whitespace-nowrap rounded-sm bg-red-600 px-2 py-0.5 text-white text-xs shadow-sm"
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
};

export default memo(TopicNode);
