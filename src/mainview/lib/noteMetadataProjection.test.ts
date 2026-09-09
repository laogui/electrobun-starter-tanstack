import { describe, expect, it } from 'vitest';
import { applyNoteMetadataChanges } from './noteMetadataProjection';

const change = {
  id: 'note-a',
  before: { title: 'Before', color: 'white', revision: 4 },
  after: { title: 'Plugin', color: 'blue', revision: 5 },
  metadataOnly: true,
};
const data = () => ({
  noteId: 'note-a',
  title: 'Before',
  color: 'white',
  blocknoteRevision: 4,
  content: 'Unsaved body',
  previewHtml: '<p>Old preview</p>',
  editor: 'blocknote',
  blocks: [{ type: 'paragraph' }],
});
const item = (id: string) => ({
  id,
  type: 'card',
  position: { x: 42, y: 12 },
  selected: true,
  data: data(),
});

describe('applyNoteMetadataChanges', () => {
  it('projects every duplicate, detached placement and both embedded child forms without touching content or layout', () => {
    const child = {
      id: 'child',
      noteId: 'note-a',
      title: 'Before',
      data: data(),
    };
    const flatChild = { id: 'flat', ...data() };
    const folder = {
      id: 'folder',
      data: { children: [child, flatChild, { id: 'unrelated' }] },
    };
    const nodes = [
      item('first'),
      { ...item('detached'), data: { ...data(), detached: true } },
      folder,
    ];
    const state = {
      nodes,
      focusedNode: { ...item('focused'), folderId: 'folder' },
      focusedFolder: folder,
      history: {},
    };
    const next = applyNoteMetadataChanges(state, [change]);
    for (const index of [0, 1]) {
      expect(next.nodes[index]?.data).toMatchObject({
        title: 'Plugin',
        color: 'blue',
        blocknoteRevision: 5,
        content: 'Unsaved body',
      });
      expect((next.nodes[index] as ReturnType<typeof item>).position).toBe(
        (nodes[index] as ReturnType<typeof item>).position
      );
      expect((next.nodes[index] as ReturnType<typeof item>).data.blocks).toBe(
        (nodes[index] as ReturnType<typeof item>).data.blocks
      );
    }
    const children = (next.nodes[2] as typeof folder).data.children;
    expect(children[0]).toMatchObject({
      title: 'Plugin',
      data: { title: 'Plugin', color: 'blue', blocknoteRevision: 5 },
    });
    expect(children[1]).toMatchObject({
      title: 'Plugin',
      color: 'blue',
      blocknoteRevision: 5,
    });
    expect(children[2]).toBe(folder.data.children[2]);
    expect(next.focusedNode.data).toMatchObject({
      title: 'Plugin',
      color: 'blue',
      content: 'Unsaved body',
    });
    expect(next.focusedNode.folderId).toBe('folder');
    expect(next.focusedFolder.data.children).toEqual(children);
    expect(next.history).toBe(state.history);
    expect(applyNoteMetadataChanges(next, [change])).toBe(next);
  });

  it('preserves conflicting metadata and stale revisions and ignores body notifications', () => {
    const conflicting = {
      ...item('draft'),
      data: { ...data(), title: 'Local draft' },
    };
    const stale = {
      ...item('stale'),
      data: { ...data(), blocknoteRevision: 2 },
    };
    const future = {
      ...item('future'),
      data: { ...data(), blocknoteRevision: 7 },
    };
    const state = {
      nodes: [conflicting, stale, future],
      focusedNode: conflicting,
      focusedFolder: null,
    };
    expect(applyNoteMetadataChanges(state, [change])).toBe(state);
    const clean = {
      nodes: [item('clean')],
      focusedNode: null,
      focusedFolder: null,
    };
    expect(
      applyNoteMetadataChanges(clean, [{ ...change, metadataOnly: false }])
    ).toBe(clean);
    expect(applyNoteMetadataChanges(clean, [])).toBe(clean);
  });

  it('keeps the nodes array when only a focused snapshot changes', () => {
    const state = {
      nodes: [],
      focusedNode: item('focused'),
      focusedFolder: null,
    };
    const next = applyNoteMetadataChanges(state, [change]);
    expect(next.nodes).toBe(state.nodes);
    expect(next.focusedNode.data.title).toBe('Plugin');
  });
});
