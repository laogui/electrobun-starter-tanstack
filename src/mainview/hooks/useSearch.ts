import type { Node } from '@xyflow/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { type NodeMetadataMap, useNodeMetadata } from '@/hooks/useNodeMetadata';
import { rpcSearchCanvas } from '@/lib/rpc';
import type {
  SearchMatchField,
  SearchResult,
  SearchResultKind,
} from '@/lib/searchTypes';
import { useCanvasStore } from '@/store/canvasStore';
import { searchKindForCanvasType } from '../../shared/extensions/builtinIds';
import type {
  SearchContentReference,
  SearchResultTarget,
} from '../../shared/searchTypes';

const DEFAULT_DEBOUNCE_MS = 200;
const FALLBACK_LIMIT = 50;

interface UseSearchOptions {
  debounceMs?: number;
  limit?: number;
}

interface UseSearchState {
  error: string | null;
  /** True when the renderer fell back to in-memory current-view scan. */
  fallback: boolean;
  isLoading: boolean;
  query: string;
  results: SearchResult[];
  setQuery: (q: string) => void;
}

export function useSearch(options: UseSearchOptions = {}): UseSearchState {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const limit = options.limit ?? FALLBACK_LIMIT;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const requestSeqRef = useRef(0);

  const activeViewId = useCanvasStore((s) => s.activeViewId);
  const views = useCanvasStore((s) => s.views);
  const { map: metadataMap } = useNodeMetadata();

  const runSearch = useCallback(
    async (q: string) => {
      const seq = ++requestSeqRef.current;
      if (!q.trim()) {
        setResults([]);
        setIsLoading(false);
        setError(null);
        setFallback(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        // The sequence guard below intentionally detects searches superseded while this request is in flight.
        // react-doctor-disable-next-line react-doctor/async-defer-await
        const backend = await rpcSearchCanvas(q, { limit });
        if (seq !== requestSeqRef.current) {
          return;
        }
        if (backend === null) {
          // Fallback to in-memory current-view search
          const memory = searchCurrentView(
            q,
            useCanvasStore.getState().nodes,
            activeViewId,
            views.find((v) => v.id === activeViewId)?.name ?? activeViewId,
            metadataMap
          );
          setResults(memory.slice(0, limit));
          setFallback(true);
        } else {
          // Merge with current-view memory results (dedup by nodeId+matchField)
          const memory = searchCurrentView(
            q,
            useCanvasStore.getState().nodes,
            activeViewId,
            views.find((v) => v.id === activeViewId)?.name ?? activeViewId,
            metadataMap
          );
          setResults(mergeResults(backend, memory).slice(0, limit));
          setFallback(false);
        }
      } catch (err) {
        if (seq !== requestSeqRef.current) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        setResults([]);
      } finally {
        if (seq === requestSeqRef.current) {
          setIsLoading(false);
        }
      }
    },
    [activeViewId, views, limit, metadataMap]
  );

  useEffect(() => {
    if (!query.trim()) {
      runSearch(query);
      return;
    }
    const handle = setTimeout(() => {
      runSearch(query);
    }, debounceMs);
    return () => {
      clearTimeout(handle);
    };
  }, [query, debounceMs, runSearch]);

  return {
    query,
    setQuery,
    results,
    isLoading,
    error,
    fallback,
  };
}

// ---------------------------------------------------------------------------
// In-memory current-view search (fallback / overlay)
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

function indexOfCi(haystack: string, needleLower: string): number {
  if (!haystack) {
    return -1;
  }
  return haystack.toLowerCase().indexOf(needleLower);
}

function nodeKindFor(
  nodeType: string | undefined,
  data?: Record<string, unknown>
): SearchResultKind {
  if (nodeType === 'extension') {
    const canvasTypeId =
      typeof data?.canvasTypeId === 'string' ? data.canvasTypeId : '';
    return searchKindForCanvasType(canvasTypeId);
  }
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
    case 'link':
      return 'link';
    case 'recording':
      return 'recording';
    case 'widget':
      return 'widget';
    default:
      return 'card';
  }
}

interface SearchNodeRef {
  containerId?: string;
  node: Node;
}

