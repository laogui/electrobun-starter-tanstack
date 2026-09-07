import type {
  SearchContentReference,
  SearchResultKind,
  SearchResultTarget,
} from '../shared/searchTypes';

export const REACHABILITY_VIEW_ID = 'reachability-view';
export const REACHABILITY_VIEW_NAME = 'Reachability Matrix';
export const REACHABILITY_GROUP_ID = 'reachability-group';
export const REACHABILITY_FOLDER_ID = 'reachability-folder';
export const REACHABILITY_WIDGET_ID = 'widget_reachability_shared';
export const REACHABILITY_EXTENSION_ID = 'extinst_reachability_shared';
export const REACHABILITY_WIDGET_MARKER = 'reachability-shared-widget';
export const REACHABILITY_EXTENSION_MARKER = 'reachability-shared-extension';

export type ReachabilityLocation =
  | 'top-level'
  | 'group'
  | 'folder'
  | 'detached';

export interface ReachabilityCase {
  backend: boolean;
  content?: SearchContentReference;
  data: Record<string, unknown>;
  expectedKind?: SearchResultKind;
  fallback: boolean;
  folderId?: string;
  id: string;
  location: ReachabilityLocation;
  nodeId: string;
  nodeType: string;
  parentId?: string;
  query: string;
}

function marker(id: string): string {
  return `reachability-${id}`;
}

function noteData(id: string): Record<string, unknown> {
  return {
    file: `content/reachability-${id}.md`,
    noteId: `note_reachability_${id}`,
    title: marker(id),
  };
}

function noteCase(
  id: string,
  location: ReachabilityLocation,
  options: { detached?: boolean; folderId?: string; parentId?: string } = {}
): ReachabilityCase {
  const nodeId = `reachability-${id}`;
  return {
    backend: true,
    content: { kind: 'note', id: `note_reachability_${id}` },
    data: {
      ...noteData(id),
      ...(options.detached ? { detached: true } : {}),
    },
    expectedKind: 'card',
    fallback: true,
    ...(options.folderId ? { folderId: options.folderId } : {}),
    id,
    location,
    nodeId,
    nodeType: 'card',
    ...(options.parentId ? { parentId: options.parentId } : {}),
    query: marker(id),
  };
}

function mediaCase(
  id: string,
  nodeType: 'asset' | 'image' | 'link' | 'recording',
  location: ReachabilityLocation,
  data: Record<string, unknown>,
  options: { folderId?: string; parentId?: string; detached?: boolean } = {}
): ReachabilityCase {
  const nodeId = `reachability-${id}`;
  return {
    backend: true,
    content:
      nodeType === 'link'
        ? undefined
        : { kind: 'attachment', id: `attachments/${nodeId}.bin` },
    data: {
      ...data,
      ...(options.detached ? { detached: true } : {}),
    },
    expectedKind: nodeType,
    fallback: true,
    ...(options.folderId ? { folderId: options.folderId } : {}),
    id,
    location,
    nodeId,
    nodeType,
    ...(options.parentId ? { parentId: options.parentId } : {}),
    query: marker(id),
  };
}

function widgetCase(
  id: string,
  location: ReachabilityLocation,
  options: { folderId?: string; parentId?: string } = {}
): ReachabilityCase {
  const nodeId = `reachability-${id}`;
  return {
    backend: true,
    content: { kind: 'widget', id: REACHABILITY_WIDGET_ID },
    data: {
      kind: 'checklist',
      widgetId: REACHABILITY_WIDGET_ID,
    },
    expectedKind: 'widget',
    fallback: false,
    ...(options.folderId ? { folderId: options.folderId } : {}),
    id,
    location,
    nodeId,
    nodeType: 'widget',
    ...(options.parentId ? { parentId: options.parentId } : {}),
    query: REACHABILITY_WIDGET_MARKER,
  };
}

function extensionCase(
  id: string,
  location: ReachabilityLocation,
  options: { folderId?: string; parentId?: string } = {}
): ReachabilityCase {
  const nodeId = `reachability-${id}`;
  return {
    backend: true,
    content: { kind: 'extension', id: REACHABILITY_EXTENSION_ID },
    data: {
      canvasTypeId: 'ghostboard.web/link',
      instanceId: REACHABILITY_EXTENSION_ID,
      presentation: {
        plainText: REACHABILITY_EXTENSION_MARKER,
        subtitle: 'Reachability extension',
        title: REACHABILITY_EXTENSION_MARKER,
      },
    },
    expectedKind: 'link',
    fallback: true,
    ...(options.folderId ? { folderId: options.folderId } : {}),
    id,
    location,
    nodeId,
    nodeType: 'extension',
    ...(options.parentId ? { parentId: options.parentId } : {}),
    query: REACHABILITY_EXTENSION_MARKER,
  };
}

