import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { z } from 'zod';
import type { ManifestEdge, ManifestNode } from './manifest';
import type { NodeMetadata } from './nodeMetadata';
import { parseWidgetRecord, type WidgetRecord } from './widgets';

// ---------------------------------------------------------------------------
// Inline template data — imported at build time so the bundler embeds them
// directly into the output. This avoids runtime filesystem reads which break
// after Electrobun bundles everything into a single file.
// ---------------------------------------------------------------------------

import blankManifest from './templates/blank/manifest.canvas.json';
import blankMeta from './templates/blank/meta.json';
import brainstormMindmapManifest from './templates/brainstorm-mindmap/manifest.canvas.json';
import brainstormMindmapMeta from './templates/brainstorm-mindmap/meta.json';
import cafeAssets from './templates/cafe/assets.json';
import cafeManifest from './templates/cafe/manifest.canvas.json';
import cafeMeta from './templates/cafe/meta.json';
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
  color?: string;
  displayHint: string;
  title: string;
}

export interface TemplateExtensionSeed {
  canvasTypeId: string;
  dataVersion: number;
  presentation: {
    plainText?: string;
    subtitle?: string;
    title: string;
  };
  state: unknown;
}

export interface TemplateManifest {
  /**
   * JPEG bytes, base64 without a data-URL prefix. Keys are filenames
   * referenced from extension state as `tpl-asset:<filename>`.
   */
  assets?: Record<string, string>;
  edges: ManifestEdge[];
  extensionInstances?: Record<string, TemplateExtensionSeed>;
  meta: TemplateMeta;
  /**
   * Per-node metadata (tag / tagColor / tags). Keys are placeholder IDs:
   * for card nodes this matches the placeholder `noteId` and is remapped to
   * the real noteId at instantiation; for non-card nodes it is the React
   * Flow `node.id` and is used as-is. Entries are written to the workspace
   * node-metadata sidecar at template instantiation time.
   */
  nodeMetadata?: Record<string, NodeMetadata>;
  nodes: ManifestNode[];
  noteContents?: Record<string, TemplateNoteContent>;
  widgets?: Record<string, WidgetRecord>;
}
// ---------------------------------------------------------------------------
// Schemas — bundled JSON is parsed (not cast) into the template types. Object
// schemas are `loose()` so fields the types do not name (edge `markerEnd`,
// node extras, forward-compatible keys) pass through untouched.
// ---------------------------------------------------------------------------

const looseRecord = z.record(z.string(), z.unknown());

const templateMetaSchema = z.object({
  category: z.enum(['planning', 'thinking', 'knowledge', 'blank']),
  description: z.string(),
  id: z.string(),
  name: z.string(),
  tags: z.array(z.string()),
  thumbnail: z.string(),
}) satisfies z.ZodType<TemplateMeta>;

const manifestNodeSchema = z
  .object({
    data: looseRecord,
    extent: z.string().optional(),
    id: z.string(),
    parentId: z.string().optional(),
    position: z.object({ x: z.number(), y: z.number() }).loose(),
    style: looseRecord.optional(),
    type: z.string(),
  })
  .loose() satisfies z.ZodType<ManifestNode>;

const manifestEdgeSchema = z
  .object({
    animated: z.boolean().optional(),
    data: looseRecord.optional(),
    id: z.string(),
    label: z.string().optional(),
    source: z.string(),
    sourceHandle: z.string().optional(),
    target: z.string(),
    targetHandle: z.string().optional(),
    type: z.string().optional(),
  })
  .loose() satisfies z.ZodType<ManifestEdge>;

const nodeMetadataSchema = z
  .object({
    tag: z.string().optional(),
    tagColor: z.string().optional(),
    tagColors: z.record(z.string(), z.string()).optional(),
    tags: z.array(z.string()).optional(),
  })
  .loose() satisfies z.ZodType<NodeMetadata>;

const noteContentSchema = z
  .object({
    body: z.string(),
    color: z.string().optional(),
    displayHint: z.string(),
    title: z.string(),
  })
  .loose() satisfies z.ZodType<TemplateNoteContent>;

