import { useQueryClient } from '@tanstack/react-query';
import {
  Handle,
  NodeResizeControl,
  Position,
  useViewport,
} from '@xyflow/react';
import { Check, PenLine, Tag as TagIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TagEditor, type TagEditorChange } from '@/components/card/TagEditor';
import { NotePreview } from '@/components/preview/NotePreview';
import { useNodeMetadata, useSetNodeMetadata } from '@/hooks/useNodeMetadata';
import { useTags } from '@/hooks/useTags';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { editableElementToText } from '@/lib/editableText';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import * as m from '../../../../paraglide/messages.js';

const handleClassName = 'conn-handle nodrag';

interface SecondaryTagChipsProps {
  isDark: boolean;
  tags?: string[];
}

const SecondaryTagChips = ({ isDark, tags }: SecondaryTagChipsProps) => {
  if (!tags || tags.length === 0) {
    return null;
  }
  return (
    <>
      {tags.map((value) => (
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-xs',
            isDark ? 'bg-white/15 text-white/85' : 'bg-black/5 text-neutral-700'
          )}
          key={value}
        >
          {value}
        </span>
      ))}
    </>
  );
};

export interface ChecklistItem {
  checked?: boolean;
  isHeader?: boolean;
  text?: string;
}

export interface CardContentData {
  color?: string;
  content?: string;
  isHidden?: boolean;
  items?: ChecklistItem[];
  noteId?: string;
  previewBlocks?: unknown;
  previewExcerpt?: string;
  previewHtml?: string;
  previewVersion?: number;
  tag?: string;
  tagColor?: string;
  tags?: string[];
  title?: string;
  /**
   * Discriminator for non-default card variants. Default text cards leave
   * this undefined; checklist cards set 'checklist'.
   */
  type?: 'checklist' | 'text';
}

export interface CardContentProps {
  data: CardContentData;
  isFocused?: boolean;
  onChange?: (next: Partial<CardContentData>) => void;
  onEditTagClick?: () => void;
  readOnly?: boolean;
}