export const REACHABILITY_CASES: readonly ReachabilityCase[] = [
  noteCase('top-note', 'top-level'),
  noteCase('group-note', 'group', { parentId: REACHABILITY_GROUP_ID }),
  noteCase('folder-note', 'folder', { folderId: REACHABILITY_FOLDER_ID }),
  noteCase('detached-note', 'detached', { detached: true }),
  {
    backend: true,
    data: { content: marker('top-sticky') },
    expectedKind: 'sticky',
    fallback: true,
    id: 'top-sticky',
    location: 'top-level',
    nodeId: 'reachability-top-sticky',
    nodeType: 'sticky',
    query: marker('top-sticky'),
  },
  {
    backend: true,
    content: {
      kind: 'attachment',
      id: 'attachments/reachability-top-image.bin',
    },
    data: {
      imageFile: 'attachments/reachability-top-image.bin',
      title: marker('top-image'),
    },
    expectedKind: 'image',
    fallback: true,
    id: 'top-image',
    location: 'top-level',
    nodeId: 'reachability-top-image',
    nodeType: 'image',
    query: marker('top-image'),
  },
  {
    backend: true,
    content: {
      kind: 'attachment',
      id: 'attachments/reachability-top-asset.bin',
    },
    data: {
      attachmentFile: 'attachments/reachability-top-asset.bin',
      fileName: 'reachability-top-asset.pdf',
      mimeType: 'application/pdf',
      title: marker('top-asset'),
    },
    expectedKind: 'asset',
    fallback: true,
    id: 'top-asset',
    location: 'top-level',
    nodeId: 'reachability-top-asset',
    nodeType: 'asset',
    query: marker('top-asset'),
  },
  mediaCase('top-link', 'link', 'top-level', {
    title: marker('top-link'),
    url: 'https://example.com/reachability-top-link',
  }),
  mediaCase('top-recording', 'recording', 'top-level', {
    attachmentFile: 'attachments/reachability-top-recording.bin',
    fileName: 'reachability-top-recording.m4a',
    mimeType: 'audio/mp4',
    recordingNumber: 1,
    title: marker('top-recording'),
  }),
  widgetCase('top-widget', 'top-level'),
  widgetCase('group-widget', 'group', { parentId: REACHABILITY_GROUP_ID }),
  widgetCase('folder-widget-legacy', 'folder', {
    folderId: REACHABILITY_FOLDER_ID,
  }),
  extensionCase('top-extension', 'top-level'),
  extensionCase('group-extension', 'group', {
    parentId: REACHABILITY_GROUP_ID,
  }),
  extensionCase('folder-extension-legacy', 'folder', {
    folderId: REACHABILITY_FOLDER_ID,
  }),
  mediaCase(
    'folder-image',
    'image',
    'folder',
    {
      imageFile: 'attachments/reachability-folder-image.bin',
      title: marker('folder-image'),
    },
    { folderId: REACHABILITY_FOLDER_ID }
  ),
  mediaCase(
    'folder-asset',
    'asset',
    'folder',
    {
      attachmentFile: 'attachments/reachability-folder-asset.bin',
      fileName: 'reachability-folder-asset.pdf',
      mimeType: 'application/pdf',
      title: marker('folder-asset'),
    },
    { folderId: REACHABILITY_FOLDER_ID }
  ),
  mediaCase(
    'folder-link',
    'link',
    'folder',
    {
      title: marker('folder-link'),
      url: 'https://example.com/reachability-folder-link',
    },
    { folderId: REACHABILITY_FOLDER_ID }
  ),
  mediaCase(
    'folder-recording',
    'recording',
    'folder',
    {
      attachmentFile: 'attachments/reachability-folder-recording.bin',
      fileName: 'reachability-folder-recording.m4a',
      mimeType: 'audio/mp4',
      recordingNumber: 2,
      title: marker('folder-recording'),
    },
    { folderId: REACHABILITY_FOLDER_ID }
  ),
  mediaCase(
    'detached-image',
    'image',
    'detached',
    {
      imageFile: 'attachments/reachability-detached-image.bin',
      title: marker('detached-image'),
    },
    { detached: true }
  ),
  mediaCase(
    'detached-asset',
    'asset',
    'detached',
    {
      attachmentFile: 'attachments/reachability-detached-asset.bin',
      fileName: 'reachability-detached-asset.pdf',
      mimeType: 'application/pdf',
      title: marker('detached-asset'),
    },
    { detached: true }
  ),
  mediaCase(
    'detached-link',
    'link',
    'detached',
    {
      title: marker('detached-link'),
      url: 'https://example.com/reachability-detached-link',
    },
    { detached: true }
  ),
  {
    backend: true,
    data: {
      children: [],
      subtitle: 'Reachability container',
      title: marker('top-folder'),
    },
    expectedKind: 'folder',
    fallback: true,
    id: 'top-folder',
    location: 'top-level',
    nodeId: REACHABILITY_FOLDER_ID,
    nodeType: 'folder',
    query: marker('top-folder'),
  },
  {
    backend: true,
    data: { label: marker('top-group') },
    expectedKind: 'group',
    fallback: true,
    id: 'top-group',
    location: 'top-level',
    nodeId: REACHABILITY_GROUP_ID,
    nodeType: 'group',
    query: marker('top-group'),
  },
];