const extensionSeedSchema = z
  .object({
    canvasTypeId: z.string(),
    dataVersion: z.number(),
    presentation: z
      .object({
        plainText: z.string().optional(),
        subtitle: z.string().optional(),
        title: z.string(),
      })
      .loose(),
    state: z.unknown(),
  })
  .loose() satisfies z.ZodType<TemplateExtensionSeed>;

/** Widget seeds go through the same validator the workspace loader uses. */
const widgetSeedSchema = z.unknown().transform((value, ctx): WidgetRecord => {
  const parsed = parseWidgetRecord(value);
  if ('error' in parsed) {
    ctx.addIssue({ code: 'custom', message: 'Invalid widget record' });
    return z.NEVER;
  }
  return parsed;
});

const templateBodySchema = z.object({
  assets: z.record(z.string(), z.string()).optional(),
  edges: z.array(manifestEdgeSchema).default([]),
  extensionInstances: z.record(z.string(), extensionSeedSchema).optional(),
  nodeMetadata: z.record(z.string(), nodeMetadataSchema).optional(),
  nodes: z.array(manifestNodeSchema).default([]),
  noteContents: z.record(z.string(), noteContentSchema).optional(),
  widgets: z.record(z.string(), widgetSeedSchema).optional(),
}) satisfies z.ZodType<Omit<TemplateManifest, 'meta'>>;

type TemplateBody = Omit<TemplateManifest, 'meta'>;

// ---------------------------------------------------------------------------
// Registry — add new templates here
// ---------------------------------------------------------------------------

interface TemplateSource {
  manifest: unknown;
  meta: unknown;
}

const TEMPLATE_SOURCES: Record<string, TemplateSource> = {
  'quick-start': { meta: quickStartMeta, manifest: quickStartManifest },
  blank: { meta: blankMeta, manifest: blankManifest },
  'weekly-planner': {
    meta: weeklyPlannerMeta,
    manifest: weeklyPlannerManifest,
  },
  kanban: { meta: kanbanMeta, manifest: kanbanManifest },
  'sprint-retro': { meta: sprintRetroMeta, manifest: sprintRetroManifest },
  'brainstorm-mindmap': {
    meta: brainstormMindmapMeta,
    manifest: brainstormMindmapManifest,
  },
  'eisenhower-matrix': {
    meta: eisenhowerMatrixMeta,
    manifest: eisenhowerMatrixManifest,
  },
  'reading-notes': { meta: readingNotesMeta, manifest: readingNotesManifest },
  demo: { meta: demoMeta, manifest: demoManifest },
  cafe: { meta: cafeMeta, manifest: { ...cafeManifest, assets: cafeAssets } },
};

const parsedMeta = new Map<string, TemplateMeta>();
const parsedBody = new Map<string, TemplateBody>();

/**
 * Parse a bundled template lazily (first use) and cache it. Built-in data is
 * checked by `templates.test.ts`, so a throw here means a broken bundle.
 */
function templateMeta(id: string, source: TemplateSource): TemplateMeta {
  let meta = parsedMeta.get(id);
  if (!meta) {
    meta = templateMetaSchema.parse(source.meta);
    parsedMeta.set(id, meta);
  }
  return meta;
}

function templateBody(id: string, source: TemplateSource): TemplateBody {
  let body = parsedBody.get(id);
  if (!body) {
    body = templateBodySchema.parse(source.manifest);
    parsedBody.set(id, body);
  }
  return body;
}

/** List all built-in templates. */
export function listAllTemplates(): TemplateMeta[] {
  return Object.entries(TEMPLATE_SOURCES).map(([id, source]) => ({
    ...templateMeta(id, source),
  }));
}

/** Load a single template by id. Returns null if not found. */
export function loadTemplate(id: string): TemplateManifest | null {
  const source = TEMPLATE_SOURCES[id];
  if (!source) {
    return null;
  }
  const entry = {
    meta: templateMeta(id, source),
    manifest: templateBody(id, source),
  };

  return {
    meta: { ...entry.meta },
    nodes: entry.manifest.nodes ?? [],
    edges: entry.manifest.edges ?? [],
    noteContents: entry.manifest.noteContents,
    nodeMetadata: entry.manifest.nodeMetadata,
    assets: entry.manifest.assets,
    extensionInstances: entry.manifest.extensionInstances,
    widgets: entry.manifest.widgets,
  };
}

