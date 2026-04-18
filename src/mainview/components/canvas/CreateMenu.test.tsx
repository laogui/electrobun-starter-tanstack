// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CreateMenu } from '@/components/canvas/CreateMenu';

vi.mock('../../../paraglide/messages.js', () => ({
  menu_note: () => 'Note',
  menu_checklist: () => 'Checklist',
  menu_sticky: () => 'Sticky',
  menu_image: () => 'Image',
  menu_folder: () => 'Folder',
  menu_group: () => 'Group',
  menu_file: () => 'File',
}));

describe('createMenu', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('creates a mapped node type and closes the menu', () => {
    const onCreateNode = vi.fn();
    const setOpen = vi.fn();

    render(
      <CreateMenu onCreateNode={onCreateNode} open={true} setOpen={setOpen} />
    );

    fireEvent.click(screen.getByRole('menuitem', { name: 'Note' }));

    expect(onCreateNode).toHaveBeenCalledWith('card');
    expect(setOpen).toHaveBeenCalledWith(false, expect.any(Object));
  });

  it('creates checklist cards from the menu', () => {
    const onCreateNode = vi.fn();
    const setOpen = vi.fn();

    render(
      <CreateMenu onCreateNode={onCreateNode} open={true} setOpen={setOpen} />
    );

    fireEvent.click(screen.getByRole('menuitem', { name: 'Checklist' }));

    expect(onCreateNode).toHaveBeenCalledWith('checklist');
  });

  it('does not allow disabled menu items to trigger creation', () => {
    const onCreateNode = vi.fn();
    const setOpen = vi.fn();

    render(
      <CreateMenu onCreateNode={onCreateNode} open={true} setOpen={setOpen} />
    );

    expect(screen.getByRole('menuitem', { name: 'File' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'File' }));

    expect(onCreateNode).not.toHaveBeenCalled();
  });

  it('closes when clicking outside the open menu', () => {
    const onCreateNode = vi.fn();
    const setOpen = vi.fn();

    render(
      <CreateMenu onCreateNode={onCreateNode} open={true} setOpen={setOpen} />
    );

    fireEvent.mouseDown(document.body);

    expect(setOpen).toHaveBeenCalledWith(false, expect.any(Object));
  });
});
