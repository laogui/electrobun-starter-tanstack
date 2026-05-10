import { useQuery } from '@tanstack/react-query';

import { rpcGetTemplate, rpcListTemplates } from '@/lib/rpc';

/** Shape returned by the listTemplates RPC. */
export interface TemplateMeta {
  category: 'planning' | 'thinking' | 'knowledge' | 'blank';
  description: string;
  id: string;
  name: string;
  tags: string[];
  thumbnail: string;
}

/** Fetch the full template list from the backend. */
export function useTemplates() {
  return useQuery<TemplateMeta[]>({
    queryKey: ['templates'],
    queryFn: async () => {
      const result = await rpcListTemplates();
      return (result as TemplateMeta[] | null) ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

/** Fetch a single template by id (includes nodes, edges, noteContents). */
export function useTemplate(id: string) {
  return useQuery({
    queryKey: ['templates', id],
    queryFn: async () => {
      const result = await rpcGetTemplate(id);
      if (!result) {
        throw new Error(`Template "${id}" not found`);
      }
      return result;
    },
    enabled: id.length > 0,
    staleTime: 1000 * 60 * 5,
  });
}
