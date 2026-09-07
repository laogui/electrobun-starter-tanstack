import type { PluginHostCallMethod } from '../../shared/plugins/protocol';

export interface ProbeSelectionItem {
  revision: number;
  title: string;
  token: string;
}

export interface ProbeHost {
  calls: Array<{ args: unknown; method: PluginHostCallMethod }>;
  readSelection(): { items: ProbeSelectionItem[] };
}

export function createProbeHost(selection: ProbeSelectionItem[]): ProbeHost {
  const calls: ProbeHost['calls'] = [];
  return {
    calls,
    readSelection() {
      calls.push({
        method: 'content.readSelection',
        args: { fields: ['title'] },
      });
      return {
        items: selection.map((item) => ({
          token: item.token,
          title: item.title,
          revision: item.revision,
        })),
      };
    },
  };
}