export interface UnlinkedReachabilityCase {
  file: string;
  id: string;
  noteId: string | null;
  query: string;
  recovery: 'browse' | 'place';
  title: string;
  type: 'extension' | 'markdown' | 'sidecar' | 'widget';
}

export const UNLINKED_REACHABILITY_CASES: readonly UnlinkedReachabilityCase[] =
  [
    {
      file: 'content/reachability-unlinked.md',
      id: 'unlinked-markdown',
      noteId: 'note_reachability_unlinked',
      query: 'reachability-unlinked-markdown',
      recovery: 'place',
      title: 'Reachability unlinked note',
      type: 'markdown',
    },
    {
      file: 'content/.ghostboard/blocknote/note_reachability_sidecar.json',
      id: 'unlinked-sidecar',
      noteId: 'note_reachability_sidecar',
      query: 'reachability-unlinked-sidecar',
      recovery: 'place',
      title: 'Reachability sidecar note',
      type: 'sidecar',
    },
    {
      file: 'content/reachability-no-id.md',
      id: 'unlinked-no-id',
      noteId: null,
      query: 'reachability-unlinked-no-id',
      recovery: 'browse',
      title: 'Reachability unidentified note',
      type: 'markdown',
    },
    {
      file: '.ghostboard/widgets/widget_reachability_orphan.json',
      id: 'unlinked-widget',
      noteId: 'widget_reachability_orphan',
      query: 'reachability-unlinked-widget',
      recovery: 'browse',
      title: 'Reachability legacy widget',
      type: 'widget',
    },
    {
      file: '.ghostboard/extension-instances/extinst_reachability_orphan.json',
      id: 'unlinked-extension',
      noteId: 'extinst_reachability_orphan',
      query: 'reachability-unlinked-extension',
      recovery: 'browse',
      title: 'Reachability extension instance',
      type: 'extension',
    },
  ];

export const REACHABILITY_NOT_APPLICABLE = [
  {
    location: 'folder',
    reason:
      'New Sticky nodes cannot enter Folder; legacy records remain browseable only.',
    type: 'sticky',
  },
  {
    location: 'folder',
    reason:
      'New Productivity Widget nodes cannot enter Folder; legacy Widget children remain searchable.',
    type: 'widget',
  },
  {
    location: 'folder',
    reason:
      'New Productivity Extension nodes cannot enter Folder; legacy Extension children remain searchable.',
    type: 'extension',
  },
  {
    location: 'detached',
    reason:
      'Recording is not detachable; it stays on-canvas and remains searchable there.',
    type: 'recording',
  },
] as const;

export function targetForReachabilityCase(
  entry: ReachabilityCase
): SearchResultTarget {
  if (entry.location === 'folder') {
    return {
      childId: entry.nodeId,
      folderId: entry.folderId ?? REACHABILITY_FOLDER_ID,
      placement: 'folder',
      type: 'folder-child',
      viewId: REACHABILITY_VIEW_ID,
      ...(entry.content ? { content: entry.content } : {}),
    };
  }
  return {
    nodeId: entry.nodeId,
    placement: entry.location,
    type: 'node',
    viewId: REACHABILITY_VIEW_ID,
    ...(entry.content ? { content: entry.content } : {}),
  };
}
