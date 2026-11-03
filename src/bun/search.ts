import { getEdgeLabelText } from '../shared/canvasEdgeFields';
import { absoluteNodePosition } from '../shared/canvasGeometry';
import {
  searchKindForCanvasType,
  widgetKindForCanvasType,
} from '../shared/extensions/builtinIds';
import { isCanvasTypeEnabled } from '../shared/extensions/enablement';
import { isExtensionInstanceLoadError } from '../shared/extensions/instance';
import type {
  SearchContentReference,
  SearchMatchField,
  SearchResult,
  SearchResultKind,
  SearchResultTarget,
} from '../shared/searchTypes';
import { blocksToPlainText } from './blocknotePreview';
import { FS_CONCURRENCY, mapWithConcurrency } from './concurrency';
import { loadExtensionEnablement } from './extensions/enablement';
import { loadExtensionInstances } from './extensions/instanceStore';
import { loadManifest, type ManifestEdge, type ManifestNode } from './manifest';
import { loadAllMetadata, type NodeMetadata } from './nodeMetadata';
import { buildNoteIndex, loadNoteRecord, type NoteRecord } from './noteStore';
import {
  type ChecklistWidgetData,
  loadWidgets,
  type ReminderWidgetData,
  type WidgetRecord,
} from './widgets';
import { loadWorkspaceConfig } from './workspace';

export type {
  SearchMatchField,
  SearchResult,
  SearchResultKind,
} from '../shared/searchTypes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  containerId?: string;
  containerType?: 'folder' | 'group';
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

function nodeRefContainer(
  node: ManifestNode
): Pick<NodeRef, 'containerId' | 'containerType'> {
  return node.parentId
    ? { containerId: node.parentId, containerType: 'group' }
    : {};
}

function contentReferenceForNode(
  nodeType: string,
  data: Record<string, unknown>
): SearchContentReference | undefined {
  if (nodeType === 'card') {
    const noteId = asString(data.noteId);
    return noteId ? { kind: 'note', id: noteId } : undefined;
  }
  if (nodeType === 'widget') {
    const widgetId = asString(data.widgetId);
    return widgetId ? { kind: 'widget', id: widgetId } : undefined;
  }
  if (nodeType === 'extension') {
    const instanceId = asString(data.instanceId);
    return instanceId ? { kind: 'extension', id: instanceId } : undefined;
  }
  if (
    nodeType === 'image' ||
    nodeType === 'asset' ||
    nodeType === 'recording'
  ) {
    const attachmentId =
      asString(data.attachmentFile) ||
      asString(data.imageFile) ||
      asString(data.file);
    return attachmentId ? { kind: 'attachment', id: attachmentId } : undefined;
  }
  return;
}

