import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { TagEditor, type TagEditorChange } from '@/components/card/TagEditor';
import {
  useNodeMetadata,
  useSetNodeMetadata,
} from '@/hooks/useNodeMetadata';
import { useTags } from '@/hooks/useTags';
import { useCanvasStore } from '@/store/canvasStore';

interface UseNodeTagEditingResult {
  /** Primary tag chip (display name + tag color). */
  tag: string | undefined;
  tagColor: string | undefined;
  tags: string[] | undefined;
  /** True when activeTagFilter is set and this node lacks the tag. */
  dimmedByFilter: boolean;
  /** Mount this once anywhere in JSX — it renders an invisible popover anchor. */
  tagEditor: React.ReactElement;
  /** Imperative opener — wire to a hover button if the node wants one. */
  openTagEditor: () => void;
}

/**
 * Shared TagEditor wiring for any canvas node type that supports tags. Looks
 * up metadata by `data.noteId` (cards) or React Flow `nodeId` (non-card).
 * Writes go through the `useSetNodeMetadata` mutation, never into the node's
 * own `data` blob — see ADR 0001.
 */
export function useNodeTagEditing(
  nodeId: string,
  data: Record<string, unknown>
): UseNodeTagEditingResult {
  const editingTagNodeId = useCanvasStore((s) => s.editingTagNodeId);
  const setEditingTagNodeId = useCanvasStore((s) => s.setEditingTagNodeId);
  const activeTagFilter = useCanvasStore((s) => s.activeTagFilter);
  const queryClient = useQueryClient();
  const { data: tagSummaries } = useTags();
  const suggestions = (tagSummaries ?? []).map((t) => t.name);

  const metaKey = (data.noteId as string | undefined) ?? nodeId;
  const { get: getMeta } = useNodeMetadata();
  const setMetadata = useSetNodeMetadata();
  const meta = getMeta(metaKey);

  const tag = meta?.tag;
  const tagColor = meta?.tagColor;
  const tags = meta?.tags;

  const dimmedByFilter = (() => {
    if (!activeTagFilter) {
      return false;
    }
    const needle = activeTagFilter.toLowerCase();
    if (tag && tag.toLowerCase() === needle) {
      return false;
    }
    if (tags?.some((t) => t.toLowerCase() === needle)) {
      return false;
    }
    return true;
  })();

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (editingTagNodeId === nodeId) {
      setOpen(true);
    }
  }, [editingTagNodeId, nodeId]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        if (editingTagNodeId === nodeId) {
          setEditingTagNodeId(null);
        }
        queryClient.invalidateQueries({ queryKey: ['tags'] });
      }
    },
    [editingTagNodeId, nodeId, queryClient, setEditingTagNodeId]
  );

  const handleChange = useCallback(
    (next: TagEditorChange) => {
      setMetadata.mutate({ id: metaKey, metadata: next });
    },
    [metaKey, setMetadata]
  );

  const openTagEditor = useCallback(() => {
    setOpen(true);
  }, []);

  const tagEditor = (
    <TagEditor
      onChange={handleChange}
      onOpenChange={handleOpenChange}
      open={open}
      suggestions={suggestions}
      tag={tag}
      tagColor={tagColor}
      tags={tags}
    >
      <button
        aria-hidden="true"
        className="pointer-events-none absolute top-3 left-3 size-0 opacity-0"
        tabIndex={-1}
        type="button"
      />
    </TagEditor>
  );

  return { tag, tagColor, tags, dimmedByFilter, tagEditor, openTagEditor };
}
