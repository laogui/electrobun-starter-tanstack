import { useQueryClient } from '@tanstack/react-query';
import { Check, PenLine } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { NodeTagChips } from '@/components/card/NodeTagChips';
import { getNodeTagItems } from '@/components/card/nodeTagItems';
import { TagEditor, type TagEditorChange } from '@/components/card/TagEditor';
import { NotePreview } from '@/components/preview/NotePreview';
import { useIsZoomedOut } from '@/contexts/ZoomLevelContext';
import { useNodeMetadata, useSetNodeMetadata } from '@/hooks/useNodeMetadata';
import { useTags } from '@/hooks/useTags';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import { NodeHandles } from './_shared/NodeHandles';
import { ResizeHandle } from './_shared/ResizeHandle';
import {
  SkeletonChecklist,
  SkeletonLines,
  ZoomedOutPlaceholder,
} from './_shared/ZoomedOutPlaceholder';

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
  tagColors?: Record<string, string>;
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
  readOnly?: boolean;
}

const checklistItemKey = (item: ChecklistItem) =>
  `${item.isHeader ? 'header' : 'item'}:${item.text ?? ''}:${
    item.checked ? 'checked' : 'unchecked'
  }`;

export const CardContent = ({
  data,
  isFocused,
  onChange,
  readOnly = false,
}: CardContentProps) => {
  const [newItem, setNewItem] = useState('');
  const isDark = isColorDark(data.color);
  const tagChips = (
    <NodeTagChips
      className="mb-3"
      isDark={isDark}
      tag={data.tag}
      tagColor={data.tagColor}
      tagColors={data.tagColors}
      tags={data.tags}
    />
  );

  if (data.type === 'checklist') {
    return (
      <div
        className={cn(
          'flex h-full flex-col p-6',
          isColorDark(data.color) && 'text-white'
        )}
        style={colorToStyle(data.color)}
      >
        {tagChips}
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
                key={checklistItemKey(item)}
              >
                {item.text}
              </div>
            ) : (
              <button
                className={cn(
                  'nodrag nopan group flex w-full items-start gap-3 py-1 text-left',
                  readOnly ? '' : 'cursor-pointer'
                )}
                disabled={readOnly}
                key={checklistItemKey(item)}
                onClick={
                  readOnly
                    ? undefined
                    : (e) => {
                        // Keep checklist toggles from bubbling into the node
                        // click, which opens the focused view when the card
                        // is already the sole selection.
                        e.stopPropagation();
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
                type="button"
              >
                <div
                  className={cn(
                    'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors',
                    item.checked
                      ? isDark
                        ? 'border-white bg-white'
                        : 'border-neutral-950 bg-neutral-950'
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
              </button>
            )
          )}
          {/* Add new item input — hidden in readOnly (e.g., template previews) */}
          {readOnly ? null : (
            <div
              className="mt-2 flex items-center gap-3 opacity-50 transition-opacity focus-within:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <div
                className={cn(
                  'size-4 shrink-0 rounded-sm border',
                  isDark ? 'border-white/40' : 'border-gray-400'
                )}
              />
              <input
                aria-label="New checklist item"
                className={cn(
                  'nodrag nopan w-full border-none bg-transparent text-sm outline-hidden',
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
  // Default text card. Always renders the read-only preview — rich-text
  // editing happens exclusively through the BlockNote editor in the focused
  // view, so the card surface itself never needs its own contentEditable.
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
      {tagChips}
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
};

const CardNode = ({ id, data }: { id: string; data: CardContentData }) => {
  const commitNodeData = useCanvasStore((s) => s.commitNodeData);
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const editingTagNodeId = useCanvasStore((s) => s.editingTagNodeId);
  const setEditingTagNodeId = useCanvasStore((s) => s.setEditingTagNodeId);
  const activeTagFilters = useCanvasStore((s) => s.activeTagFilters);
  const { data: tagSummaries } = useTags();
  const tagSuggestions = (tagSummaries ?? []).map((t) => t.name);
  const queryClient = useQueryClient();
  const isZoomedOut = useIsZoomedOut();

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
      tagColors: meta?.tagColors,
      tags: meta?.tags,
    }),
    [data, meta?.tag, meta?.tagColor, meta?.tagColors, meta?.tags]
  );
  const tagItems = getNodeTagItems({
    tag: viewData.tag,
    tagColor: viewData.tagColor,
    tagColors: viewData.tagColors,
    tags: viewData.tags,
  });
  const firstTag = tagItems[0];

  // OR semantics: a card is "in scope" if it carries at least one of the
  // active filter tags. An empty filter list means no filtering at all.
  const dimmedByFilter = useMemo(() => {
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
  }, [activeTagFilters, viewData.tag, viewData.tags]);

  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const tagEditorVisible = tagEditorOpen || editingTagNodeId === id;

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
        open={tagEditorVisible}
        suggestions={tagSuggestions}
        tag={viewData.tag}
        tagColor={viewData.tagColor}
        tagColors={viewData.tagColors}
        tags={viewData.tags}
      >
        <button
          aria-hidden="true"
          className="pointer-events-none absolute top-3 left-3 size-0 opacity-0"
          tabIndex={-1}
          type="button"
        />
      </TagEditor>
      <ResizeHandle
        hoverClassName="group-hover/card:opacity-100"
        maxHeight={900}
        maxWidth={800}
        minHeight={300}
        minWidth={250}
        nodeId={id}
        onResizeStart={saveSnapshot}
      />

      <NodeHandles />

      {/* Visual wrapper — keeps Handle positions stable */}
      <div
        className={cn(
          'node-visual size-full cursor-pointer overflow-hidden rounded-3xl border border-black/5 shadow-card transition-shadow duration-200 ease-out hover:shadow-card-hover'
        )}
      >
        {isZoomedOut ? (
          <ZoomedOutPlaceholder
            color={data.color}
            leading={
              firstTag ? (
                <div
                  className="h-4 w-12 rounded-md"
                  style={colorToStyle(firstTag.color)}
                />
              ) : null
            }
            padding="lg"
            title={data.title || 'Untitled'}
          >
            {data.type === 'checklist' ? (
              <SkeletonChecklist className="mt-6" />
            ) : (
              <SkeletonLines className="mt-6" />
            )}
          </ZoomedOutPlaceholder>
        ) : (
          <CardContent
            data={viewData}
            onChange={(newData) => {
              commitNodeData(id, newData);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default memo(CardNode);
