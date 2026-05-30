import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  sanitizeForPersistence,
  serializeNodeDataForManifest,
  serializeNodeForManifest,
  stripRuntimeAssetFields,
} from '@/lib/canvasNodeSerialization';

describe('stripRuntimeAssetFields', () => {
  it('removes runtime-only data fields and transient unfurl statuses', () => {
    const result = stripRuntimeAssetFields({
      title: 'Doc',
      isHidden: true,
      isDropTarget: true,
      previewUrl: 'blob:preview',
      thumbnailUrl: 'blob:thumb',
      missing: true,
      unfurlError: 'network',
      unfurlStatus: 'loading',
      attachmentFile: 'attachments/file.pdf',
    });

    expect(result).toEqual({
      title: 'Doc',
      attachmentFile: 'attachments/file.pdf',
    });
  });

  it('keeps terminal unfurl statuses for persistence', () => {
    const result = stripRuntimeAssetFields({
      title: 'Doc',
      unfurlStatus: 'done',
    });

    expect(result).toEqual({
      title: 'Doc',
      unfurlStatus: 'done',
    });
  });
});

describe('serializeNodeDataForManifest', () => {
  it('recursively sanitizes folder child data payloads', () => {
    const result = serializeNodeDataForManifest({
      title: 'Folder',
      children: [
        {
          id: 'child-1',
          type: 'asset',
          data: {
            title: 'Asset',
            previewUrl: 'blob:preview',
            unfurlStatus: 'idle',
            attachmentFile: 'attachments/file.pdf',
          },
        },
      ],
    });

    expect(result).toEqual({
      title: 'Folder',
      children: [
        {
          id: 'child-1',
          type: 'asset',
          data: {
            title: 'Asset',
            attachmentFile: 'attachments/file.pdf',
          },
        },
      ],
    });
  });
});

describe('serializeNodeForManifest', () => {
  it('removes runtime node-level keys before persistence', () => {
    const node = {
      id: 'node-1',
      type: 'card',
      position: { x: 10, y: 20 },
      selected: true,
      dragging: true,
      width: 320,
      height: 180,
      data: {
        title: 'Card',
        previewUrl: 'blob:preview',
        content: 'Keep me',
      },
    } as unknown as Node;

    const result = serializeNodeForManifest(node) as Record<string, unknown>;

    expect(result.selected).toBeUndefined();
    expect(result.dragging).toBeUndefined();
    expect(result.width).toBeUndefined();
    expect(result.height).toBeUndefined();
    expect(result.data).toEqual({ title: 'Card', content: 'Keep me' });
  });
});

function createNode(overrides?: Partial<Node>): Node {
  return {
    id: 'node-1',
    type: 'card',
    position: { x: 10, y: 20 },
    data: { title: 'Test', content: 'Hello' },
    ...overrides,
  } as Node;
}

function createEdge(overrides?: Partial<Edge>): Edge {
  return {
    id: 'edge-1',
    source: 'node-1',
    target: 'node-2',
    ...overrides,
  } as Edge;
}