export const CardContent = ({
  data,
  isFocused,
  onChange,
  onEditTagClick,
  readOnly = false,
}: CardContentProps) => {
  const [newItem, setNewItem] = useState('');
  const isDark = isColorDark(data.color);

  if (data.type === 'checklist') {
    return (
      <div
        className={cn(
          'flex h-full flex-col p-6',
          isColorDark(data.color) && 'text-white'
        )}
        style={colorToStyle(data.color)}
      >
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {data.tag ? (
            <span
              className="rounded-md px-2 py-1 font-semibold text-xs"
              style={colorToStyle(data.tagColor)}
            >
              {data.tag}
            </span>
          ) : null}
          <SecondaryTagChips isDark={isDark} tags={data.tags} />
        </div>
        {data.title ? (
          <h2
            className={cn('mb-4 font-bold', isFocused ? 'text-3xl' : 'text-xl')}
          >
            {data.title}
          </h2>
        ) : null}
        <div className="flex-1 space-y-1 overflow-hidden">
          {data.items?.map((item: ChecklistItem, i: number) =>
            item.isHeader ? (
              <div
                className={cn(
                  'mt-4 mb-2 font-semibold',
                  isDark ? 'text-white/95' : 'text-gray-800'
                )}
                key={i}
              >
                {item.text}
              </div>
            ) : (
              <div
                className={cn(
                  'nodrag nopan group flex items-start gap-3 py-1',
                  readOnly ? '' : 'cursor-pointer'
                )}
                key={i}
                onClick={
                  readOnly
                    ? undefined
                    : () => {
                        if (onChange) {
                          const newItems = (data.items ?? []).map(
                            (entry, index) =>
                              index === i
                                ? { ...entry, checked: !entry.checked }
                                : entry
                          );
                          onChange({ items: newItems });
                        }
                      }
                }
              >
                <div
                  className={cn(
                    'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors',
                    item.checked
                      ? isDark
                        ? 'border-white bg-white'
                        : 'border-black bg-black'
                      : isDark
                        ? 'border-white/40 group-hover:border-white'
                        : 'border-gray-400 group-hover:border-black'
                  )}
                >
                  {item.checked ? (
                    <Check
                      className={isDark ? 'text-black' : 'text-white'}
                      size={12}
                    />
                  ) : null}
                </div>
                <span
                  className={cn(
                    'text-sm/tight transition-colors',
                    item.checked
                      ? isDark
                        ? 'text-white/50 line-through'
                        : 'text-gray-400 line-through'
                      : isDark
                        ? 'text-white/95'
                        : 'text-gray-800'
                  )}
                >
                  {item.text}
                </span>
              </div>
            )
          )}
          {/* Add new item input — hidden in readOnly (e.g., template previews) */}
          {readOnly ? null : (
            <div className="mt-2 flex items-center gap-3 opacity-50 transition-opacity focus-within:opacity-100">
              <div
                className={cn(
                  'size-4 shrink-0 rounded-sm border',
                  isDark ? 'border-white/40' : 'border-gray-400'
                )}
              />
              <input
                className={cn(
                  'nodrag nopan w-full border-none bg-transparent text-sm outline-none',
                  isDark ? 'placeholder-white/40' : 'placeholder-gray-500'
                )}
                onChange={(e) => {
                  setNewItem(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newItem.trim() && onChange) {
                    onChange({
                      items: [
                        ...(data.items ?? []),
                        { text: newItem.trim(), checked: false },
                      ],
                    });
                    setNewItem('');
                  }
                }}
                placeholder="Add item..."
                type="text"
                value={newItem}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Default text card — editable only in focused (expanded) view.
  // readOnly forces the non-editable preview regardless of focus.
  if (!isFocused || readOnly) {
    const isEmpty = !(
      data.title ||
      data.content ||
      data.previewExcerpt ||
      data.previewHtml
    );
    return (
      <div
        className={cn('flex h-full flex-col p-6', isDark && 'text-white')}
        style={colorToStyle(data.color)}
      >
        {data.tag || (data.tags && data.tags.length > 0) ? (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {data.tag ? (
              <span
                className="inline-block rounded-md px-2 py-1 font-semibold text-xs"
                style={colorToStyle(data.tagColor)}
              >
                {data.tag}
              </span>
            ) : null}
            <SecondaryTagChips isDark={isDark} tags={data.tags} />
          </div>
        ) : null}
        <h2
          className={cn(
            'mb-4 flex items-center gap-2 font-bold text-xl',
            !data.title && 'opacity-40'
          )}
        >
          {data.title || 'Untitled'}
          {isEmpty && !readOnly ? (
            <PenLine
              aria-hidden="true"
              className="shrink-0 opacity-60"
              size={16}
            />
          ) : null}
        </h2>
        <NotePreview
          className={cn(isDark && 'prose-invert text-white')}
          excerpt={data.previewExcerpt}
          fallback={data.content}
          html={data.previewHtml}
        />
      </div>
    );
  }

  return (
    <EditableCardContent
      data={data}
      onChange={onChange}
      onEditTagClick={onEditTagClick}
    />
  );
};

interface EditableCardContentProps {
  data: CardContentData;
  onChange?: (next: Partial<CardContentData>) => void;
  onEditTagClick?: () => void;
}

const EditableCardContent = ({
  data,
  onChange,
  onEditTagClick,
}: EditableCardContentProps) => {
  const titleRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isDark = isColorDark(data.color);
  const hasTags = Boolean(data.tag) || (data.tags && data.tags.length > 0);

  const handleTitleBlur = useCallback(() => {
    const text = titleRef.current?.textContent ?? '';
    if (text !== data.title && onChange) {
      onChange({ title: text });
    }
  }, [data.title, onChange]);

  const handleContentBlur = useCallback(() => {
    const text = contentRef.current
      ? editableElementToText(contentRef.current)
      : '';
    if (text !== data.content && onChange) {
      onChange({
        content: text,
        previewBlocks: undefined,
        previewExcerpt: undefined,
        previewHtml: undefined,
        previewVersion: undefined,
      });
    }
  }, [data.content, onChange]);

  return (
    <div
      className={cn('flex h-full flex-col p-6', isDark && 'text-white')}
      style={colorToStyle(data.color)}
    >
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {data.tag ? (
          <span
            className="inline-block rounded-md px-2 py-1 font-semibold text-xs"
            style={colorToStyle(data.tagColor)}
          >
            {data.tag}
          </span>
        ) : null}
        <SecondaryTagChips isDark={isDark} tags={data.tags} />
        {onEditTagClick ? (
          <button
            aria-label={m.menu_edit_tag()}
            className={cn(
              'nodrag nopan inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-opacity',
              isDark
                ? 'bg-white/10 text-white/70 hover:bg-white/20'
                : 'bg-black/5 text-neutral-600 hover:bg-black/10',
              !hasTags && 'opacity-60'
            )}
            onClick={onEditTagClick}
            type="button"
          >
            <TagIcon aria-hidden="true" size={10} />
            {hasTags ? null : <span>{m.menu_edit_tag()}</span>}
          </button>
        ) : null}
      </div>
      <div
        className="nodrag nopan mb-4 cursor-text font-bold text-4xl outline-none empty:before:opacity-40 empty:before:content-[attr(data-placeholder)]"
        contentEditable
        data-placeholder="Untitled"
        onBlur={handleTitleBlur}
        ref={titleRef}
        suppressContentEditableWarning
      >
        {data.title}
      </div>
      <div
        className="nodrag nopan custom-scrollbar flex-1 cursor-text overflow-y-auto whitespace-pre-wrap text-lg/relaxed outline-none empty:before:opacity-40 empty:before:content-[attr(data-placeholder)]"
        contentEditable
        data-placeholder="Write something..."
        onBlur={handleContentBlur}
        ref={contentRef}
        suppressContentEditableWarning
      >
        {data.content}
      </div>
    </div>
  );
};

const CardNode = ({ id, data }: { id: string; data: CardContentData }) => {
  const { zoom } = useViewport();
  const commitNodeData = useCanvasStore((s) => s.commitNodeData);
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const editingTagNodeId = useCanvasStore((s) => s.editingTagNodeId);
  const setEditingTagNodeId = useCanvasStore((s) => s.setEditingTagNodeId);
  const activeTagFilters = useCanvasStore((s) => s.activeTagFilters);
  const { data: tagSummaries } = useTags();
  const tagSuggestions = (tagSummaries ?? []).map((t) => t.name);
  const queryClient = useQueryClient();
  const isZoomedOut = zoom < 0.4;

  // Cards key node metadata by the note's stable id; the React Flow node id
  // is a fallback for legacy nodes that pre-date the noteId roll-out.
  const metaKey = (data as { noteId?: string }).noteId ?? id;
  const { get: getMeta } = useNodeMetadata();
  const setMetadata = useSetNodeMetadata();
  const meta = getMeta(metaKey);

  const viewData = useMemo<CardContentData>(
    () => ({
      ...data,
      tag: meta?.tag,
      tagColor: meta?.tagColor,
      tags: meta?.tags,
    }),
    [data, meta?.tag, meta?.tagColor, meta?.tags]
  );

  // OR semantics: a card is "in scope" if it carries at least one of the
  // active filter tags. An empty filter list means no filtering at all.
  const dimmedByFilter = (() => {
    if (activeTagFilters.length === 0) {
      return false;
    }
    const haystack = new Set<string>();
    if (viewData.tag) {
      haystack.add(viewData.tag.toLowerCase());
    }
    for (const t of viewData.tags ?? []) {
      haystack.add(t.toLowerCase());
    }
    return !activeTagFilters.some((f) => haystack.has(f.toLowerCase()));
  })();

  const [tagEditorOpen, setTagEditorOpen] = useState(false);

  useEffect(() => {
    if (editingTagNodeId === id) {
      setTagEditorOpen(true);
    }
  }, [editingTagNodeId, id]);

  const handleTagEditorOpenChange = useCallback(
    (next: boolean) => {
      setTagEditorOpen(next);
      if (!next) {
        if (editingTagNodeId === id) {
          setEditingTagNodeId(null);
        }
        // Refresh the workspace tag list so the sidebar reflects any edits.
        queryClient.invalidateQueries({ queryKey: ['tags'] });
      }
    },
    [editingTagNodeId, id, queryClient, setEditingTagNodeId]
  );

  const handleTagChange = useCallback(
    (next: TagEditorChange) => {
      setMetadata.mutate({ id: metaKey, metadata: next });
    },
    [metaKey, setMetadata]
  );

  const openTagEditor = useCallback(() => {
    setTagEditorOpen(true);
  }, []);

  return (
    <div
      className={cn(
        'group/card size-full transition-opacity',
        data.isHidden
          ? 'pointer-events-none opacity-0'
          : dimmedByFilter
            ? 'opacity-30'
            : 'opacity-100'
      )}
    >
      <TagEditor
        onChange={handleTagChange}
        onOpenChange={handleTagEditorOpenChange}
        open={tagEditorOpen}
        suggestions={tagSuggestions}
        tag={viewData.tag}
        tagColor={viewData.tagColor}
        tags={viewData.tags}
      >
        <button
          aria-hidden="true"
          className="pointer-events-none absolute top-3 left-3 size-0 opacity-0"
          tabIndex={-1}
          type="button"
        />
      </TagEditor>
      <NodeResizeControl
        className="border-none! bg-transparent!"
        maxHeight={900}
        maxWidth={800}
        minHeight={300}
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
        <div className="absolute right-2 bottom-2 cursor-nwse-resize opacity-0 group-hover/card:opacity-100">
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

      {/* Visual wrapper — keeps Handle positions stable */}
      <div
        className={cn(
          'node-visual size-full cursor-pointer overflow-hidden rounded-3xl border border-black/5 shadow-card transition-shadow duration-200 ease-out hover:shadow-card-hover'
        )}
      >
        {isZoomedOut ? (
          <div
            className={cn(
              'flex size-full flex-col p-6',
              isColorDark(data.color) && 'text-white'
            )}
            style={colorToStyle(data.color)}
          >
            {viewData.tag ? (
              <div
                className="mb-4 h-4 w-12 rounded-md"
                style={colorToStyle(viewData.tagColor)}
              />
            ) : null}
            <h2 className="font-bold text-2xl/tight">
              {data.title || 'Untitled'}
            </h2>
            <div className="mt-6 space-y-3 opacity-30">
              <div className="h-3 w-full rounded-full bg-current" />
              <div className="h-3 w-5/6 rounded-full bg-current" />
              <div className="h-3 w-4/6 rounded-full bg-current" />
              <div className="h-3 w-full rounded-full bg-current" />
              <div className="h-3 w-3/4 rounded-full bg-current" />
            </div>
          </div>
        ) : (
          <CardContent
            data={viewData}
            onChange={(newData) => {
              commitNodeData(id, newData);
            }}
            onEditTagClick={openTagEditor}
          />
        )}
      </div>
    </div>
  );
};

export default memo(CardNode);
