import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import type { WidgetRecord } from '@/lib/widgetTypes';

import { buildLibrary } from './useLibraryData';

function makeNode(
  id: string,
  type: string,
  data: Record<string, unknown> = {}
): Node {
  return { id, type, position: { x: 0, y: 0 }, data } as unknown as Node;
}

describe('buildLibrary', () => {
  it('groups folder children, ungrouped focusable nodes, and detached separately', () => {
    const nodes: Node[] = [
      makeNode('folder-1', 'folder', {
        title: 'Project',
        children: [
          { id: 'c1', type: 'card', data: { title: 'Roadmap' } },
          { id: 'c2', type: 'sticky', data: { content: 'ignored' } },
          { id: 'c3', type: 'image', data: { title: 'Logo' } },
        ],
      }),
      makeNode('card-top', 'card', { title: 'Top card' }),
      makeNode('detached-1', 'card', { title: 'Free note', detached: true }),
      makeNode('sticky-top', 'sticky', { content: 'should not appear' }),
    ];

    const { groups, totalItems } = buildLibrary(nodes, '', 'name');

    expect(groups.map((g) => g.kind)).toEqual([
      'folder',
      'ungrouped',
      'detached',
    ]);
    expect(groups[0]!.items.map((i) => i.id)).toEqual([
      'child:folder-1:c3',
      'child:folder-1:c1',
    ]);
    expect(groups[1]!.items.map((i) => i.id)).toEqual(['node:card-top']);
    expect(groups[2]!.items.map((i) => i.id)).toEqual(['node:detached-1']);
    expect(totalItems).toBe(4);
  });

  it('filters by query (case-insensitive title match) and hides empty groups', () => {
    const nodes: Node[] = [
      makeNode('folder-1', 'folder', {
        title: 'Folder A',
        children: [
          { id: 'c1', type: 'card', data: { title: 'Apple notes' } },
          { id: 'c2', type: 'card', data: { title: 'Banana plan' } },
        ],
      }),
      makeNode('card-top', 'card', { title: 'Apricot' }),
    ];

    const { groups, totalItems } = buildLibrary(nodes, 'app', 'name');

    expect(totalItems).toBe(1);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.kind).toBe('folder');
    expect(groups[0]!.items.map((i) => i.title)).toEqual(['Apple notes']);
  });

  it('sorts by updatedAt descending when sort is "recent"', () => {
    const nodes: Node[] = [
      makeNode('a', 'card', { title: 'A', updatedAt: 100 }),
      makeNode('b', 'card', { title: 'B', updatedAt: 300 }),
      makeNode('c', 'card', { title: 'C', updatedAt: 200 }),
    ];

    const { groups } = buildLibrary(nodes, '', 'recent');

    expect(groups[0]!.items.map((i) => i.title)).toEqual(['B', 'C', 'A']);
  });

  it('includes detached asset and link entries', () => {
    const nodes: Node[] = [
      makeNode('asset-1', 'asset', {
        fileName: 'doc.pdf',
        detached: true,
      }),
      makeNode('link-1', 'link', {
        url: 'https://example.com',
        detached: true,
      }),
    ];
    const { groups, totalItems } = buildLibrary(nodes, '', 'name');
    expect(totalItems).toBe(2);
    expect(groups[0]?.kind).toBe('detached');
    expect(groups[0]?.items.map((item) => item.title)).toEqual([
      'doc.pdf',
      'https://example.com',
    ]);
  });

  it('falls back to fileName / url for empty titles on asset / link', () => {
    const nodes: Node[] = [
      makeNode('asset-1', 'asset', { fileName: 'spec.pdf' }),
      makeNode('link-1', 'link', { url: 'https://example.com' }),
    ];
    const { groups } = buildLibrary(nodes, '', 'name');
    const titles = groups[0]!.items.map((i) => i.title);
    expect(titles).toContain('spec.pdf');
    expect(titles).toContain('https://example.com');
  });

  it('hydrates widget titles and checklist excerpts from widget records', () => {
    const widget = {
      schema: 'ghostboard-widget/v1',
      id: 'widget_check',
      kind: 'checklist',
      title: 'Launch list',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T01:30:00.000Z',
      data: {
        items: [
          { id: 'item_1', text: 'Draft release notes', checked: false },
          { id: 'item_2', text: 'Ship build', checked: true },
        ],
      },
    } satisfies WidgetRecord;
    const nodes: Node[] = [
      makeNode('widget-1', 'widget', {
        widgetId: 'widget_check',
        kind: 'checklist',
      }),
    ];

    const { groups } = buildLibrary(nodes, 'release', 'recent', {
      widget_check: widget,
    });

    expect(groups[0]?.items[0]).toMatchObject({
      type: 'widget',
      title: 'Launch list',
      data: {
        kind: 'checklist',
        previewExcerpt: 'Draft release notes\nShip build',
        title: 'Launch list',
        updatedAt: new Date('2026-07-08T01:30:00.000Z').getTime(),
      },
    });
  });
});
