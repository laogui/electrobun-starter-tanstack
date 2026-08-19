import { describe, expect, it, vi } from 'vitest';

import * as creatableNodes from '@/lib/creatableNodes';

vi.mock('../../paraglide/messages.js', () => ({
  menu_note: () => 'Note',
  menu_sticky: () => 'Sticky',
  menu_folder: () => 'Folder',
  menu_group: () => 'Group',
  menu_new_note: () => 'New note',
  menu_new_sticky: () => 'New sticky',
  menu_new_folder: () => 'New folder',
  menu_new_group: () => 'New group',
}));

describe('resolveCreatableKind', () => {
  it('resolves core creation actions only', () => {
    expect(creatableNodes.resolveCreatableKind('note')).toBe('card');
    expect(creatableNodes.resolveCreatableKind('new-note')).toBe('card');
    expect(creatableNodes.resolveCreatableKind('sticky')).toBe('sticky');
    expect(creatableNodes.resolveCreatableKind('folder')).toBe('folder');
    expect(creatableNodes.resolveCreatableKind('group')).toBe('group');
    expect(creatableNodes.resolveCreatableKind('checklist')).toBeUndefined();
    expect(creatableNodes.resolveCreatableKind('file')).toBeUndefined();
  });
});

describe('getCreatableMenuItems', () => {
  it('lists only core kinds; extras come from the canvas type registry', () => {
    const bottomItems = creatableNodes.getCreatableMenuItems('short');
    const contextItems = creatableNodes.getCreatableMenuItems('new');

    expect(bottomItems.map((item) => item.id)).toEqual([
      'note',
      'sticky',
      'folder',
      'group',
    ]);
    expect(contextItems.map((item) => item.id)).toEqual(
      bottomItems.map((item) => item.id)
    );
    expect(bottomItems.map((item) => item.label)).toEqual([
      'Note',
      'Sticky',
      'Folder',
      'Group',
    ]);
    expect(contextItems.map((item) => item.label)).toEqual([
      'New note',
      'New sticky',
      'New folder',
      'New group',
    ]);
  });
});