function contentReferenceForNode(
  nodeType: string | undefined,
  data: Record<string, unknown>
): SearchContentReference | undefined {
  if (nodeType === 'card' || nodeType === 'note') {
    const noteId = typeof data.noteId === 'string' ? data.noteId : '';
    return noteId ? { kind: 'note', id: noteId } : undefined;
  }
  if (nodeType === 'widget') {
    const widgetId = typeof data.widgetId === 'string' ? data.widgetId : '';
    return widgetId ? { kind: 'widget', id: widgetId } : undefined;
  }
  if (nodeType === 'extension') {
    const instanceId =
      typeof data.instanceId === 'string' ? data.instanceId : '';
    return instanceId ? { kind: 'extension', id: instanceId } : undefined;
  }
  if (
    nodeType === 'image' ||
    nodeType === 'asset' ||
    nodeType === 'recording'
  ) {
    const attachmentId =
      (typeof data.attachmentFile === 'string' && data.attachmentFile) ||
      (typeof data.imageFile === 'string' && data.imageFile) ||
      (typeof data.file === 'string' && data.file) ||
      '';
    return attachmentId ? { kind: 'attachment', id: attachmentId } : undefined;
  }
  return;
}

function targetForSearchNode(
  ref: SearchNodeRef,
  viewId: string,
  content?: SearchContentReference
): SearchResultTarget {
  if (ref.containerId) {
    return {
      type: 'folder-child',
      viewId,
      folderId: ref.containerId,
      childId: ref.node.id,
      placement: 'folder',
      ...(content ? { content } : {}),
    };
  }
  const data = (ref.node.data ?? {}) as Record<string, unknown>;
  const placement =
    data.detached === true
      ? 'detached'
      : ref.node.parentId
        ? 'group'
        : 'top-level';
  return {
    type: 'node',
    viewId,
    nodeId: ref.node.id,
    placement,
    ...(content ? { content } : {}),
  };
}

function searchNodeRefs(nodes: Node[]): SearchNodeRef[] {
  const refs: SearchNodeRef[] = [];
  for (const node of nodes) {
    refs.push({ node });
    if (node.type !== 'folder') {
      continue;
    }
    const data = (node.data ?? {}) as Record<string, unknown>;
    if (!Array.isArray(data.children)) {
      continue;
    }
    for (const rawChild of data.children) {
      if (!rawChild || typeof rawChild !== 'object') {
        continue;
      }
      const child = rawChild as {
        data?: unknown;
        id?: unknown;
        type?: unknown;
      };
      if (typeof child.id !== 'string' || typeof child.type !== 'string') {
        continue;
      }
      const childData =
        child.data &&
        typeof child.data === 'object' &&
        !Array.isArray(child.data)
          ? (child.data as Record<string, unknown>)
          : {};
      refs.push({
        containerId: node.id,
        node: {
          ...node,
          data: childData,
          id: child.id,
          parentId: undefined,
          type: child.type,
        } as Node,
      });
    }
  }
  return refs;
}

function shorten(value: string): string {
  return value.length > 120 ? `${value.slice(0, 120)}…` : value;
}

