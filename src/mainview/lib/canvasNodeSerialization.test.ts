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
});
