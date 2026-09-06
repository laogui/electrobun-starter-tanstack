import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  buildSelectionContext,
  hasSummarizableSelection,
  nodeToAIContext,
} from './buildAIContext';

function makeNode(overrides: Partial<Node> & { id: string }): Node {
  return {
    type: 'card',
    position: { x: 10, y: 20 },
    data: {},
    ...overrides,
  } as Node;
}

describe('nodeToAIContext', () => {
  it('extracts title, content, tags and noteId from cards', () => {
    const context = nodeToAIContext(
      makeNode({
        id: 'node-1',
        data: {
          type: 'text',
          title: 'Meeting notes',
          content: 'Discuss launch',
          tags: ['work'],
          noteId: 'note-9',
        },
      })
    );
    expect(context).toMatchObject({
      id: 'node-1',
      nodeType: 'card',
      title: 'Meeting notes',
      content: 'Discuss launch',
      tags: ['work'],
      noteId: 'note-9',
      position: { x: 10, y: 20 },
    });
  });

  it('falls back to previewExcerpt when card content is missing', () => {
    const context = nodeToAIContext(
      makeNode({
        id: 'node-2',
        data: { title: 'T', previewExcerpt: 'Excerpt text' },
      })
    );
    expect(context?.content).toBe('Excerpt text');
  });

  it('skips hidden nodes and nodes without text', () => {
    expect(
      nodeToAIContext(
        makeNode({ id: 'h', data: { title: 'Hidden', isHidden: true } })
      )
    ).toBeNull();
    expect(nodeToAIContext(makeNode({ id: 'e', data: {} }))).toBeNull();
    expect(
      nodeToAIContext(makeNode({ id: 'w', type: 'widget', data: {} }))
    ).toBeNull();
  });

  it('reads sticky content and group labels', () => {
    expect(
      nodeToAIContext(
        makeNode({ id: 's', type: 'sticky', data: { content: 'Idea' } })
      )?.content
    ).toBe('Idea');
    expect(
      nodeToAIContext(
        makeNode({ id: 'g', type: 'group', data: { label: 'Phase 1' } })
      )?.title
    ).toBe('Phase 1');
  });

  it('carries parentId and size when present', () => {
    const context = nodeToAIContext(
      makeNode({
        id: 'child',
        parentId: 'group-1',
        style: { width: 300, height: 400 },
        data: { title: 'Inside' },
      })
    );
    expect(context?.parentId).toBe('group-1');
    expect(context?.size).toEqual({ width: 300, height: 400 });
  });
});

describe('buildSelectionContext', () => {
  it('keeps only selected, summarizable nodes', () => {
    const nodes = [
      makeNode({ id: 'a', selected: true, data: { title: 'A' } }),
      makeNode({ id: 'b', selected: false, data: { title: 'B' } }),
      makeNode({ id: 'c', selected: true, data: {} }),
      makeNode({
        id: 'd',
        type: 'sticky',
        selected: true,
        data: { content: 'D' },
      }),
    ];
    const context = buildSelectionContext(nodes);
    expect(context.map((entry) => entry.id)).toEqual(['a', 'd']);
  });

  it('serializes selected group children with absolute canvas positions', () => {
    const context = buildSelectionContext([
      makeNode({
        id: 'group-1',
        type: 'group',
        position: { x: 1000, y: 800 },
        style: { width: 500, height: 300 },
        data: { label: 'Launch' },
      }),
      makeNode({
        id: 'child-1',
        parentId: 'group-1',
        position: { x: 20, y: 30 },
        selected: true,
        style: { width: 300, height: 400 },
        data: { title: 'Kickoff' },
      }),
    ]);

    expect(context).toEqual([
      expect.objectContaining({
        id: 'child-1',
        position: { x: 1020, y: 830 },
        size: { width: 300, height: 400 },
      }),
    ]);
  });
});

describe('hasSummarizableSelection', () => {
  it('is true only when a selected node carries text', () => {
    expect(
      hasSummarizableSelection([
        makeNode({ id: 'a', selected: true, data: { title: 'A' } }),
      ])
    ).toBe(true);
    expect(
      hasSummarizableSelection([
        makeNode({ id: 'a', selected: false, data: { title: 'A' } }),
      ])
    ).toBe(false);
    expect(
      hasSummarizableSelection([
        makeNode({ id: 'a', selected: true, data: {} }),
      ])
    ).toBe(false);
  });
});

describe('extension nodes', () => {
  const linkNode = makeNode({
    id: 'ext-link-1',
    type: 'extension',
    selected: true,
    data: {
      canvasTypeId: 'ghostboard.web/link',
      instanceId: 'extinst_link1',
    },
  });

  const linkRecord = {
    schema: 'ghostboard-extension-instance/v1' as const,
    id: 'extinst_link1',
    canvasTypeId: 'ghostboard.web/link',
    appVersion: '1.0.0',
    dataVersion: 1,
    revision: 1,
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:01:00.000Z',
    state: { url: 'https://example.com', title: 'Example', color: '#FFFFFF' },
    presentation: {
      title: 'Example',
      plainText: 'Example\nhttps://example.com',
    },
  };

  it('uses presentation title and plainText when a record is present', () => {
    const context = nodeToAIContext(linkNode, undefined, {
      extinst_link1: linkRecord,
    });
    expect(context).toMatchObject({
      id: 'ext-link-1',
      nodeType: 'extension',
      title: 'Example',
      content: 'Example\nhttps://example.com',
    });
  });

  it('skips extension nodes when the instance record is missing', () => {
    expect(nodeToAIContext(linkNode, undefined, {})).toBeNull();
    expect(nodeToAIContext(linkNode)).toBeNull();
  });

  it('still summarizes from last persisted presentation when the type is disabled', () => {
    // Enablement is a host UI concern; AI context only reads presentation.
    const context = nodeToAIContext(linkNode, undefined, {
      extinst_link1: linkRecord,
    });
    expect(context?.title).toBe('Example');
    expect(context?.content).toBe('Example\nhttps://example.com');
  });

  it('skips corrupted instance records and empty presentations', () => {
    expect(
      nodeToAIContext(linkNode, undefined, {
        extinst_link1: { id: 'extinst_link1', error: 'corrupted' },
      })
    ).toBeNull();
    expect(
      nodeToAIContext(linkNode, undefined, {
        extinst_link1: {
          ...linkRecord,
          presentation: { title: '' },
        },
      })
    ).toBeNull();
  });

  it('includes extension nodes in mixed selections', () => {
    const context = buildSelectionContext(
      [
        makeNode({ id: 'card-1', selected: true, data: { title: 'Card' } }),
        linkNode,
      ],
      { extinst_link1: linkRecord }
    );
    expect(context.map((entry) => entry.id)).toEqual(['card-1', 'ext-link-1']);
  });

  it('treats a selected extension with presentation as summarizable', () => {
    expect(
      hasSummarizableSelection([linkNode], { extinst_link1: linkRecord })
    ).toBe(true);
    expect(hasSummarizableSelection([linkNode], {})).toBe(false);
  });
});