export function searchCurrentView(
  query: string,
  nodes: Node[],
  viewId: string,
  viewName: string,
  metadataMap: NodeMetadataMap = {}
): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [];
  }
  const out: SearchResult[] = [];
  for (const ref of searchNodeRefs(nodes)) {
    const node = ref.node;
    const data = (node.data ?? {}) as Record<string, unknown>;
    const candidates: Array<{ field: SearchMatchField; value: string }> = [];

    // Metadata lookup applies to every node type: cards key on noteId,
    // non-card nodes on the React Flow node id. Either flavor adds tag /
    // tag-list candidates to the search index.
    const metaKey = (data.noteId as string | undefined) ?? node.id;
    const meta = metadataMap[metaKey];
    if (meta?.tag) {
      candidates.push({ field: 'tag', value: meta.tag });
    }
    if (Array.isArray(meta?.tags)) {
      for (const t of meta.tags) {
        candidates.push({ field: 'tag', value: t });
      }
    }

    switch (node.type) {
      case 'sticky':
        candidates.push({
          field: 'content',
          value: typeof data.content === 'string' ? data.content : '',
        });
        break;
      case 'topic':
        candidates.push({
          field: 'title',
          value: typeof data.title === 'string' ? data.title : '',
        });
        break;
      case 'folder':
        candidates.push({
          field: 'title',
          value: typeof data.title === 'string' ? data.title : '',
        });
        candidates.push({
          field: 'subtitle',
          value: typeof data.subtitle === 'string' ? data.subtitle : '',
        });
        break;
      case 'group':
        candidates.push({
          field: 'label',
          value: typeof data.label === 'string' ? data.label : '',
        });
        break;
      case 'image':
        candidates.push({
          field: 'title',
          value: typeof data.title === 'string' ? data.title : '',
        });
        break;
      case 'asset':
        candidates.push({
          field: 'title',
          value: typeof data.title === 'string' ? data.title : '',
        });
        candidates.push({
          field: 'fileName',
          value: typeof data.fileName === 'string' ? data.fileName : '',
        });
        candidates.push({
          field: 'mimeType',
          value: typeof data.mimeType === 'string' ? data.mimeType : '',
        });
        break;
      case 'link':
        candidates.push({
          field: 'title',
          value: typeof data.title === 'string' ? data.title : '',
        });
        candidates.push({
          field: 'url',
          value: typeof data.url === 'string' ? data.url : '',
        });
        candidates.push({
          field: 'description',
          value: typeof data.description === 'string' ? data.description : '',
        });
        candidates.push({
          field: 'siteName',
          value: typeof data.siteName === 'string' ? data.siteName : '',
        });
        break;
      case 'recording':
        candidates.push({
          field: 'title',
          value: typeof data.title === 'string' ? data.title : '',
        });
        candidates.push({
          field: 'fileName',
          value: typeof data.fileName === 'string' ? data.fileName : '',
        });
        candidates.push({
          field: 'mimeType',
          value: typeof data.mimeType === 'string' ? data.mimeType : '',
        });
        break;
      case 'extension': {
        const presentation =
          data.presentation &&
          typeof data.presentation === 'object' &&
          !Array.isArray(data.presentation)
            ? (data.presentation as Record<string, unknown>)
            : undefined;
        candidates.push({
          field: 'title',
          value:
            typeof data.title === 'string'
              ? data.title
              : typeof presentation?.title === 'string'
                ? presentation.title
                : '',
        });
        candidates.push({
          field: 'subtitle',
          value:
            typeof data.subtitle === 'string'
              ? data.subtitle
              : typeof presentation?.subtitle === 'string'
                ? presentation.subtitle
                : '',
        });
        candidates.push({
          field: 'content',
          value:
            typeof data.plainText === 'string'
              ? data.plainText
              : typeof presentation?.plainText === 'string'
                ? presentation.plainText
                : '',
        });
        break;
      }
      case 'card':
        candidates.push({
          field: 'title',
          value: typeof data.title === 'string' ? data.title : '',
        });
        if (typeof data.content === 'string' && data.content) {
          candidates.push({ field: 'body', value: data.content });
        }
        if (Array.isArray(data.items)) {
          for (const item of data.items as Record<string, unknown>[]) {
            const text = typeof item.text === 'string' ? item.text : '';
            if (text) {
              candidates.push({ field: 'content', value: text });
            }
          }
        }
        break;
      default:
        break;
    }

    for (const { field, value } of candidates) {
      if (!value) {
        continue;
      }
      const idx = indexOfCi(value, q);
      if (idx === -1) {
        continue;
      }
      const base = FIELD_BASE_SCORE[field];
      out.push({
        id: `node:${viewId}:${node.id}:${field}`,
        kind: nodeKindFor(node.type, data),
        viewId,
        viewName,
        nodeId: node.id,
        noteId:
          typeof data.noteId === 'string' ? (data.noteId as string) : undefined,
        target: targetForSearchNode(
          ref,
          viewId,
          contentReferenceForNode(node.type, data)
        ),
        title: shorten(
          typeof data.title === 'string' && data.title ? data.title : value
        ),
        excerpt: shorten(value),
        matchField: field,
        score: idx === 0 ? base + 5 : base,
        position: node.position,
      });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

function mergeResults(
  backend: SearchResult[],
  memory: SearchResult[]
): SearchResult[] {
  const map = new Map<string, SearchResult>();
  for (const r of backend) {
    map.set(r.id, r);
  }
  for (const r of memory) {
    const existing = map.get(r.id);
    if (!existing || existing.score < r.score) {
      map.set(r.id, r);
    }
  }
  return Array.from(map.values()).toSorted((a, b) => b.score - a.score);
}
