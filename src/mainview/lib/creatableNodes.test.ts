import { describe, expect, it, vi } from 'vitest';

import * as creatableNodes from '@/lib/creatableNodes';

vi.mock('../../paraglide/messages.js', () => ({
  menu_note: () => 'Note',
  menu_checklist: () => 'Checklist',
  menu_pomodoro: () => 'Pomodoro',
  menu_reminder: () => 'Reminder',
  menu_sticky: () => 'Sticky',
  menu_image: () => 'Image',
  menu_link: () => 'Link',
  menu_folder: () => 'Folder',
  menu_group: () => 'Group',
  menu_file: () => 'File',
  menu_recording: () => 'Recording',
  menu_new_note: () => 'New note',
  menu_new_checklist: () => 'New checklist',
  menu_new_pomodoro: () => 'New pomodoro',
  menu_new_reminder: () => 'New reminder',
  menu_new_sticky: () => 'New sticky',
  menu_new_image: () => 'New image',
  menu_new_link: () => 'New link',
  menu_new_folder: () => 'New folder',
  menu_new_group: () => 'New group',
  menu_new_file: () => 'New file',
  menu_new_recording: () => 'New recording',
}));

describe('resolveCreatableKind', () => {
  it('resolves canonical and context-menu-prefixed creation actions', () => {
    expect(creatableNodes.resolveCreatableKind('note')).toBe('card');
    expect(creatableNodes.resolveCreatableKind('new-note')).toBe('card');
    expect(creatableNodes.resolveCreatableKind('checklist')).toBe('checklist');
    expect(creatableNodes.resolveCreatableKind('new-pomodoro')).toBe(
      'pomodoro'
    );
    expect(creatableNodes.resolveCreatableKind('reminder')).toBe('reminder');
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
      'pomodoro',
      'reminder',
      'sticky',
      'image',
      'link',
      'folder',
      'group',
      'file',
      'recording',
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
      'Pomodoro',
      'Reminder',
      'Sticky',
      'Image',
      'Link',
      'Folder',
      'Group',
      'File',
      'Recording',
    ]);
    expect(contextItems.map((item) => item.label)).toEqual([
      'New note',
      'New checklist',
      'New pomodoro',
      'New reminder',
      'New sticky',
      'New image',
      'New link',
      'New folder',
      'New group',
      'New file',
      'New recording',
    ]);
  });
});
