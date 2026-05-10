import type { ManifestEdge, ManifestNode } from './manifest';

// ---------------------------------------------------------------------------
// Inline template data — imported at build time so the bundler embeds them
// directly into the output. This avoids runtime filesystem reads which break
// after Electrobun bundles everything into a single file.
// ---------------------------------------------------------------------------

import kanbanManifest from './templates/kanban/manifest.canvas.json';
import kanbanMeta from './templates/kanban/meta.json';

export interface TemplateMeta {
  category: 'planning' | 'thinking' | 'knowledge' | 'blank';
  description: string;
  id: string;
  name: string;
  tags: string[];
  thumbnail: string;
}

export interface TemplateNoteContent {
  body: string;
  displayHint: string;
  title: string;
}

export interface TemplateManifest {
  edges: ManifestEdge[];
  meta: TemplateMeta;
  nodes: ManifestNode[];
  noteContents?: Record<string, TemplateNoteContent>;
}

// ---------------------------------------------------------------------------
// Registry — add new templates here
// ---------------------------------------------------------------------------

const TEMPLATE_REGISTRY: Record<
  string,
  { meta: TemplateMeta; manifest: Omit<TemplateManifest, 'meta'> }
> = {
  kanban: {
    meta: kanbanMeta as unknown as TemplateMeta,
    manifest: kanbanManifest as unknown as Omit<TemplateManifest, 'meta'>,
  },
};

/** List all built-in templates. */
export function listAllTemplates(): TemplateMeta[] {
  return Object.values(TEMPLATE_REGISTRY).map((t) => ({ ...t.meta }));
}

/** Load a single template by id. Returns null if not found. */
export function loadTemplate(id: string): TemplateManifest | null {
  const entry = TEMPLATE_REGISTRY[id];
  if (!entry) {
    return null;
  }

  return {
    meta: { ...entry.meta },
    nodes: entry.manifest.nodes ?? [],
    edges: entry.manifest.edges ?? [],
    noteContents: entry.manifest.noteContents,
  };
}
