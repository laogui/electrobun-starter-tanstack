import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import {
  type NodeMetadata,
  type NodeMetadataMap,
  rpcDeleteNodeMetadata,
  rpcLoadNodeMetadata,
  rpcSetNodeMetadata,
} from '@/lib/rpc';

const QUERY_KEY = ['node-metadata'] as const;
const EMPTY_NODE_METADATA: NodeMetadataMap = {};
const NODE_METADATA_QUERY = {
  queryFn: async () => (await rpcLoadNodeMetadata()) ?? {},
  queryKey: QUERY_KEY,
  staleTime: 1000 * 60 * 5,
} as const;

export type { NodeMetadata, NodeMetadataMap } from '@/lib/rpc';

const MAX_TAG_LENGTH = 32;

function normalizeTagColorMap(
  raw: Record<string, string> | undefined,
  tagNames: string[]
): Record<string, string> | undefined {
  if (!raw) {
    return;
  }
  const canonicalNames = new Map(
    tagNames.map((name) => [name.toLowerCase(), name])
  );
  const out: Record<string, string> = {};
  for (const [rawName, rawColor] of Object.entries(raw)) {
    const name = rawName.trim().slice(0, MAX_TAG_LENGTH);
    const color = rawColor.trim();
    if (!(name && color)) {
      continue;
    }
    const canonical = canonicalNames.get(name.toLowerCase());
    if (canonical) {
      out[canonical] = color;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function tagNamesForColors(meta: NodeMetadata): string[] {
  return [...(meta.tag ? [meta.tag] : []), ...(meta.tags ?? [])];
}

/**
 * Fetch the workspace-wide node metadata map (tag / tagColor / tags keyed by
 * `noteId` for cards or React Flow `nodeId` for non-card nodes). Cached for
 * 5 minutes; mutations explicitly invalidate / patch the cache.
 */
export function useNodeMetadata() {
  const {
    data,
    dataUpdatedAt,
    error,
    errorUpdateCount,
    errorUpdatedAt,
    failureCount,
    failureReason,
    fetchStatus,
    isError,
    isFetched,
    isFetchedAfterMount,
    isFetching,
    isInitialLoading,
    isLoading,
    isLoadingError,
    isPaused,
    isPending,
    isPlaceholderData,
    isRefetchError,
    isRefetching,
    isStale,
    isSuccess,
    promise,
    refetch,
    status,
  } = useQuery<NodeMetadataMap>(NODE_METADATA_QUERY);

  const map = useMemo(() => data ?? EMPTY_NODE_METADATA, [data]);

  const get = useCallback(
    (id: string | undefined): NodeMetadata | undefined =>
      id ? map[id] : undefined,
    [map]
  );

  return {
    data,
    dataUpdatedAt,
    error,
    errorUpdateCount,
    errorUpdatedAt,
    failureCount,
    failureReason,
    fetchStatus,
    get,
    isError,
    isFetched,
    isFetchedAfterMount,
    isFetching,
    isInitialLoading,
    isLoading,
    isLoadingError,
    isPaused,
    isPending,
    isPlaceholderData,
    isRefetchError,
    isRefetching,
    isStale,
    isSuccess,
    map,
    promise,
    refetch,
    status,
  };
}

/**
 * Subscribe to a single node's metadata. Other entries in the map can change
 * without re-rendering this subscriber (react-query `select` + structural sharing).
 */
export function useNodeMetadataEntry(
  id: string | undefined
): NodeMetadata | undefined {
  const { data } = useQuery<NodeMetadataMap, Error, NodeMetadata | undefined>({
    ...NODE_METADATA_QUERY,
    select: (map) => (id ? map[id] : undefined),
  });
  return data;
}

/**
 * Imperative setter for node metadata. Patches the React Query cache
 * optimistically, fires the RPC, and on settle re-syncs the `['tags']` query
 * so the sidebar's aggregate counts reflect the change.
 */
export function useSetNodeMetadata() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; metadata: NodeMetadata }) =>
      await rpcSetNodeMetadata(vars.id, vars.metadata),
    onMutate: ({ id, metadata }) => {
      const prev = queryClient.getQueryData<NodeMetadataMap>(QUERY_KEY);
      queryClient.setQueryData<NodeMetadataMap>(QUERY_KEY, (current) => {
        const base = current ?? {};
        const merged: NodeMetadata = { ...(base[id] ?? {}) };
        if ('tag' in metadata) {
          if (metadata.tag?.trim()) {
            merged.tag = metadata.tag.trim();
          } else {
            merged.tag = undefined;
          }
        }
        if ('tagColor' in metadata) {
          if (metadata.tagColor?.trim()) {
            merged.tagColor = metadata.tagColor.trim();
          } else {
            merged.tagColor = undefined;
          }
        }
        if ('tags' in metadata) {
          const arr = (metadata.tags ?? []).filter((t) => t.trim().length > 0);
          merged.tags = arr.length > 0 ? arr : undefined;
        }
        if ('tagColors' in metadata) {
          merged.tagColors = normalizeTagColorMap(
            metadata.tagColors,
            tagNamesForColors(merged)
          );
        } else if ('tag' in metadata || 'tags' in metadata) {
          merged.tagColors = normalizeTagColorMap(
            merged.tagColors,
            tagNamesForColors(merged)
          );
        }
        const next = { ...base };
        if (Object.values(merged).every((v) => v === undefined)) {
          delete next[id];
        } else {
          next[id] = merged;
        }
        return next;
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(QUERY_KEY, ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

/** Imperative deleter — drops the entire entry. Mirrors the optimistic dance. */
export function useDeleteNodeMetadata() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => await rpcDeleteNodeMetadata(id),
    onMutate: (id) => {
      const prev = queryClient.getQueryData<NodeMetadataMap>(QUERY_KEY);
      queryClient.setQueryData<NodeMetadataMap>(QUERY_KEY, (current) => {
        if (!current?.[id]) {
          return current ?? {};
        }
        const next = { ...current };
        delete next[id];
        return next;
      });
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(QUERY_KEY, ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}
