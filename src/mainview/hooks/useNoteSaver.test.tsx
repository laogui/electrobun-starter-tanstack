// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildTextNoteFrontmatter, useNoteSaver } from '@/hooks/useNoteSaver';

const mocks = vi.hoisted(() => ({
  rpcSaveNote: vi.fn(),
  toastError: vi.fn(),
  updateNodeData: vi.fn(),
}));

vi.mock('@/lib/rpc', () => ({
  rpcSaveNote: mocks.rpcSaveNote,
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

vi.mock('../../paraglide/messages.js', () => ({
  toast_save_failed: () => 'Could not save this note.',
}));

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (
    selector: (state: {
      updateNodeData: typeof mocks.updateNodeData;
    }) => unknown
  ) => selector({ updateNodeData: mocks.updateNodeData }),
}));

describe('buildTextNoteFrontmatter', () => {
  it('keeps only canonical frontmatter fields for text notes', () => {
    const frontmatter = buildTextNoteFrontmatter(
      'note-1',
      {
        color: '#fff',
        content: 'Body',
        createdAt: '2026-04-20T10:00:00.000Z',
        file: 'content/a.md',
        noteId: 'runtime-id',
        previewHtml: '<p>stale</p>',
        tag: 'Work',
        tagColor: '#111',
        tags: ['alpha'],
      },
      'Title'
    );

    expect(frontmatter).toEqual({
      id: 'note-1',
      title: 'Title',
      displayHint: 'note',
      color: '#fff',
      createdAt: '2026-04-20T10:00:00.000Z',
      tag: 'Work',
      tagColor: '#111',
      tags: ['alpha'],
    });
  });
});

describe('useNoteSaver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.rpcSaveNote.mockResolvedValue({
      success: true,
      preview: {
        html: '<p>Preview</p>',
        excerpt: 'Preview',
        blocks: 1,
        version: 1,
      },
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    mocks.rpcSaveNote.mockReset();
    mocks.toastError.mockReset();
    mocks.updateNodeData.mockReset();
  });

  it('debounces note saves and applies returned preview metadata', async () => {
    const { result } = renderHook(() =>
      useNoteSaver({
        frontmatter: { title: 'Title' },
        nodeId: 'node-1',
        noteId: 'note-1',
      })
    );

    act(() => {
      result.current.saveNoteDebounced('Body');
    });

    expect(mocks.rpcSaveNote).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
      await Promise.resolve();
    });

    expect(mocks.rpcSaveNote).toHaveBeenCalledWith(
      'note-1',
      { title: 'Title', id: 'note-1' },
      'Body'
    );
    expect(mocks.updateNodeData).toHaveBeenCalledWith('node-1', {
      content: 'Body',
      previewBlocks: 1,
      previewExcerpt: 'Preview',
      previewHtml: '<p>Preview</p>',
      previewVersion: 1,
    });
  });

  it('flushes a pending save immediately and cancels the timer', async () => {
    const { result } = renderHook(() =>
      useNoteSaver({
        debounceMs: 1000,
        frontmatter: { title: 'Title' },
        nodeId: 'node-1',
        noteId: 'note-1',
      })
    );

    act(() => {
      result.current.saveNoteDebounced('Body');
      result.current.flushNow();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.rpcSaveNote).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
    });

    expect(mocks.rpcSaveNote).toHaveBeenCalledTimes(1);
  });

  it('does not call the note RPC when no note id exists yet', async () => {
    const { result } = renderHook(() =>
      useNoteSaver({
        frontmatter: { title: 'Draft' },
        nodeId: 'node-1',
        noteId: undefined,
      })
    );

    act(() => {
      result.current.saveNoteDebounced('Draft body');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
      await Promise.resolve();
    });

    expect(mocks.rpcSaveNote).not.toHaveBeenCalled();
    expect(mocks.updateNodeData).not.toHaveBeenCalled();
  });

  it('toasts and keeps the note dirty when a save fails', async () => {
    mocks.rpcSaveNote.mockResolvedValueOnce({ success: false });
    const { result } = renderHook(() =>
      useNoteSaver({
        frontmatter: { title: 'Title' },
        nodeId: 'node-1',
        noteId: 'note-1',
      })
    );

    act(() => {
      result.current.saveNoteDebounced('Body');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
      await Promise.resolve();
    });

    expect(mocks.toastError).toHaveBeenCalledWith('Could not save this note.');
    expect(mocks.updateNodeData).not.toHaveBeenCalled();

    mocks.rpcSaveNote.mockResolvedValueOnce({
      success: true,
      preview: {
        html: '<p>Retry</p>',
        excerpt: 'Retry',
        blocks: 1,
        version: 1,
      },
    });
    act(() => {
      result.current.flushNow();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.rpcSaveNote).toHaveBeenCalledTimes(2);
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({ content: 'Body' })
    );
  });
});