describe('sanitizeForPersistence', () => {
  it('sanitizes nodes and strips selected flag from edges', () => {
    const nodes = [
      {
        id: 'node-1',
        type: 'card',
        position: { x: 0, y: 0 },
        selected: true,
        data: {
          title: 'Card',
          previewUrl: 'blob:preview',
        },
      } as unknown as Node,
    ];

    const edges = [
      {
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
        selected: true,
        data: { label: 'link' },
      } as unknown as Edge,
    ];

    const result = sanitizeForPersistence(nodes, edges);

    expect(result.nodes[0]).toEqual({
      id: 'node-1',
      type: 'card',
      position: { x: 0, y: 0 },
      data: { title: 'Card' },
    });
    expect(result.edges[0]).toEqual({
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
      data: { label: 'link' },
    });
  });

  it('strips runtime node fields (selected, dragging, measured, etc.)', () => {
    const node = {
      ...createNode(),
      selected: true,
      dragging: true,
      resizing: true,
      measured: { width: 350, height: 450 },
      width: 350,
      height: 450,
    } as Node;

    const result = sanitizeForPersistence([node], []);

    expect(result.nodes[0]).not.toHaveProperty('selected');
    expect(result.nodes[0]).not.toHaveProperty('dragging');
    expect(result.nodes[0]).not.toHaveProperty('resizing');
    expect(result.nodes[0]).not.toHaveProperty('measured');
    expect(result.nodes[0]).not.toHaveProperty('width');
    expect(result.nodes[0]).not.toHaveProperty('height');
  });

  it('strips runtime data fields (isHidden, isDropTarget)', () => {
    const node = createNode({
      data: {
        title: 'Test',
        content: 'Hello',
        isHidden: true,
        isDropTarget: true,
      },
    });

    const result = sanitizeForPersistence([node], []);
    const data = result.nodes[0]?.data as Record<string, unknown>;

    expect(data).not.toHaveProperty('isHidden');
    expect(data).not.toHaveProperty('isDropTarget');
    expect(data.title).toBe('Test');
    expect(data.content).toBe('Hello');
  });

  it('preserves non-runtime node properties', () => {
    const node = createNode({
      style: { width: 350, height: 450 },
      parentId: 'group-1',
    });

    const result = sanitizeForPersistence([node], []);

    expect(result.nodes[0]).toHaveProperty('id', 'node-1');
    expect(result.nodes[0]).toHaveProperty('type', 'card');
    expect(result.nodes[0]).toHaveProperty('position');
    expect(result.nodes[0]).toHaveProperty('style');
    expect(result.nodes[0]).toHaveProperty('parentId', 'group-1');
  });

  it('strips selected from edges', () => {
    const edge = {
      ...createEdge(),
      selected: true,
    } as Edge;

    const result = sanitizeForPersistence([], [edge]);

    expect(result.edges[0]).not.toHaveProperty('selected');
    expect(result.edges[0]).toHaveProperty('id', 'edge-1');
    expect(result.edges[0]).toHaveProperty('source', 'node-1');
    expect(result.edges[0]).toHaveProperty('target', 'node-2');
  });

  it('handles empty arrays', () => {
    const result = sanitizeForPersistence([], []);

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('sanitizes multiple nodes and edges', () => {
    const nodes = [
      { ...createNode({ id: 'a' }), selected: true } as Node,
      { ...createNode({ id: 'b' }), dragging: true } as Node,
    ];
    const edges = [{ ...createEdge({ id: 'e1' }), selected: true } as Edge];

    const result = sanitizeForPersistence(nodes, edges);

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    for (const n of result.nodes) {
      expect(n).not.toHaveProperty('selected');
      expect(n).not.toHaveProperty('dragging');
    }
    expect(result.edges[0]).not.toHaveProperty('selected');
  });

  it('preserves data.detached field for detached notes', () => {
    const node = createNode({
      data: {
        type: 'text',
        title: 'Detached note',
        content: '',
        color: '#FFFFFF',
        detached: true,
      },
    });

    const result = sanitizeForPersistence([node], []);
    const data = result.nodes[0]?.data as Record<string, unknown>;

    expect(data.detached).toBe(true);
    expect(data.title).toBe('Detached note');
  });

  it('strips previewUrl and thumbnailUrl from top-level data', () => {
    const node = createNode({
      type: 'image',
      data: {
        title: 'Pic',
        imageUrl: '',
        imageFile: 'attachments/img_abc.png',
        missing: true,
        thumbnailFile: 'attachments/thumb_abc.jpg',
        previewUrl: 'blob:http://localhost/runtime',
        thumbnailUrl: 'data:image/jpeg;base64,xxx',
        color: '#FFFFFF',
      },
    });

    const result = sanitizeForPersistence([node], []);
    const data = result.nodes[0]?.data as Record<string, unknown>;

    expect(data).not.toHaveProperty('previewUrl');
    expect(data).not.toHaveProperty('thumbnailUrl');
    expect(data).not.toHaveProperty('missing');
    expect(data.imageFile).toBe('attachments/img_abc.png');
    expect(data.thumbnailFile).toBe('attachments/thumb_abc.jpg');
  });

  it('recursively strips runtime fields from folder children', () => {
    const folder = createNode({
      type: 'folder',
      data: {
        title: 'Folder',
        children: [
          {
            id: 'child-1',
            type: 'card',
            data: {
              type: 'text',
              title: 'Note',
              content: '',
              color: '#FFFFFF',
              isHidden: true,
              isDropTarget: true,
              missing: true,
              previewUrl: 'blob:1',
              thumbnailUrl: 'blob:2',
            },
          },
          {
            id: 'child-2',
            type: 'image',
            data: {
              title: 'Pic',
              imageUrl: '',
              color: '#FFFFFF',
              isHidden: true,
              previewUrl: 'data:image/png;base64,zzz',
              thumbnailUrl: 'data:image/jpeg;base64,yyy',
            },
          },
        ],
      },
    });

    const result = sanitizeForPersistence([folder], []);
    const data = result.nodes[0]?.data as Record<string, unknown>;
    const children = data.children as Array<{
      id: string;
      data: Record<string, unknown>;
    }>;

    expect(children).toHaveLength(2);
    for (const child of children) {
      expect(child.data).not.toHaveProperty('isHidden');
      expect(child.data).not.toHaveProperty('isDropTarget');
      expect(child.data).not.toHaveProperty('previewUrl');
      expect(child.data).not.toHaveProperty('thumbnailUrl');
      expect(child.data).not.toHaveProperty('missing');
    }
    expect(children[0]?.data.title).toBe('Note');
    expect(children[1]?.data.title).toBe('Pic');
  });

  it('preserves folder-child non-runtime metadata on recursion', () => {
    const folder = createNode({
      type: 'folder',
      data: {
        title: 'Folder',
        children: [
          {
            id: 'child-1',
            noteId: 'note-1',
            type: 'card',
            data: {
              type: 'text',
              title: 'Keep me',
              content: 'body',
              color: '#FFFFFF',
            },
          },
        ],
      },
    });

    const result = sanitizeForPersistence([folder], []);
    const data = result.nodes[0]?.data as Record<string, unknown>;
    const children = data.children as Array<{
      id: string;
      noteId?: string;
      type?: string;
      data: Record<string, unknown>;
    }>;

    expect(children[0]?.id).toBe('child-1');
    expect(children[0]?.noteId).toBe('note-1');
    expect(children[0]?.type).toBe('card');
    expect(children[0]?.data.content).toBe('body');
  });

  it('leaves non-array data.children untouched (defensive)', () => {
    const folder = createNode({
      type: 'folder',
      data: {
        title: 'Folder',
        children: 'unexpected-shape',
      },
    });

    const result = sanitizeForPersistence([folder], []);
    const data = result.nodes[0]?.data as Record<string, unknown>;
    expect(data.children).toBe('unexpected-shape');
  });

  it('drops transient unfurl status / error from link nodes', () => {
    const node = createNode({
      type: 'link',
      data: {
        url: 'https://example.com/',
        title: 'Loading…',
        color: '#FFFFFF',
        unfurlStatus: 'loading',
        unfurlError: 'temporary',
      },
    });

    const result = sanitizeForPersistence([node], []);
    const data = result.nodes[0]?.data as Record<string, unknown>;

    expect(data).not.toHaveProperty('unfurlStatus');
    expect(data).not.toHaveProperty('unfurlError');
    expect(data.url).toBe('https://example.com/');
  });

  it('preserves terminal unfurl statuses (ready / failed)', () => {
    const ready = createNode({
      id: 'ready',
      type: 'link',
      data: {
        url: 'https://example.com/',
        title: 'OK',
        color: '#FFFFFF',
        unfurlStatus: 'ready',
      },
    });
    const failed = createNode({
      id: 'failed',
      type: 'link',
      data: {
        url: 'https://example.com/',
        title: 'OK',
        color: '#FFFFFF',
        unfurlStatus: 'failed',
      },
    });

    const result = sanitizeForPersistence([ready, failed], []);
    const readyData = result.nodes[0]?.data as Record<string, unknown>;
    const failedData = result.nodes[1]?.data as Record<string, unknown>;

    expect(readyData.unfurlStatus).toBe('ready');
    expect(failedData.unfurlStatus).toBe('failed');
  });
});
