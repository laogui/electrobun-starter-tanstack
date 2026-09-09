import type {
  ContentApplyBatchResult,
  PluginHostCallMethod,
} from '../../shared/plugins/protocol';
import type { ContentBatchStore } from './contentBatch';

export interface ProbeSelectionItem {
  ref?: string;
  revision: number;
  title: string;
  token: string;
}

export interface ProbeHost {
  applyBatch?: (
    args: unknown
  ) => ContentApplyBatchResult | Promise<ContentApplyBatchResult>;
  calls: Array<{ args: unknown; method: PluginHostCallMethod }>;
  readSelection(): { items: ProbeSelectionItem[] };
}

export function createProbeHost(selection: ProbeSelectionItem[]): ProbeHost {
  const calls: ProbeHost['calls'] = [];
  return {
    applyBatch(args) {
      calls.push({ method: 'content.applyBatch', args });
      const operationId =
        typeof args === 'object' &&
        args !== null &&
        'operationId' in args &&
        typeof args.operationId === 'string'
          ? args.operationId
          : '';
      return { operationId, results: [] };
    },
    calls,
    readSelection() {
      calls.push({
        method: 'content.readSelection',
        args: { fields: ['title'] },
      });
      return {
        items: selection.map((item) => ({
          token: item.token,
          ref: item.ref ?? item.token,
          title: item.title,
          revision: item.revision,
        })),
      };
    },
  };
}

export function createContentBatchProbeHost(
  store: ContentBatchStore,
  operationId: string,
  workspaceId: string
): ProbeHost {
  const calls: ProbeHost['calls'] = [];
  return {
    calls,
    readSelection() {
      calls.push({
        method: 'content.readSelection',
        args: { fields: ['title'] },
      });
      return store.readSelection(operationId);
    },
    applyBatch(args) {
      calls.push({
        method: 'content.applyBatch',
        args,
      });
      return store.applyBatch(operationId, workspaceId, args);
    },
  };
}
