// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FocusedView } from '@/components/canvas/FocusedView';

const updateNodeDataMock = vi.fn();

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (
    selector: (state: { updateNodeData: typeof updateNodeDataMock }) => unknown
  ) => selector({ updateNodeData: updateNodeDataMock }),
}));

vi.mock('@/components/canvas/nodes/ImageNode', () => ({
  ImageContent: ({ data }: { data: { title?: string; imageUrl?: string } }) => (
    <div>
      image:{data.title ?? 'untitled'}:{data.imageUrl ?? 'none'}
    </div>
  ),
}));

vi.mock('@/components/editor/TiptapEditor', () => ({
  default: ({
    markdown,
    onMarkdownChange,
    onTitleChange,
    title,
  }: {
    markdown?: string;
    onMarkdownChange: (value: string) => void;
    onTitleChange: (value: string) => void;
    title?: string;
  }) => (
    <div>
      <div>
        editor:{title ?? 'untitled'}:{markdown ?? ''}
      </div>
      <button
        onClick={() => {
          onTitleChange('Updated Title');
        }}
        type="button"
      >
        mutate title
      </button>
      <button
        onClick={() => {
          onMarkdownChange('Updated body');
        }}
        type="button"
      >
        mutate body
      </button>
    </div>
  ),
}));

vi.mock('@/components/canvas/nodes/CardNode', () => ({
  CardContent: ({
    data,
    onChange,
  }: {
    data: { title?: string; content?: string };
    onChange?: (value: Record<string, unknown>) => void;
  }) => (
    <div>
      <div>
        card:{data.title ?? 'untitled'}:{data.content ?? ''}
      </div>
      <button
        onClick={() => {
          onChange?.({ title: 'Updated Title' });
        }}
        type="button"
      >
        mutate card
      </button>
    </div>
  ),
}));

const rect = {
  x: 10,
  y: 20,
  width: 120,
  height: 140,
  top: 20,
  left: 10,
  right: 130,
  bottom: 160,
  toJSON: () => ({}),
} as DOMRect;

describe('focusedView', () => {
  afterEach(() => {
    updateNodeDataMock.mockReset();
    document.body.style.overflow = '';
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders text cards with TiptapEditor and propagates edits to store', async () => {
    const onClose = vi.fn();

    render(
      <FocusedView
        node={{
          id: 'card-1',
          type: 'card',
          data: {
            title: 'Alpha',
            content: 'Body',
            noteId: 'note-1',
            file: 'a.md',
          },
          rect,
        }}
        onClose={onClose}
      />
    );

    expect(await screen.findByText('editor:Alpha:Body')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'mutate title' }));

    expect(updateNodeDataMock).toHaveBeenCalledWith('card-1', {
      title: 'Updated Title',
    });

    fireEvent.click(screen.getByRole('button', { name: 'mutate body' }));

    expect(updateNodeDataMock).toHaveBeenCalledWith('card-1', {
      content: 'Updated body',
      previewBlocks: undefined,
      previewExcerpt: undefined,
      previewHtml: undefined,
      previewVersion: undefined,
    });
  });

  it('renders image nodes and closes from overlay/back button', () => {
    const onClose = vi.fn();

    render(
      <FocusedView
        node={{
          id: 'image-1',
          type: 'image',
          data: {
            title: 'Cover',
            imageUrl: 'https://example.com/img.png',
            color: '#fff',
          },
          rect,
        }}
        onClose={onClose}
      />
    );

    expect(
      screen.getByText('image:Cover:https://example.com/img.png')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(
      screen.getByText('image:Cover:https://example.com/img.png').closest('div')
        ?.parentElement?.parentElement!
    );

    expect(onClose).toHaveBeenCalled();
  });
});
