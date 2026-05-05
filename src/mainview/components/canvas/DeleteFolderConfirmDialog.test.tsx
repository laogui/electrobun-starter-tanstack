// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DeleteFolderConfirmDialog } from '@/components/canvas/DeleteFolderConfirmDialog';

vi.mock('../../../paraglide/messages.js', () => ({
  delete_folder_confirm_action: () => 'Delete Folder',
  delete_folder_confirm_body: () =>
    'Only the folder shell will be removed. Notes and images inside will not be deleted; they will become ungrouped content in Note Library.',
  delete_folder_confirm_cancel: () => 'Cancel',
  delete_folder_confirm_title: () => 'Delete folder?',
}));

const CONTENT_PRESERVED_RE = /will not be deleted/i;
const NOTE_LIBRARY_RE = /Note Library/;

describe('DeleteFolderConfirmDialog', () => {
  it('explains that folder contents move to Note Library and confirms deletion', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DeleteFolderConfirmDialog
        onCancel={onCancel}
        onConfirm={onConfirm}
        open
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete folder?')).toBeInTheDocument();
    expect(screen.getByText(CONTENT_PRESERVED_RE)).toBeInTheDocument();
    expect(screen.getByText(NOTE_LIBRARY_RE)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Folder' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('supports cancelling without confirming', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DeleteFolderConfirmDialog
        onCancel={onCancel}
        onConfirm={onConfirm}
        open
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
