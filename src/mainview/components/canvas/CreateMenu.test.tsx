// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CreateMenu } from '@/components/canvas/CreateMenu';

const saveAssetFileWithProgressToastMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/assetImportProgress', () => ({
  saveAssetFileWithProgressToast: saveAssetFileWithProgressToastMock,
}));

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

  it('exposes file creation as an enabled menu item', () => {
    const onCreateNode = vi.fn();
    const setOpen = vi.fn();

    render(
      <CreateMenu onCreateNode={onCreateNode} open={true} setOpen={setOpen} />
    );

    expect(screen.getByRole('menuitem', { name: 'File' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('creates an asset node from the file picker', async () => {
    const onCreateNode = vi.fn();
    const setOpen = vi.fn();
    const assetData = {
      attachmentFile: 'attachments/file_abc.txt',
      color: '#FFFFFF',
      fileName: 'notes.txt',
      kind: 'file',
      mimeType: 'text/plain',
      size: 5,
      title: 'notes.txt',
    };
    saveAssetFileWithProgressToastMock.mockResolvedValueOnce(assetData);

    const { container } = render(
      <CreateMenu onCreateNode={onCreateNode} open={true} setOpen={setOpen} />
    );
    const input = container.querySelector('input[type="file"]')!;
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(saveAssetFileWithProgressToastMock).toHaveBeenCalledWith(file);
      expect(onCreateNode).toHaveBeenCalledWith('asset', {
        data: assetData,
      });
      expect(setOpen).toHaveBeenCalledWith(false);
    });
  });

  it('creates a link node from the inline URL form', () => {
    const onCreateNode = vi.fn();
    const setOpen = vi.fn();

    render(
      <CreateMenu onCreateNode={onCreateNode} open={true} setOpen={setOpen} />
    );

    fireEvent.click(screen.getByRole('menuitem', { name: 'Link' }));
    fireEvent.change(screen.getByLabelText('Link URL'), {
      target: { value: 'example.com/docs' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));

    expect(onCreateNode).toHaveBeenCalledWith('link', {
      data: {
        url: 'https://example.com/docs',
        title: 'example.com',
        color: '#FFFFFF',
      },
    });
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
