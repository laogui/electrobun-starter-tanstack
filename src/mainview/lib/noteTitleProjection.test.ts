import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  applyNoteTitlesToCanvasNodes,
  collectNoteIdsFromCanvasNodes,
} from './noteTitleProjection';

function card(
  id: string,
  noteId: string,
  title: string,
  selected = false
): Node {
  return {
    id,
    type: 'card',
    position: { x: 0, y: 0 },
    selected,
    data: { noteId, title },
  };
}

describe('note title projection', () => {
  it('collects unique noteIds from selected cards and folder children', () => {
    const nodes: Node[] = [
      card('a', 'note_a', '  Hello   world ', true),
      card('b', 'note_a', '  Hello   world ', false),
      {
        id: 'folder',
        type: 'folder',
        position: { x: 0, y: 0 },
        selected: true,
        data: {
          title: 'Folder',
          children: [
            {
              id: 'child',
              noteId: 'note_b',
              type: 'card',
              data: { noteId: 'note_b', title: 'Child' },
            },
          ],
        },
      },
      card('c', 'note_c', 'Skip', false),
    ];
    expect(
      collectNoteIdsFromCanvasNodes(nodes, { selectedOnly: true })
    ).toEqual(['note_a', 'note_b']);
    expect(collectNoteIdsFromCanvasNodes(nodes)).toEqual([
      'note_a',
      'note_b',
      'note_c',
    ]);
  });

  it('updates every canvas occurrence of a note, including folder children', () => {
    const nodes: Node[] = [
      card('a', 'note_a', '  Hello   world ', true),
      card('b', 'note_a', '  Hello   world ', false),
      {
        id: 'folder',
        type: 'folder',
        position: { x: 0, y: 0 },
        data: {
          children: [
            {
              id: 'child',
              noteId: 'note_a',
              data: { noteId: 'note_a', title: '  Hello   world ' },
            },
          ],
        },
      },
    ];
    const next = applyNoteTitlesToCanvasNodes(
      nodes,
      new Map([['note_a', 'Hello world']])
    );
    expect(next[0]?.data.title).toBe('Hello world');
    expect(next[1]?.data.title).toBe('Hello world');
    const children = next[2]?.data.children as Array<{
      data: { title: string };
      title: string;
    }>;
    expect(children[0]?.title).toBe('Hello world');
    expect(children[0]?.data.title).toBe('Hello world');
  });
});
