import { describe, expect, it, vi } from 'vitest';

import {
  buildImportedCardCreateOptions,
  handleMarkdownImportResult,
  importedNoteCardData,
} from './importMarkdownCards';

const toastMock = vi.hoisted(() => {
  const fn = vi.fn() as unknown as {
    (msg: string): void;
    error: ReturnType<typeof vi.fn>;
  };
  fn.error = vi.fn();
  return fn;
});

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('../../paraglide/messages.js', () => ({
  toast_markdown_imported: ({ count }: { count: number }) =>
    `Imported ${count}`,
  toast_markdown_import_failed: () => 'Import failed',
  toast_markdown_import_partial: ({
    imported,
    failed,
  }: {
    imported: number;
    failed: number;
  }) => `Imported ${imported}, failed ${failed}`,
}));

describe('importMarkdownCards', () => {
  it('builds card data and create options with viewport focus on the last card', () => {
    const note = { noteId: 'note_1', title: 'One', content: 'Body' };
    expect(importedNoteCardData(note)).toEqual({
      color: '#FFFFFF',
      content: 'Body',
      noteId: 'note_1',
      title: 'One',
      type: 'text',
    });
    expect(buildImportedCardCreateOptions(note, 0, 2, { x: 4, y: 8 })).toEqual({
      anchorCenter: { x: 4, y: 8 },
      data: importedNoteCardData(note),
      focusViewport: false,
    });
    expect(buildImportedCardCreateOptions(note, 1, 2, { x: 4, y: 8 })).toEqual({
      anchorCenter: { x: 4, y: 8 },
      data: importedNoteCardData(note),
      focusViewport: true,
    });
  });

  it('shows failure toast when RPC returns null or no notes', () => {
    const place = vi.fn();

    expect(handleMarkdownImportResult(null, place)).toBe(false);
    expect(place).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith('Import failed');

    toastMock.error.mockClear();
    expect(
      handleMarkdownImportResult({ notes: [], failedCount: 2 }, place)
    ).toBe(false);
    expect(place).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith('Import failed');
  });

  it('places notes and shows success or partial toasts', () => {
    const place = vi.fn();
    const notes = [{ noteId: 'a', title: 'A' }];

    expect(handleMarkdownImportResult({ notes }, place)).toBe(true);
    expect(place).toHaveBeenCalledWith(notes);
    expect(toastMock).toHaveBeenCalledWith('Imported 1');

    vi.mocked(toastMock).mockClear();
    place.mockClear();
    expect(handleMarkdownImportResult({ notes, failedCount: 1 }, place)).toBe(
      true
    );
    expect(toastMock).toHaveBeenCalledWith('Imported 1, failed 1');
  });

  it('ignores canceled imports without toasts', () => {
    const place = vi.fn();
    expect(
      handleMarkdownImportResult({ canceled: true, notes: [] }, place)
    ).toBe(false);
    expect(place).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});
