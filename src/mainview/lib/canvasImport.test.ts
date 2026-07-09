import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import type { CanvasExportDocument } from '@/lib/canvasExport';
import {
  buildImportedCanvasPayload,
  collectWidgetIdsFromCanvasExport,
} from '@/lib/canvasImport';

function makeDocument(
  nodes: Record<string, unknown>[],
  edges: Record<string, unknown>[] = [],
  widgets?: Record<string, unknown>
): CanvasExportDocument {
  return {
    schema: 'ghostboard-canvas-export/v1',
    exportedAt: '2026-07-08T00:00:00.000Z',
    nodes,
    edges,
    ...(widgets ? { widgets } : {}),
  } as CanvasExportDocument;
}

describe('collectWidgetIdsFromCanvasExport', () => {
  it('collects top-level and folder-child widget ids', () => {
    const doc = makeDocument([
      { id: 'n1', type: 'widget', data: { widgetId: 'w_top' } },
      {
        id: 'n2',
        type: 'folder',
        data: {
          children: [
            { id: 'c1', type: 'widget', data: { widgetId: 'w_child' } },
            { id: 'c2', type: 'card', data: {} },
          ],
        },
      },
    ]);
    expect(collectWidgetIdsFromCanvasExport(doc).sort()).toEqual([
      'w_child',
      'w_top',
    ]);
  });
});

describe('buildImportedCanvasPayload', () => {
  const anchorCenter = { x: 0, y: 0 };

  it('remaps widget ids for top-level widget nodes using the id map', () => {
    const doc = makeDocument([
      {
        id: 'n1',
        type: 'widget',
        data: { widgetId: 'w_top', kind: 'checklist' },
      },
    ]);
    const map = new Map([['w_top', 'w_local']]);
    const { nodes } = buildImportedCanvasPayload(
      doc,
      anchorCenter,
      [] as Node[],
      [] as Edge[],
      map
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.data).toMatchObject({ widgetId: 'w_local' });
  });

  it('remaps widget ids nested in folder children', () => {
    const doc = makeDocument([
      {
        id: 'n1',
        type: 'folder',
        position: { x: 0, y: 0 },
        data: {
          children: [
            {
              id: 'c1',
              type: 'widget',
              data: { widgetId: 'w_child', kind: 'checklist' },
            },
          ],
        },
      },
    ]);
    const map = new Map([['w_child', 'w_child_local']]);
    const { nodes } = buildImportedCanvasPayload(
      doc,
      anchorCenter,
      [] as Node[],
      [] as Edge[],
      map
    );
    const folder = nodes[0];
    const child = (
      folder?.data as { children?: Array<{ data: { widgetId: string } }> }
    ).children?.[0];
    expect(child?.data.widgetId).toBe('w_child_local');
  });

  it('drops top-level widget nodes whose id is not in the map (missing widgets map)', () => {
    const doc = makeDocument([
      { id: 'n1', type: 'widget', data: { widgetId: 'w_foreign' } },
      { id: 'n2', type: 'card', position: { x: 0, y: 0 }, data: {} },
    ]);
    // No entry for w_foreign -> node must be dropped, never imported with the
    // foreign id.
    const map = new Map<string, string>();
    const { nodes } = buildImportedCanvasPayload(
      doc,
      anchorCenter,
      [] as Node[],
      [] as Edge[],
      map
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.type).toBe('card');
    const widgetIds = nodes
      .filter((n) => n.type === 'widget')
      .map((n) => (n.data as { widgetId?: string }).widgetId);
    expect(widgetIds).toEqual([]);
  });

  it('drops folder-child widgets whose id is not in the map but keeps the folder', () => {
    const doc = makeDocument([
      {
        id: 'n1',
        type: 'folder',
        position: { x: 0, y: 0 },
        data: {
          children: [
            {
              id: 'c1',
              type: 'widget',
              data: { widgetId: 'w_foreign' },
            },
            {
              id: 'c2',
              type: 'card',
              data: {},
            },
          ],
        },
      },
    ]);
    const map = new Map<string, string>();
    const { nodes } = buildImportedCanvasPayload(
      doc,
      anchorCenter,
      [] as Node[],
      [] as Edge[],
      map
    );
    expect(nodes).toHaveLength(1);
    const children = (nodes[0]?.data as { children?: Array<{ type: string }> })
      .children;
    expect(children).toHaveLength(1);
    expect(children?.[0]?.type).toBe('card');
  });

  it('drops edges that reference a dropped widget node', () => {
    const doc = makeDocument(
      [
        { id: 'n1', type: 'widget', data: { widgetId: 'w_foreign' } },
        { id: 'n2', type: 'card', position: { x: 0, y: 0 }, data: {} },
      ],
      [{ id: 'e1', source: 'n1', target: 'n2' }]
    );
    const map = new Map<string, string>();
    const { nodes, edges } = buildImportedCanvasPayload(
      doc,
      anchorCenter,
      [] as Node[],
      [] as Edge[],
      map
    );
    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(0);
  });
});
