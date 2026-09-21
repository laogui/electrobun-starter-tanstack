import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { TagEditor, type TagEditorChange } from '@/components/card/TagEditor';
import {
  useNodeMetadataEntry,
  useSetNodeMetadata,
} from '@/hooks/useNodeMetadata';
import { useTags } from '@/hooks/useTags';
import { useCanvasStore } from '@/store/canvasStore';

interface UseNodeTagEditingResult {
  /** True when active tag filters exist and this node carries none of them. */
  dimmedByFilter: boolean;
  /** Imperative opener — wire to a hover button if the node wants one. */
  openTagEditor: () => void;
  /** Primary tag chip (display name + tag color). */
  tag: string | undefined;
  tagColor: string | undefined;
  tagColors: Record<string, string> | undefined;
  /** Mount this once anywhere in JSX — it renders an invisible popover anchor. */
  tagEditor: React.ReactElement;
  tags: string[] | undefined;
}

/**
 * Shared TagEditor wiring for any canvas node type that supports tags. Looks
 * up metadata by `data.noteId` (cards) or React Flow `nodeId` (non-card).
 * Writes go through the `useSetNodeMetadata` mutation, never into the node's
 * own `data` blob — tag metadata lives in the workspace-level
 * node-metadata sidecar.
 */
export function useNodeTagEditing(
  nodeId: string,
  data: Record<string, unknown>
): UseNodeTagEditingResult {
  const editingTagNodeId = useCanvasStore((s) => s.editingTagNodeId);
  const setEditingTagNodeId = useCanvasStore((s) => s.setEditingTagNodeId);
  const activeTagFilters = useCanvasStore((s) => s.activeTagFilters);
  const queryClient = useQueryClient();
  const { data: tagSummaries } = useTags();
  const suggestions = (tagSummaries ?? []).map((t) => t.name);

  const metaKey = (data.noteId as string | undefined) ?? nodeId;
  const meta = useNodeMetadataEntry(metaKey);
  const setMetadata = useSetNodeMetadata();

  const tag = meta?.tag;
  const tagColor = meta?.tagColor;
  const tagColors = meta?.tagColors;
  const tags = meta?.tags;

  // OR semantics: a card is "in scope" if it carries at least one of the
  // active filter tags. An empty filter list means no filtering at all.
  const dimmedByFilter = (() => {
    if (activeTagFilters.length === 0) {
      return false;
    }
    const haystack = new Set<string>();
    if (tag) {
      haystack.add(tag.toLowerCase());
    }
    for (const t of tags ?? []) {
      haystack.add(t.toLowerCase());
    }
    return !activeTagFilters.some((f) => haystack.has(f.toLowerCase()));
  })();

  const [open, setOpen] = useState(false);
  const editorOpen = open || editingTagNodeId === nodeId;

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
      open={editorOpen}
      suggestions={suggestions}
      tag={tag}
      tagColor={tagColor}
      tagColors={tagColors}
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

  return {
    tag,
    tagColor,
    tagColors,
    tags,
    dimmedByFilter,
    tagEditor,
    openTagEditor,
  };
}
