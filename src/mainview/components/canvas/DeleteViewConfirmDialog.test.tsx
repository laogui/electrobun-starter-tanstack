// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DeleteViewConfirmDialog } from '@/components/canvas/DeleteViewConfirmDialog';

vi.mock('../../../paraglide/messages.js', () => ({
  delete_view_confirm_action: () => 'Delete Canvas',
  delete_view_confirm_body: ({ name }: { name: string }) =>
    `"${name}" and everything on it will be moved to trash. You can undo this from the toast that appears next.`,
  delete_view_confirm_cancel: () => 'Cancel',
  delete_view_confirm_title: () => 'Delete canvas?',
}));

const NAME_RE = /"My Canvas"/;
const TRASH_RE = /moved to trash/i;

describe('DeleteViewConfirmDialog', () => {
  it('renders the canvas name and confirms deletion', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DeleteViewConfirmDialog
        onCancel={onCancel}
        onConfirm={onConfirm}
        open
        viewName="My Canvas"
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete canvas?')).toBeInTheDocument();
    expect(screen.getByText(NAME_RE)).toBeInTheDocument();
    expect(screen.getByText(TRASH_RE)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Canvas' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('supports cancelling without confirming', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <DeleteViewConfirmDialog
        onCancel={onCancel}
        onConfirm={onConfirm}
        open
        viewName="My Canvas"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
