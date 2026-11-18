import { useQueryClient } from '@tanstack/react-query';
import { PenLine } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { NodeTagChips } from '@/components/card/NodeTagChips';
import { TagEditor, type TagEditorChange } from '@/components/card/TagEditor';
import { NotePreview } from '@/components/preview/NotePreview';
import {
  useNodeMetadataEntry,
  useSetNodeMetadata,
} from '@/hooks/useNodeMetadata';
import { useTags } from '@/hooks/useTags';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { nodeRenderPropsEqual } from '@/lib/nodeRenderPropsEqual';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import { NodeHandles } from './_shared/NodeHandles';
import { ResizeHandle } from './_shared/ResizeHandle';

export interface CardContentData {
  color?: string;
  content?: string;
  isHidden?: boolean;
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
  /** Legacy discriminator; every card is a text note now. */
  type?: 'text';
}

export interface CardContentProps {
  data: CardContentData;
  readOnly?: boolean;
}

export const CardContent = ({ data, readOnly = false }: CardContentProps) => {
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
          !data.title && 'opacity-55'
        )}
        data-focus-title
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
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const editingTagNodeId = useCanvasStore((s) => s.editingTagNodeId);
  const setEditingTagNodeId = useCanvasStore((s) => s.setEditingTagNodeId);
  const activeTagFilters = useCanvasStore((s) => s.activeTagFilters);
  const { data: tagSummaries } = useTags();
  const tagSuggestions = (tagSummaries ?? []).map((t) => t.name);
  const queryClient = useQueryClient();

  // Cards key node metadata by the note's stable id; the React Flow node id
  // is a fallback for legacy nodes that pre-date the noteId roll-out.
  const metaKey = (data as { noteId?: string }).noteId ?? id;
  const meta = useNodeMetadataEntry(metaKey);
  const setMetadata = useSetNodeMetadata();

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
          'node-visual size-full cursor-pointer overflow-hidden rounded-3xl shadow-card transition-shadow duration-200 ease-out hover:shadow-card-hover'
        )}
      >
        <CardContent data={viewData} />
      </div>
    </div>
  );
};

export default memo(CardNode, nodeRenderPropsEqual);
