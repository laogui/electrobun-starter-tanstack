import { describe, expect, it } from 'vitest';

import type { SearchResultTarget } from './searchTypes';

describe('SearchResultTarget', () => {
  it('represents unlinked content without inventing a canvas node', () => {
    const target: SearchResultTarget = {
      type: 'content',
      placement: 'unlinked',
      content: { kind: 'note', id: 'note-unlinked' },
    };

    expect(target).toEqual({
      type: 'content',
      placement: 'unlinked',
      content: { kind: 'note', id: 'note-unlinked' },
    });
  });

  it('requires a folder owner for child targets', () => {
    const target: SearchResultTarget = {
      type: 'folder-child',
      viewId: 'view-1',
      folderId: 'folder-1',
      childId: 'child-1',
      placement: 'folder',
    };

    expect(target).toMatchObject({
      type: 'folder-child',
      folderId: 'folder-1',
      childId: 'child-1',
    });
  });
});
