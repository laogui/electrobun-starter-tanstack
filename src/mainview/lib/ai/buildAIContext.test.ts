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
