/**
 * Search result types shared between the Bun search module and the renderer.
 * Mirror of the types in `src/bun/search.ts`.
 */

export type SearchResultKind =
  | 'note'
  | 'sticky'
  | 'folder'
  | 'group'
  | 'image'
  | 'card'
  | 'asset'
  | 'link'
  | 'recording'
  | 'edge'
  | 'widget'
  | 'extension'
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
  widgetId?: string;
  widgetKind?: 'checklist' | 'pomodoro' | 'reminder';
}
