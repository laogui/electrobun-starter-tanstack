import type { ExtensionSearchMetadata } from './extensions/protocol';

/** Where a searchable item lives relative to its canvas. */
export type SearchTargetPlacement =
  | 'top-level'
  | 'group'
  | 'folder'
  | 'detached'
  | 'unlinked';

/** Stable content entities that can be referenced by more than one canvas node. */
export type SearchContentKind = 'note' | 'extension' | 'attachment';

export interface SearchContentReference {
  id: string;
  kind: SearchContentKind;
}

/**
 * Serializable location contract shared by Bun search and renderer navigation.
 * A Folder child is deliberately not represented as a top-level node: callers
 * must use `folderId` + `childId` to enter the owning container first.
 */
export type SearchResultTarget =
  | {
      type: 'view';
      viewId: string;
    }
  | {
      edgeId: string;
      type: 'edge';
      viewId: string;
    }
  | {
      content?: SearchContentReference;
      nodeId: string;
      placement: 'top-level' | 'group' | 'detached';
      type: 'node';
      viewId: string;
    }
  | {
      childId: string;
      content?: SearchContentReference;
      folderId: string;
      placement: 'folder';
      type: 'folder-child';
      viewId: string;
    }
  | {
      content: SearchContentReference;
      placement: 'unlinked';
      type: 'content';
    };

export type SearchResultKind =
  | 'note'
  | 'sticky'
  | 'topic'
  | 'folder'
  | 'group'
  | 'image'
  | 'card'
  | 'asset'
  | 'link'
  | 'edge'
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
  extension?: ExtensionSearchMetadata;
  id: string;
  kind: SearchResultKind;
  matchField: SearchMatchField;
  nodeId?: string;
  noteId?: string;
  position?: { x: number; y: number };
  score: number;
  target?: SearchResultTarget;
  title: string;
  viewId: string;
  viewName: string;
}
