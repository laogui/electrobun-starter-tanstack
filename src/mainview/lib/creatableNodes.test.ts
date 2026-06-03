import { describe, expect, it, vi } from 'vitest';

import * as creatableNodes from '@/lib/creatableNodes';

vi.mock('../../paraglide/messages.js', () => ({
  menu_note: () => 'Note',
  menu_checklist: () => 'Checklist',
  menu_sticky: () => 'Sticky',
  menu_image: () => 'Image',
  menu_link: () => 'Link',
  menu_folder: () => 'Folder',
  menu_group: () => 'Group',
  menu_file: () => 'File',
  menu_new_note: () => 'New note',
  menu_new_checklist: () => 'New checklist',
  menu_new_sticky: () => 'New sticky',
  menu_new_image: () => 'New image',
  menu_new_link: () => 'New link',
  menu_new_folder: () => 'New folder',
  menu_new_group: () => 'New group',
  menu_new_file: () => 'New file',
}));

describe('resolveCreatableKind', () => {
  it('resolves canonical and context-menu-prefixed creation actions', () => {
    expect(creatableNodes.resolveCreatableKind('note')).toBe('card');
    expect(creatableNodes.resolveCreatableKind('new-note')).toBe('card');
    expect(creatableNodes.resolveCreatableKind('file')).toBe('asset');
    expect(creatableNodes.resolveCreatableKind('new-file')).toBe('asset');
  });
});

describe('getCreatableMenuItems', () => {
  it('keeps bottom and context-menu creation items on the same ids and icons', () => {
    expect(creatableNodes.getCreatableMenuItems).toEqual(expect.any(Function));

    const bottomItems = creatableNodes.getCreatableMenuItems('short');
    const contextItems = creatableNodes.getCreatableMenuItems('new');

    expect(bottomItems.map((item) => item.id)).toEqual([
      'note',
      'checklist',
      'sticky',
      'image',
      'link',
      'folder',
      'group',
      'file',
    ]);
    expect(contextItems.map((item) => item.id)).toEqual(
      bottomItems.map((item) => item.id)
    );
    expect(contextItems.map((item) => item.icon)).toEqual(
      bottomItems.map((item) => item.icon)
    );
  });

  it('uses short labels for the bottom menu and new-prefixed labels for context menus', () => {
    const bottomItems = creatableNodes.getCreatableMenuItems('short');
    const contextItems = creatableNodes.getCreatableMenuItems('new');

    expect(bottomItems.map((item) => item.label)).toEqual([
      'Note',
      'Checklist',
      'Sticky',
      'Image',
      'Link',
      'Folder',
      'Group',
      'File',
    ]);
    expect(contextItems.map((item) => item.label)).toEqual([
      'New note',
      'New checklist',
      'New sticky',
      'New image',
      'New link',
      'New folder',
      'New group',
      'New file',
    ]);
  });
});
