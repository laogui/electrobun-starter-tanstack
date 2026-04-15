// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../paraglide/messages.js', () => ({
  menu_note: () => 'Note',
  menu_sticky: () => 'Sticky',
  menu_image: () => 'Image',
  menu_folder: () => 'Folder',
  menu_group: () => 'Group',
  menu_file: () => 'File',
}));

import { CreateMenu } from '@/components/canvas/CreateMenu';

describe('CreateMenu', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Note' }));

    expect(onCreateNode).toHaveBeenCalledWith('card');
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it('does not allow disabled menu items to trigger creation', () => {
    const onCreateNode = vi.fn();
    const setOpen = vi.fn();

    render(
      <CreateMenu onCreateNode={onCreateNode} open={true} setOpen={setOpen} />
    );

    expect(screen.getByRole('button', { name: 'File' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'File' }));

    expect(onCreateNode).not.toHaveBeenCalled();
  });

  it('closes when clicking outside the open menu', () => {
    const onCreateNode = vi.fn();
    const setOpen = vi.fn();

    render(
      <CreateMenu onCreateNode={onCreateNode} open={true} setOpen={setOpen} />
    );

    fireEvent.mouseDown(document.body);

    expect(setOpen).toHaveBeenCalledWith(false);
  });
});
