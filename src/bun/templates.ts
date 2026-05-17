import type { ManifestEdge, ManifestNode } from './manifest';

// ---------------------------------------------------------------------------
// Inline template data — imported at build time so the bundler embeds them
// directly into the output. This avoids runtime filesystem reads which break
// after Electrobun bundles everything into a single file.
// ---------------------------------------------------------------------------

import blankManifest from './templates/blank/manifest.canvas.json';
import blankMeta from './templates/blank/meta.json';
import brainstormMindmapManifest from './templates/brainstorm-mindmap/manifest.canvas.json';
import brainstormMindmapMeta from './templates/brainstorm-mindmap/meta.json';
import demoManifest from './templates/demo/manifest.canvas.json';
import demoMeta from './templates/demo/meta.json';
import eisenhowerMatrixManifest from './templates/eisenhower-matrix/manifest.canvas.json';
import eisenhowerMatrixMeta from './templates/eisenhower-matrix/meta.json';
import kanbanManifest from './templates/kanban/manifest.canvas.json';
import kanbanMeta from './templates/kanban/meta.json';
import quickStartManifest from './templates/quick-start/manifest.canvas.json';
import quickStartMeta from './templates/quick-start/meta.json';
import readingNotesManifest from './templates/reading-notes/manifest.canvas.json';
import readingNotesMeta from './templates/reading-notes/meta.json';
import sprintRetroManifest from './templates/sprint-retro/manifest.canvas.json';
import sprintRetroMeta from './templates/sprint-retro/meta.json';
import weeklyPlannerManifest from './templates/weekly-planner/manifest.canvas.json';
import weeklyPlannerMeta from './templates/weekly-planner/meta.json';

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
  'quick-start': {
    meta: quickStartMeta as unknown as TemplateMeta,
    manifest: quickStartManifest as unknown as Omit<TemplateManifest, 'meta'>,
  },
  blank: {
    meta: blankMeta as unknown as TemplateMeta,
    manifest: blankManifest as unknown as Omit<TemplateManifest, 'meta'>,
  },
  'weekly-planner': {
    meta: weeklyPlannerMeta as unknown as TemplateMeta,
    manifest: weeklyPlannerManifest as unknown as Omit<
      TemplateManifest,
      'meta'
    >,
  },
  kanban: {
    meta: kanbanMeta as unknown as TemplateMeta,
    manifest: kanbanManifest as unknown as Omit<TemplateManifest, 'meta'>,
  },
  'sprint-retro': {
    meta: sprintRetroMeta as unknown as TemplateMeta,
    manifest: sprintRetroManifest as unknown as Omit<TemplateManifest, 'meta'>,
  },
  'brainstorm-mindmap': {
    meta: brainstormMindmapMeta as unknown as TemplateMeta,
    manifest: brainstormMindmapManifest as unknown as Omit<
      TemplateManifest,
      'meta'
    >,
  },
  'eisenhower-matrix': {
    meta: eisenhowerMatrixMeta as unknown as TemplateMeta,
    manifest: eisenhowerMatrixManifest as unknown as Omit<
      TemplateManifest,
      'meta'
    >,
  },
  'reading-notes': {
    meta: readingNotesMeta as unknown as TemplateMeta,
    manifest: readingNotesManifest as unknown as Omit<TemplateManifest, 'meta'>,
  },
  demo: {
    meta: demoMeta as unknown as TemplateMeta,
    manifest: demoManifest as unknown as Omit<TemplateManifest, 'meta'>,
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
