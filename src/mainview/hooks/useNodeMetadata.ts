import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import {
  type NodeMetadata,
  type NodeMetadataMap,
  rpcDeleteNodeMetadata,
  rpcLoadNodeMetadata,
  rpcSetNodeMetadata,
} from '@/lib/rpc';

const QUERY_KEY = ['node-metadata'] as const;

export type { NodeMetadata, NodeMetadataMap } from '@/lib/rpc';

/**
 * Fetch the workspace-wide node metadata map (tag / tagColor / tags keyed by
 * `noteId` for cards or React Flow `nodeId` for non-card nodes). Cached for
 * 5 minutes; mutations explicitly invalidate / patch the cache.
 */
export function useNodeMetadata() {
  const query = useQuery<NodeMetadataMap>({
    queryKey: QUERY_KEY,
    queryFn: async () => (await rpcLoadNodeMetadata()) ?? {},
    staleTime: 1000 * 60 * 5,
  });

  const map = query.data ?? {};

  const get = useCallback(
    (id: string | undefined): NodeMetadata | undefined =>
      id ? map[id] : undefined,
    [map]
  );

  return { ...query, map, get };
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
          if (metadata.tag && metadata.tag.trim()) {
            merged.tag = metadata.tag.trim();
          } else {
            merged.tag = undefined;
          }
        }
        if ('tagColor' in metadata) {
          if (metadata.tagColor && metadata.tagColor.trim()) {
            merged.tagColor = metadata.tagColor.trim();
          } else {
            merged.tagColor = undefined;
          }
        }
        if ('tags' in metadata) {
          const arr = (metadata.tags ?? []).filter((t) => t.trim().length > 0);
          merged.tags = arr.length > 0 ? arr : undefined;
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