function targetForNodeRef(
  ref: NodeRef,
  content?: SearchContentReference
): SearchResultTarget {
  if (ref.containerType === 'folder' && ref.containerId) {
    return {
      type: 'folder-child',
      viewId: ref.viewId,
      folderId: ref.containerId,
      childId: ref.node.id,
      placement: 'folder',
      ...(content ? { content } : {}),
    };
  }
  const placement =
    ref.node.data.detached === true
      ? 'detached'
      : ref.containerType === 'group'
        ? 'group'
        : 'top-level';
  return {
    type: 'node',
    viewId: ref.viewId,
    nodeId: ref.node.id,
    placement,
    ...(content ? { content } : {}),
  };
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
  const metadata = await loadAllMetadata(wsPath);

  const results: SearchResult[] = [];

  // noteId → nodes (across views) so a markdown body match can fan out to
  // every node referencing that note.
  const noteIdToNodes = new Map<string, NodeRef[]>();
  const widgetIdToNodes = new Map<string, NodeRef[]>();
  const instanceIdToNodes = new Map<string, NodeRef[]>();

  // Walk manifests once: collect noteId → node mapping AND search short text.
  const loadedManifests = await mapWithConcurrency(
    views,
    FS_CONCURRENCY,
    async (view) => {
      try {
        return { manifest: await loadManifest(wsPath, view.file), view };
      } catch (error) {
        console.warn(`[search] Failed to load manifest for ${view.id}:`, error);
        return { manifest: null, view };
      }
    }
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
        target: { type: 'view', viewId: view.id },
        viewId: view.id,
        viewName: view.name,
        title: view.name,
        excerpt: view.name,
        matchField: 'viewName',
        score: scoreFor('viewName', viewMatch === 0),
      });
    }

    for (const storedNode of manifest.nodes) {
      const node = {
        ...storedNode,
        position: absoluteNodePosition(storedNode, manifest.nodes),
      };
      const ref: NodeRef = {
        ...nodeRefContainer(node),
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
      collectWidgetRefs(node, view.id, view.name, widgetIdToNodes);
      collectExtensionRefs(node, view.id, view.name, instanceIdToNodes);
      collectFolderChildMatches(
        node,
        view.id,
        view.name,
        queryLower,
        noteIdToNodes,
        metadata,
        results
      );

      addManifestNodeMatches(results, ref, queryLower, metadata);
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
  await scanNotes(wsPath, queryLower, noteIdToNodes, metadata, results);
  await scanWidgets(wsPath, queryLower, widgetIdToNodes, results);
  await scanExtensionInstances(wsPath, queryLower, instanceIdToNodes, results);

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

function addWidgetRef(
  map: Map<string, NodeRef[]>,
  widgetId: string,
  ref: NodeRef
): void {
  const list = map.get(widgetId) ?? [];
  list.push(ref);
  map.set(widgetId, list);
}

function collectWidgetRefs(
  node: ManifestNode,
  viewId: string,
  viewName: string,
  out: Map<string, NodeRef[]>
): void {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (node.type === 'widget') {
    const widgetId = asString(data.widgetId);
    if (widgetId) {
      addWidgetRef(out, widgetId, {
        ...nodeRefContainer(node),
        node,
        viewId,
        viewName,
      });
    }
    return;
  }

  if (node.type !== 'folder') {
    return;
  }

  const children = data.children;
  if (!Array.isArray(children)) {
    return;
  }
  for (const rawChild of children) {
    if (!rawChild || typeof rawChild !== 'object') {
      continue;
    }
    const child = rawChild as {
      data?: Record<string, unknown>;
      id?: unknown;
      type?: unknown;
    };
    if (child.type !== 'widget') {
      continue;
    }
    const childData = (child.data ?? {}) as Record<string, unknown>;
    const widgetId = asString(childData.widgetId);
    const childId = asString(child.id);
    if (!(widgetId && childId)) {
      continue;
    }
    addWidgetRef(out, widgetId, {
      containerId: node.id,
      containerType: 'folder',
      node: {
        ...node,
        id: childId,
        type: 'widget',
        data: childData,
      },
      viewId,
      viewName,
    });
  }
}

function collectFolderChildMatches(
  node: ManifestNode,
  viewId: string,
  viewName: string,
  queryLower: string,
  noteIdToNodes: Map<string, NodeRef[]>,
  metadata: Record<string, NodeMetadata>,
  results: SearchResult[]
): void {
  if (node.type !== 'folder') {
    return;
  }
  const children = (node.data as Record<string, unknown>).children;
  if (!Array.isArray(children)) {
    return;
  }
  for (const rawChild of children) {
    if (!rawChild || typeof rawChild !== 'object') {
      continue;
    }
    const child = rawChild as {
      data?: Record<string, unknown>;
      id?: unknown;
      type?: unknown;
    };
    const childId = asString(child.id);
    const childType = asString(child.type);
    if (!(childId && childType)) {
      continue;
    }
    const childData = (child.data ?? {}) as Record<string, unknown>;
    const childRef: NodeRef = {
      containerId: node.id,
      containerType: 'folder',
      node: {
        ...node,
        id: childId,
        type: childType,
        data: childData,
      },
      viewId,
      viewName,
    };
    const noteId = asString(childData.noteId);
    if (noteId) {
      const refs = noteIdToNodes.get(noteId) ?? [];
      refs.push(childRef);
      noteIdToNodes.set(noteId, refs);
    }
    // Widget/Extension bodies are joined by their dedicated sidecar scans;
    // this call fills the manifest metadata gap for Card/media/link children.
    addManifestNodeMatches(results, childRef, queryLower, metadata);
  }
}

function addInstanceRef(
  map: Map<string, NodeRef[]>,
  instanceId: string,
  ref: NodeRef
): void {
  const list = map.get(instanceId) ?? [];
  list.push(ref);
  map.set(instanceId, list);
}

function collectExtensionRefs(
  node: ManifestNode,
  viewId: string,
  viewName: string,
  out: Map<string, NodeRef[]>
): void {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (node.type === 'extension') {
    const instanceId = asString(data.instanceId);
    if (instanceId) {
      addInstanceRef(out, instanceId, {
        ...nodeRefContainer(node),
        node,
        viewId,
        viewName,
      });
    }
    return;
  }
  if (node.type !== 'folder') {
    return;
  }
  const children = data.children;
  if (!Array.isArray(children)) {
    return;
  }
  for (const rawChild of children) {
    if (!rawChild || typeof rawChild !== 'object') {
      continue;
    }
    const child = rawChild as {
      data?: Record<string, unknown>;
      id?: unknown;
      type?: unknown;
    };
    if (child.type !== 'extension') {
      continue;
    }
    const childData = (child.data ?? {}) as Record<string, unknown>;
    const instanceId = asString(childData.instanceId);
    const childId = asString(child.id);
    if (!(instanceId && childId)) {
      continue;
    }
    addInstanceRef(out, instanceId, {
      containerId: node.id,
      containerType: 'folder',
      node: {
        ...node,
        id: childId,
        type: 'extension',
        data: childData,
      },
      viewId,
      viewName,
    });
  }
}

function addMetadataTagCandidates(
  candidates: Array<{ field: SearchMatchField; value: string }>,
  metadata: Record<string, NodeMetadata>,
  data: Record<string, unknown>,
  nodeId: string
): void {
  const metaKey = asString(data.noteId) || nodeId;
  const meta = metadata[metaKey];
  if (meta?.tag) {
    candidates.push({ field: 'tag', value: meta.tag });
  }
  if (Array.isArray(meta?.tags)) {
    for (const rawTag of meta.tags) {
      if (typeof rawTag === 'string' && rawTag) {
        candidates.push({ field: 'tag', value: rawTag });
      }
    }
  }
}

function addManifestNodeMatches(
  results: SearchResult[],
  ref: NodeRef,
  queryLower: string,
  metadata: Record<string, NodeMetadata>
) {
  const { node, viewId, viewName } = ref;
  const data = node.data;

  // For a card node, the manifest typically only carries noteId/file/type.
  // Body content is matched separately via Markdown scan.
  const candidates: Array<{ field: SearchMatchField; value: string }> = [];
  addMetadataTagCandidates(candidates, metadata, data, node.id);

  switch (node.type) {
    case 'sticky':
      candidates.push({ field: 'content', value: asString(data.content) });
      break;
    case 'topic':
      // Matched even when `topicVersion` is unknown: a forward-version record
      // should still be findable so the user can locate and inspect it.
      candidates.push({ field: 'title', value: asString(data.title) });
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
      target: targetForNodeRef(ref, contentReferenceForNode(node.type, data)),
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
  // Index the same label the canvas renders. When `data.label` and the
  // historical top-level `label` disagree, indexing both would surface a hit
  // the user cannot see on the edge.
  const value = getEdgeLabelText(edge);
  if (!value) {
    return;
  }
  const idx = indexOfCi(value, queryLower);
  if (idx === -1) {
    return;
  }
  results.push({
    id: `edge:${viewId}:${edge.id}:label`,
    kind: 'edge',
    target: { type: 'edge', viewId, edgeId: edge.id },
    viewId,
    viewName,
    edgeId: edge.id,
    title: value,
    excerpt: shortTextExcerpt(value),
    matchField: 'label',
    score: scoreFor('label', idx === 0),
  });
}

function nodeKind(nodeType: string): SearchResultKind {
  switch (nodeType) {
    case 'sticky':
      return 'sticky';
    case 'topic':
      return 'topic';
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
    case 'widget':
      return 'widget';
    case 'extension':
      return 'extension';
    case 'card':
      return 'card';
    default:
      return 'card';
  }
}

function isWidgetRecord(record: unknown): record is WidgetRecord {
  return !!record && typeof record === 'object' && !('error' in record);
}

function widgetCandidates(record: WidgetRecord): Array<{
  field: SearchMatchField;
  value: string;
}> {
  const candidates: Array<{ field: SearchMatchField; value: string }> = [
    { field: 'title', value: record.title },
  ];

  switch (record.kind) {
    case 'checklist': {
      const data = record.data as ChecklistWidgetData;
      for (const item of data.items ?? []) {
        candidates.push({ field: 'content', value: item.text });
      }
      break;
    }
    case 'pomodoro': {
      break;
    }
    case 'reminder': {
      const data = record.data as ReminderWidgetData;
      candidates.push({ field: 'content', value: data.note ?? '' });
      candidates.push({ field: 'content', value: data.dueAt });
      break;
    }
    default: {
      const _exhaustive: never = record.kind;
      return _exhaustive;
    }
  }

  return candidates;
}

async function scanWidgets(
  wsPath: string,
  queryLower: string,
  widgetIdToNodes: Map<string, NodeRef[]>,
  results: SearchResult[]
): Promise<void> {
  if (widgetIdToNodes.size === 0) {
    return;
  }

  const widgetIds = Array.from(widgetIdToNodes.keys());
  const widgets = await loadWidgets(wsPath, widgetIds);
  for (const widgetId of widgetIds) {
    const record = widgets[widgetId];
    if (!isWidgetRecord(record)) {
      continue;
    }

    for (const { field, value } of widgetCandidates(record)) {
      if (!value) {
        continue;
      }
      const idx = indexOfCi(value, queryLower);
      if (idx === -1) {
        continue;
      }
      const refs = widgetIdToNodes.get(widgetId) ?? [];
      for (const ref of refs) {
        results.push({
          id: `widget:${ref.viewId}:${ref.node.id}:${widgetId}:${field}`,
          kind: 'widget',
          viewId: ref.viewId,
          viewName: ref.viewName,
          nodeId: ref.node.id,
          widgetId,
          widgetKind: record.kind,
          target: targetForNodeRef(ref, {
            kind: 'widget',
            id: widgetId,
          }),
          title: shortTextExcerpt(record.title || value),
          excerpt: shortTextExcerpt(value),
          matchField: field,
          score: scoreFor(field, idx === 0),
          position: ref.node.position,
        });
      }
    }
  }
}

async function scanExtensionInstances(
  wsPath: string,
  queryLower: string,
  instanceIdToNodes: Map<string, NodeRef[]>,
  results: SearchResult[]
): Promise<void> {
  if (instanceIdToNodes.size === 0) {
    return;
  }
  const enablement = await loadExtensionEnablement(wsPath);
  const records = await loadExtensionInstances(wsPath, [
    ...instanceIdToNodes.keys(),
  ]);
  for (const [instanceId, record] of Object.entries(records)) {
    if (isExtensionInstanceLoadError(record)) {
      continue;
    }
    const presentation = record.presentation;
    const candidates: Array<{ field: SearchMatchField; value: string }> = [
      { field: 'title', value: presentation.title },
      { field: 'subtitle', value: presentation.subtitle ?? '' },
      { field: 'content', value: presentation.plainText ?? '' },
    ];
    const availability = isCanvasTypeEnabled(
      record.canvasTypeId,
      enablement.disabledCanvasTypes
    )
      ? 'available'
      : 'disabled';
    const kind = searchKindForCanvasType(record.canvasTypeId);
    const widgetKind = widgetKindForCanvasType(record.canvasTypeId);
    for (const { field, value } of candidates) {
      if (!value) {
        continue;
      }
      const idx = indexOfCi(value, queryLower);
      if (idx === -1) {
        continue;
      }
      for (const ref of instanceIdToNodes.get(instanceId) ?? []) {
        results.push({
          id: `extension:${ref.viewId}:${ref.node.id}:${instanceId}:${field}`,
          kind,
          viewId: ref.viewId,
          viewName: ref.viewName,
          nodeId: ref.node.id,
          widgetKind,
          target: targetForNodeRef(ref, {
            kind: 'extension',
            id: instanceId,
          }),
          title: shortTextExcerpt(presentation.title || value),
          excerpt: shortTextExcerpt(value),
          matchField: field,
          score: scoreFor(field, idx === 0),
          position: ref.node.position,
          extension: {
            canvasTypeId: record.canvasTypeId,
            instanceId,
            availability,
          },
        });
      }
    }
  }
}

async function scanNotes(
  wsPath: string,
  queryLower: string,
  noteIdToNodes: Map<string, NodeRef[]>,
  metadata: Record<string, NodeMetadata>,
  results: SearchResult[]
) {
  const searchable: Array<{ record: NoteRecord; refs: NodeRef[] }> = [];
  const unresolved: string[] = [];

  const initialRecords = await mapWithConcurrency(
    Array.from(noteIdToNodes.entries()),
    FS_CONCURRENCY,
    async ([noteId, refs]) => {
      const markdownFile = markdownFileFromRefs(refs);
      const record = await loadNoteRecord(wsPath, noteId, markdownFile);
      return { noteId, record, refs };
    }
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
    const resolvedRecords = await mapWithConcurrency(
      unresolved,
      FS_CONCURRENCY,
      async (noteId) => {
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
      }
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

    const meta = metadata[record.noteId];
    if (!tag && meta?.tag) {
      tag = asString(meta.tag);
    }
    if (Array.isArray(meta?.tags)) {
      for (const rawTag of meta.tags) {
        const normalizedTag = asString(rawTag);
        if (normalizedTag && !tags.includes(normalizedTag)) {
          tags.push(normalizedTag);
        }
      }
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
    target: targetForNodeRef(ref, { kind: 'note', id: noteId }),
    title: shortTextExcerpt(title || excerpt),
    excerpt: shortTextExcerpt(excerpt),
    matchField: field,
    score: scoreFor(field, matchIdx === 0),
    position: node.position,
  });
}