// ---------------------------------------------------------------------------
// Dev-only thumbnail writer
// ---------------------------------------------------------------------------

const PNG_DATA_URL_RE = /^data:image\/png;base64,(.+)$/i;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47] as const;
const REPO_ROOT_SEARCH_MAX_DEPTH = 12;

export interface WriteTemplateThumbnailResult {
  path?: string;
  reason?: string;
  success: boolean;
}

/**
 * Walk up from a starting directory looking for a folder that contains
 * BOTH `package.json` and `src/bun/templates/` — that's the repo root.
 *
 * Why two markers? Electrobun bundles the bun process to
 *   `<repo>/build/<channel>-<platform>-<arch>/<App>.app/Contents/Resources/app/bun/index.js`
 * and launches it with `cwd: <App>.app/Contents/MacOS`. Neither
 * `process.cwd()` nor `Bun.main` is the repo root, but every ancestor
 * chain from `Bun.main` reaches the repo root within ~7 levels in dev
 * builds. In production launches the user installs the .app under
 * `/Applications/` (or elsewhere) and the chain never reaches a
 * directory with `src/bun/templates`, so the search returns null and
 * the writer aborts cleanly.
 */
function resolveRepoRoot(): string | null {
  const candidates: string[] = [];
  if (typeof Bun !== 'undefined' && typeof Bun.main === 'string') {
    candidates.push(dirname(Bun.main));
  }
  candidates.push(process.cwd());

  for (const start of candidates) {
    let current = start;
    for (let depth = 0; depth < REPO_ROOT_SEARCH_MAX_DEPTH; depth += 1) {
      if (
        existsSync(join(current, 'package.json')) &&
        existsSync(join(current, 'src', 'bun', 'templates'))
      ) {
        return current;
      }
      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }
  return null;
}

/**
 * Write a thumbnail PNG into a built-in template's source directory.
 * Intended exclusively for the dev-mode "export thumbnail" workflow:
 * the templates browser UI can capture a ReactFlow snapshot and call
 * this function (via RPC) to drop it back into the repo so the next
 * commit picks it up.
 *
 * Safety guards:
 *   - `templateId` must be a registered built-in template (no arbitrary
 *     filesystem writes).
 *   - {@link resolveRepoRoot} must locate a directory that contains both
 *     `package.json` and `src/bun/templates/`. Packaged production apps
 *     live outside any such tree, so the writer refuses to run there.
 *   - The decoded payload must start with the PNG signature.
 */
export async function writeTemplateThumbnail(
  templateId: string,
  pngBase64OrDataUrl: string
): Promise<WriteTemplateThumbnailResult> {
  if (!TEMPLATE_SOURCES[templateId]) {
    return { success: false, reason: 'unknown-template' };
  }

  const repoRoot = resolveRepoRoot();
  if (!repoRoot) {
    return { success: false, reason: 'repo-root-not-found' };
  }

  const match = PNG_DATA_URL_RE.exec(pngBase64OrDataUrl);
  const base64 = match ? (match[1] ?? '') : pngBase64OrDataUrl;
  if (!base64) {
    return { success: false, reason: 'empty-payload' };
  }

  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
  if (bytes.length < PNG_SIGNATURE.length) {
    return { success: false, reason: 'invalid-png' };
  }
  for (const [idx, byte] of PNG_SIGNATURE.entries()) {
    if (bytes[idx] !== byte) {
      return { success: false, reason: 'invalid-png' };
    }
  }

  const dir = join(repoRoot, 'src', 'bun', 'templates', templateId);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  const filePath = join(dir, 'thumbnail.png');
  await writeFile(filePath, bytes);
  return {
    success: true,
    path: `src/bun/templates/${templateId}/thumbnail.png`,
  };
}
