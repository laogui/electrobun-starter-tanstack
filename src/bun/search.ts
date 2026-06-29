import { blocksToPlainText } from './blocknotePreview';
import { loadManifest, type ManifestEdge, type ManifestNode } from './manifest';
import { buildNoteIndex, loadNoteRecord, type NoteRecord } from './noteStore';
import { loadWorkspaceConfig } from './workspace';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchResultKind =
  | 'note'
  | 'sticky'
  | 'folder'
  | 'group'
  | 'image'
  | 'card'
  | 'asset'
  | 'recording'
  | 'link'
  | 'edge'
  | 'view';

export type SearchMatchField =
  | 'title'
  | 'body'
  | 'tag'
  | 'content'
  | 'label'
  | 'subtitle'
  | 'viewName'
  | 'fileName'
  | 'mimeType'
  | 'url'
  | 'description'
  | 'siteName';

export interface SearchResult {
  edgeId?: string;
  excerpt: string;
  id: string;
  kind: SearchResultKind;
  matchField: SearchMatchField;
  nodeId?: string;
  noteId?: string;
  position?: { x: number; y: number };
  score: number;
  title: string;
  viewId: string;
  viewName: string;
}

export interface SearchParams {
  limit?: number;
  query: string;
  viewId?: string;
}

// ---------------------------------------------------------------------------
// Markdown cleansing for body matching
// ---------------------------------------------------------------------------

const FENCED_CODE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`]*`/g;
const IMAGE_RE = /!\[[^\]]*\]\([^)]*\)/g;
const LINK_RE = /\[([^\]]+)\]\([^)]*\)/g;
const HEADING_PREFIX_RE = /^#{1,6}\s+/gm;
const TASK_PREFIX_RE = /^\s*[-*]\s*\[[ xX]\]\s+/gm;
const LIST_PREFIX_RE = /^\s*[-*+]\s+/gm;
const BOLD_RE = /\*\*([^*]+)\*\*/g;
const BOLD_UNDERSCORE_RE = /__([^_]+)__/g;
const ITALIC_STAR_RE = /(^|\s)\*([^*\s][^*]*?)\*(?=\s|$)/g;
const STRIKE_RE = /~~([^~]+)~~/g;
const MULTI_WS_RE = /\s+/g;

/** Cleanse markdown body so plain-text searches don't match link URLs etc. */
export function cleanMarkdown(body: string): string {
  return body
    .replace(FENCED_CODE_RE, ' ')
    .replace(INLINE_CODE_RE, ' ')
    .replace(IMAGE_RE, ' ')
    .replace(LINK_RE, '$1')
    .replace(HEADING_PREFIX_RE, '')
    .replace(TASK_PREFIX_RE, '')
    .replace(LIST_PREFIX_RE, '')
    .replace(BOLD_RE, '$1')
    .replace(BOLD_UNDERSCORE_RE, '$1')
    .replace(ITALIC_STAR_RE, '$1$2')
    .replace(STRIKE_RE, '$1')
    .replace(MULTI_WS_RE, ' ')
    .trim();
}

const EXCERPT_RADIUS = 48;

