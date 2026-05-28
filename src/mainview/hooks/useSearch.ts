import type { Node } from '@xyflow/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { rpcSearchCanvas } from '@/lib/rpc';
import type {
  SearchMatchField,
  SearchResult,
  SearchResultKind,
} from '@/lib/searchTypes';
import { useCanvasStore } from '@/store/canvasStore';

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
            views.find((v) => v.id === activeViewId)?.name ?? activeViewId
          );
          setResults(memory.slice(0, limit));
          setFallback(true);
        } else {
          // Merge with current-view memory results (dedup by nodeId+matchField)
          const memory = searchCurrentView(
            q,
            useCanvasStore.getState().nodes,
            activeViewId,
            views.find((v) => v.id === activeViewId)?.name ?? activeViewId
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
    [activeViewId, views, limit]
  );

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      setFallback(false);
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

function nodeKindFor(nodeType: string | undefined): SearchResultKind {
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
    case 'link':
      return 'link';
    default:
      return 'card';
  }
}

function shorten(value: string): string {
  return value.length > 120 ? `${value.slice(0, 120)}…` : value;
}

export function searchCurrentView(
  query: string,
  nodes: Node[],
  viewId: string,
  viewName: string
): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [];
  }
  const out: SearchResult[] = [];
  for (const node of nodes) {
    const data = (node.data ?? {}) as Record<string, unknown>;
    const candidates: Array<{ field: SearchMatchField; value: string }> = [];

    switch (node.type) {
      case 'sticky':
        candidates.push({
          field: 'content',
          value: typeof data.content === 'string' ? data.content : '',
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
      case 'card':
        candidates.push({
          field: 'title',
          value: typeof data.title === 'string' ? data.title : '',
        });
        if (typeof data.content === 'string' && data.content) {
          candidates.push({ field: 'body', value: data.content });
        }
        if (typeof data.tag === 'string' && data.tag) {
          candidates.push({ field: 'tag', value: data.tag });
        }
        if (Array.isArray(data.tags)) {
          for (const t of data.tags as unknown[]) {
            if (typeof t === 'string' && t) {
              candidates.push({ field: 'tag', value: t });
            }
          }
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
        kind: nodeKindFor(node.type),
        viewId,
        viewName,
        nodeId: node.id,
        noteId:
          typeof data.noteId === 'string' ? (data.noteId as string) : undefined,
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
  return [...map.values()].sort((a, b) => b.score - a.score);
}
