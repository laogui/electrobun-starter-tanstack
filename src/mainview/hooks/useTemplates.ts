import { useQuery } from '@tanstack/react-query';

import { rpcGetTemplate, rpcListTemplates } from '@/lib/rpc';

import * as m from '../../paraglide/messages.js';

/** Shape returned by the listTemplates RPC. */
export interface TemplateMeta {
  category: 'planning' | 'thinking' | 'knowledge' | 'blank';
  description: string;
  id: string;
  name: string;
  tags: string[];
  thumbnail: string;
}

/**
 * Per-template i18n entries. Built-in templates expose localized name and
 * description through paraglide so the templates browser respects the
 * user's locale. Templates not registered here fall back to the English
 * `name` and `description` from `meta.json`.
 */
const TEMPLATE_I18N: Record<
  string,
  { name: () => string; description: () => string }
> = {
  'quick-start': {
    name: () => m.template_quick_start_name(),
    description: () => m.template_quick_start_description(),
  },
  blank: {
    name: () => m.template_blank_name(),
    description: () => m.template_blank_description(),
  },
  'weekly-planner': {
    name: () => m.template_weekly_planner_name(),
    description: () => m.template_weekly_planner_description(),
  },
  kanban: {
    name: () => m.template_kanban_name(),
    description: () => m.template_kanban_description(),
  },
  'sprint-retro': {
    name: () => m.template_sprint_retro_name(),
    description: () => m.template_sprint_retro_description(),
  },
  'brainstorm-mindmap': {
    name: () => m.template_brainstorm_mindmap_name(),
    description: () => m.template_brainstorm_mindmap_description(),
  },
  'eisenhower-matrix': {
    name: () => m.template_eisenhower_matrix_name(),
    description: () => m.template_eisenhower_matrix_description(),
  },
  'reading-notes': {
    name: () => m.template_reading_notes_name(),
    description: () => m.template_reading_notes_description(),
  },
  demo: {
    name: () => m.template_demo_name(),
    description: () => m.template_demo_description(),
  },
};

/** Apply paraglide i18n to a template's `name` / `description`. */
function localizeMeta(meta: TemplateMeta): TemplateMeta {
  const i18n = TEMPLATE_I18N[meta.id];
  if (!i18n) {
    return meta;
  }
  return { ...meta, name: i18n.name(), description: i18n.description() };
}

/** Fetch the full template list from the backend. */
export function useTemplates() {
  return useQuery<TemplateMeta[]>({
    queryKey: ['templates'],
    queryFn: async () => {
      const result = await rpcListTemplates();
      const list = (result as TemplateMeta[] | null) ?? [];
      return list.map(localizeMeta);
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
      // Backend returns the raw meta; localize before handing to consumers.
      // Preserve all other fields (nodes / edges / noteContents) untouched
      // so the consumer types continue to match the pre-localization shape.
      const raw = result as Record<string, unknown> & { meta: TemplateMeta };
      const localized: Record<string, unknown> & { meta: TemplateMeta } = {
        ...raw,
        meta: localizeMeta(raw.meta),
      };
      return localized;
    },
    enabled: id.length > 0,
    staleTime: 1000 * 60 * 5,
  });
}
