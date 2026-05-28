import { useQuery } from '@tanstack/react-query';

import { rpcListTags } from '@/lib/rpc';

/** Shape returned by the listTags RPC. */
export interface TagSummary {
  count: number;
  name: string;
}

/**
 * Fetch the workspace-wide aggregated tag list. Results are sorted by
 * descending count, then alphabetically. Cached for 1 minute — tag edits
 * (via TagEditor commit) should invalidate the `['tags']` query so the
 * sidebar reflects the new totals without a hard reload.
 */
export function useTags() {
  return useQuery<TagSummary[]>({
    queryKey: ['tags'],
    queryFn: async () => {
      const result = await rpcListTags();
      return (result as TagSummary[] | null) ?? [];
    },
    staleTime: 1000 * 60,
  });
}
