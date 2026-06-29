import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { ManifestEdge, ManifestNode } from './manifest';
import type { NodeMetadata } from './nodeMetadata';

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
    nodeMetadata: entry.manifest.nodeMetadata,
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
  if (!TEMPLATE_REGISTRY[templateId]) {
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