/** Build an excerpt around the match position from already-cleansed text. */
export function buildExcerpt(text: string, matchAt: number): string {
  if (matchAt < 0) {
    return text.slice(0, EXCERPT_RADIUS * 2);
  }
  const start = Math.max(0, matchAt - EXCERPT_RADIUS);
  const end = Math.min(text.length, matchAt + EXCERPT_RADIUS);
  let excerpt = text.slice(start, end);
  if (start > 0) {
    excerpt = `…${excerpt}`;
  }
  if (end < text.length) {
    excerpt = `${excerpt}…`;
  }
  return excerpt;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const FIELD_BASE_SCORE: Record<SearchMatchField, number> = {
  title: 100,
  fileName: 90,
  url: 85,
  tag: 80,
  label: 70,
  subtitle: 60,
  siteName: 60,
  description: 55,
  content: 55,
  body: 50,
  mimeType: 40,
  viewName: 30,
};

function scoreFor(field: SearchMatchField, isPrefix: boolean): number {
  const base = FIELD_BASE_SCORE[field];
  return isPrefix ? base + 5 : base;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface NodeRef {
  node: ManifestNode;
  viewId: string;
  viewName: string;
}

interface EdgeRef {
  edge: ManifestEdge;
  viewId: string;
  viewName: string;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function indexOfCi(haystack: string, needle: string): number {
  if (!(haystack && needle)) {
    return -1;
  }
  return haystack.toLowerCase().indexOf(needle);
}

function shortTextExcerpt(value: string): string {
  return value.length > 120 ? `${value.slice(0, 120)}…` : value;
}

// ---------------------------------------------------------------------------
// Main search
// ---------------------------------------------------------------------------

export async function searchWorkspace(
  wsPath: string,
  params: SearchParams
): Promise<SearchResult[]> {
  const queryRaw = (params.query ?? '').trim();
  if (!queryRaw) {
    return [];
  }
  const queryLower = queryRaw.toLowerCase();
  const limit = params.limit ?? 50;

  const config = await loadWorkspaceConfig(wsPath);
  const views = params.viewId
    ? config.views.filter((v) => v.id === params.viewId)
    : config.views;

  const results: SearchResult[] = [];

  // noteId → nodes (across views) so a markdown body match can fan out to
  // every node referencing that note.
  const noteIdToNodes = new Map<string, NodeRef[]>();

  // Walk manifests once: collect noteId → node mapping AND search short text.
  const loadedManifests = await Promise.all(
    views.map(async (view) => {
      try {
        return { manifest: await loadManifest(wsPath, view.file), view };
      } catch (error) {
        console.warn(`[search] Failed to load manifest for ${view.id}:`, error);
        return { manifest: null, view };
      }
    })
  );
  for (const { manifest, view } of loadedManifests) {
    if (!manifest) {
      continue;
    }

    // View name match
    const viewMatch = indexOfCi(view.name, queryLower);
    if (viewMatch !== -1) {
      results.push({
        id: `view:${view.id}`,
        kind: 'view',
        viewId: view.id,
        viewName: view.name,
        title: view.name,
        excerpt: view.name,
        matchField: 'viewName',
        score: scoreFor('viewName', viewMatch === 0),
      });
    }

    for (const node of manifest.nodes) {
      const ref: NodeRef = {
        viewId: view.id,
        viewName: view.name,
        node,
      };

      // Build noteId → nodes index
      const noteId = asString(node.data.noteId);
      if (noteId) {
        const list = noteIdToNodes.get(noteId) ?? [];
        list.push(ref);
        noteIdToNodes.set(noteId, list);
      }

      addManifestNodeMatches(results, ref, queryLower);
    }

    for (const edge of manifest.edges) {
      addEdgeMatches(
        results,
        { viewId: view.id, viewName: view.name, edge },
        queryLower
      );
    }
  }

  // Scan content/**/*.md and join with noteIdToNodes
  await scanNotes(wsPath, queryLower, noteIdToNodes, results);

  results.sort((a, b) => b.score - a.score);

  // Deduplicate by id (multiple field matches might collide); keep highest score
  const dedup = new Map<string, SearchResult>();
  for (const r of results) {
    const existing = dedup.get(r.id);
    if (!existing || existing.score < r.score) {
      dedup.set(r.id, r);
    }
  }

  return Array.from(dedup.values())
    .toSorted((a, b) => b.score - a.score)
    .slice(0, limit);
}

function addManifestNodeMatches(
  results: SearchResult[],
  ref: NodeRef,
  queryLower: string
) {
  const { node, viewId, viewName } = ref;
  const data = node.data;

  // For a card node, the manifest typically only carries noteId/file/type.
  // Body content is matched separately via Markdown scan.
  const candidates: Array<{ field: SearchMatchField; value: string }> = [];

  switch (node.type) {
    case 'sticky':
      candidates.push({ field: 'content', value: asString(data.content) });
      break;
    case 'folder':
      candidates.push({ field: 'title', value: asString(data.title) });
      candidates.push({ field: 'subtitle', value: asString(data.subtitle) });
      break;
    case 'group':
      candidates.push({ field: 'label', value: asString(data.label) });
      break;
    case 'image':
      candidates.push({ field: 'title', value: asString(data.title) });
      break;
    case 'asset':
      candidates.push({ field: 'title', value: asString(data.title) });
      candidates.push({ field: 'fileName', value: asString(data.fileName) });
      candidates.push({ field: 'mimeType', value: asString(data.mimeType) });
      break;
    case 'recording': {
      const title = asString(data.title);
      const recordingNumber =
        typeof data.recordingNumber === 'number' && data.recordingNumber > 0
          ? data.recordingNumber
          : 1;
      candidates.push({
        field: 'title',
        value: title || `New Recording #${recordingNumber}`,
      });
      candidates.push({ field: 'fileName', value: asString(data.fileName) });
      candidates.push({ field: 'mimeType', value: asString(data.mimeType) });
      break;
    }
    case 'link':
      candidates.push({ field: 'title', value: asString(data.title) });
      candidates.push({ field: 'url', value: asString(data.url) });
      candidates.push({
        field: 'description',
        value: asString(data.description),
      });
      candidates.push({ field: 'siteName', value: asString(data.siteName) });
      break;
    case 'card':
      // In case the manifest still has hydrated values (e.g., before save).
      candidates.push({ field: 'title', value: asString(data.title) });
      candidates.push({ field: 'tag', value: asString(data.tag) });
      break;
    default:
      break;
  }

  for (const { field, value } of candidates) {
    if (!value) {
      continue;
    }
    const idx = indexOfCi(value, queryLower);
    if (idx === -1) {
      continue;
    }
    results.push({
      id: `node:${viewId}:${node.id}:${field}`,
      kind: nodeKind(node.type),
      viewId,
      viewName,
      nodeId: node.id,
      noteId: asString(data.noteId) || undefined,
      title: shortTextExcerpt(asString(data.title) || value),
      excerpt: shortTextExcerpt(value),
      matchField: field,
      score: scoreFor(field, idx === 0),
      position: node.position,
    });
  }
}

function addEdgeMatches(
  results: SearchResult[],
  ref: EdgeRef,
  queryLower: string
) {
  const { edge, viewId, viewName } = ref;
  const dataLabel = asString(
    (edge as { data?: { label?: unknown } }).data?.label
  );
  const candidates: string[] = [];
  if (edge.label) {
    candidates.push(asString(edge.label));
  }
  if (dataLabel && dataLabel !== edge.label) {
    candidates.push(dataLabel);
  }
  for (const value of candidates) {
    const idx = indexOfCi(value, queryLower);
    if (idx === -1) {
      continue;
    }
    results.push({
      id: `edge:${viewId}:${edge.id}:label`,
      kind: 'edge',
      viewId,
      viewName,
      edgeId: edge.id,
      title: value,
      excerpt: shortTextExcerpt(value),
      matchField: 'label',
      score: scoreFor('label', idx === 0),
    });
  }
}

function nodeKind(nodeType: string): SearchResultKind {
  switch (nodeType) {
    case 'sticky':
      return 'sticky';
    case 'folder':
      return 'folder';
    case 'group':
      return 'group';
    case 'image':
      return 'image';
    case 'asset':
      return 'asset';
    case 'recording':
      return 'recording';
    case 'link':
      return 'link';
    case 'card':
      return 'card';
    default:
      return 'card';
  }
}

async function scanNotes(
  wsPath: string,
  queryLower: string,
  noteIdToNodes: Map<string, NodeRef[]>,
  results: SearchResult[]
) {
  const searchable: Array<{ record: NoteRecord; refs: NodeRef[] }> = [];
  const unresolved: string[] = [];

  const initialRecords = await Promise.all(
    Array.from(noteIdToNodes.entries()).map(async ([noteId, refs]) => {
      const markdownFile = markdownFileFromRefs(refs);
      const record = await loadNoteRecord(wsPath, noteId, markdownFile);
      return { noteId, record, refs };
    })
  );
  for (const { noteId, record, refs } of initialRecords) {
    if (record) {
      searchable.push({ record, refs });
    } else {
      unresolved.push(noteId);
    }
  }

  if (unresolved.length > 0) {
    const noteIndex = await buildNoteIndex(wsPath);
    const resolvedRecords = await Promise.all(
      unresolved.map(async (noteId) => {
        const refs = noteIdToNodes.get(noteId);
        if (!refs) {
          return null;
        }
        const location = noteIndex.get(noteId);
        const record = await loadNoteRecord(
          wsPath,
          noteId,
          location?.markdownFile
        );
        return record ? { record, refs } : null;
      })
    );
    for (const entry of resolvedRecords) {
      if (!entry) {
        continue;
      }
      searchable.push(entry);
    }
  }

  for (const { record, refs } of searchable) {
    const title = record.title;
    // Tags live in node-metadata for sidecar notes; legacy markdown still
    // carries them in frontmatter.
    let tag = '';
    const tags: string[] = [];
    let bodyText = '';
    if (record.source === 'markdown' && record.markdownDoc) {
      const fm = record.markdownDoc.frontmatter;
      tag = asString(fm.tag);
      if (Array.isArray(fm.tags)) {
        for (const rawTag of fm.tags as unknown[]) {
          const normalizedTag = asString(rawTag);
          if (normalizedTag) {
            tags.push(normalizedTag);
          }
        }
      }
      bodyText = cleanMarkdown(record.markdownDoc.body);
    } else {
      bodyText = blocksToPlainText(record.blocks);
    }

    const titleIdx = indexOfCi(title, queryLower);
    const tagIdx = indexOfCi(tag, queryLower);
    let matchingTag: string | undefined;
    let matchingTagIdx = -1;
    for (const candidateTag of tags) {
      const candidateIdx = indexOfCi(candidateTag, queryLower);
      if (candidateIdx !== -1) {
        matchingTag = candidateTag;
        matchingTagIdx = candidateIdx;
        break;
      }
    }
    const bodyIdx = indexOfCi(bodyText, queryLower);

    for (const ref of refs) {
      if (titleIdx !== -1 && title) {
        pushNoteResult(
          results,
          ref,
          record.noteId,
          title,
          title,
          'title',
          titleIdx
        );
      }
      if (tagIdx !== -1 && tag) {
        pushNoteResult(results, ref, record.noteId, title, tag, 'tag', tagIdx);
      } else if (matchingTag) {
        pushNoteResult(
          results,
          ref,
          record.noteId,
          title,
          matchingTag,
          'tag',
          matchingTagIdx
        );
      }
      if (bodyIdx !== -1 && bodyText) {
        pushNoteResult(
          results,
          ref,
          record.noteId,
          title,
          buildExcerpt(bodyText, bodyIdx),
          'body',
          bodyIdx
        );
      }
    }
  }
}

function markdownFileFromRefs(refs: NodeRef[]): string | undefined {
  for (const ref of refs) {
    const file = asString(ref.node.data.file);
    if (file) {
      return file;
    }
  }
  return;
}

function pushNoteResult(
  results: SearchResult[],
  ref: NodeRef,
  noteId: string,
  title: string,
  excerpt: string,
  field: SearchMatchField,
  matchIdx: number
) {
  const { node, viewId, viewName } = ref;
  results.push({
    id: `note:${viewId}:${node.id}:${field}`,
    kind: 'note',
    viewId,
    viewName,
    nodeId: node.id,
    noteId,
    title: shortTextExcerpt(title || excerpt),
    excerpt: shortTextExcerpt(excerpt),
    matchField: field,
    score: scoreFor(field, matchIdx === 0),
    position: node.position,
  });
}
