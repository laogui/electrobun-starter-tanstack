// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FolderView } from '@/components/canvas/FolderView';

vi.mock('@/components/canvas/nodes/ImageNode', () => ({
  ImageContent: ({ data }: { data: { title?: string; imageUrl?: string } }) => (
    <div>
      image-child:{data.title ?? 'untitled'}:{data.imageUrl ?? 'none'}
    </div>
  ),
}));

vi.mock('@/components/canvas/nodes/CardNode', () => ({
  CardContent: ({ data }: { data: { title?: string; content?: string } }) => (
    <div>
      card-child:{data.title ?? 'untitled'}:{data.content ?? ''}
    </div>
  ),
}));

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (
    selector: (state: {
      clipboard: unknown[];
      edges: unknown[];
      nodes: unknown[];
    }) => unknown
  ) => selector({ clipboard: [], edges: [], nodes: [] }),
}));

vi.mock('../../../paraglide/messages.js', () => ({
  folder_view_aria: ({ title }: { title: string }) => `Open folder: ${title}`,
  folder_view_close: () => 'Close folder',
  folder_view_empty_hint: () => 'Drop cards onto this folder to collect them.',
  folder_view_items_aria: ({ title }: { title: string }) => `Items in ${title}`,
  folder_view_more_items: ({ count }: { count: number }) =>
    `Show ${count} more items`,
  folder_view_open_item: ({ title }: { title: string }) => `Open ${title}`,
  folder_view_untitled_item: () => 'Untitled',
  menu_folder: () => 'Folder',
  menu_move_out: () => 'Move Out',
}));

const rect = {
  x: 0,
  y: 0,
  width: 160,
  height: 160,
  top: 0,
  left: 0,
  right: 160,
  bottom: 160,
  toJSON: () => ({}),
} as DOMRect;

describe('folderView', () => {
  afterEach(() => {
    document.body.style.overflow = '';
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders children and triggers onCardClick for a child card', () => {
    const onClose = vi.fn();
    const onCardClick = vi.fn();

    render(
      <FolderView
        folder={{
          id: 'folder-1',
          rect,
          data: {
            title: 'Folder Title',
            subtitle: 'Folder Subtitle',
            children: [
              {
                id: 'child-card',
                type: 'card',
                data: { title: 'Child Card', content: 'Body', color: '#fff' },
              },
              {
                id: 'child-image',
                type: 'image',
                data: {
                  title: 'Child Image',
                  imageUrl: 'https://example.com/image.png',
                  color: '#fff',
                },
              },
            ],
          },
        }}
        onCardClick={onCardClick}
        onClose={onClose}
      />
    );

    expect(
      screen.getByRole('region', { name: 'Open folder: Folder Title' })
    ).toBeInTheDocument();
    expect(screen.getByText('card-child:Child Card:Body')).toBeInTheDocument();
    expect(
      screen.getByText('image-child:Child Image:https://example.com/image.png')
    ).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');

    fireEvent.click(screen.getByText('card-child:Child Card:Body'));

    expect(onCardClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'child-card' }),
      expect.objectContaining({ width: expect.any(Number) })
    );
  });

  it('supports closing and renders empty folders stably', () => {
    const onClose = vi.fn();

    render(
      <FolderView
        folder={{
          id: 'folder-empty',
          rect,
          data: {
            title: 'Only Title',
            subtitle: '',
            children: [],
          },
        }}
        onCardClick={vi.fn()}
        onClose={onClose}
      />
    );

    expect(
      screen.getByRole('region', { name: 'Open folder: Only Title' })
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Close folder' })[0]!
    );

    expect(onClose).toHaveBeenCalled();
  });

  it('preserves an existing body scroll lock when it unmounts', () => {
    document.body.style.overflow = 'hidden';

    const view = render(
      <FolderView
        folder={{
          id: 'folder-empty',
          rect,
          data: {
            title: 'Only Title',
            subtitle: '',
            children: [],
          },
        }}
        onCardClick={vi.fn()}
        onClose={vi.fn()}
      />
    );

    view.unmount();

    expect(document.body.style.overflow).toBe('hidden');
  });

  it('opens a child context menu and moves a child out', () => {
    const onMoveChildOut = vi.fn();

    render(
      <FolderView
        folder={{
          id: 'folder-1',
          rect,
          data: {
            title: 'Folder Title',
            subtitle: '',
            children: [
              {
                id: 'child-card',
                type: 'card',
                data: { title: 'Child Card', content: 'Body', color: '#fff' },
              },
            ],
          },
        }}
        onCardClick={vi.fn()}
        onClose={vi.fn()}
        onMoveChildOut={onMoveChildOut}
      />
    );

    fireEvent.contextMenu(screen.getByText('card-child:Child Card:Body'));
    fireEvent.click(screen.getByRole('button', { name: 'Move Out' }));

    expect(onMoveChildOut).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'child-card' }),
      expect.objectContaining({ width: expect.any(Number) })
    );
  });

  it('renders many children and forwards image child clicks too', () => {
    const onCardClick = vi.fn();

    render(
      <FolderView
        folder={{
          id: 'folder-large',
          rect,
          data: {
            title: 'Large Folder',
            subtitle: 'Busy',
            children: [
              ...Array.from({ length: 5 }, (_, index) => ({
                id: `card-${index}`,
                type: 'card',
                data: {
                  title: `Card ${index}`,
                  content: `Body ${index}`,
                  color: '#fff',
                },
              })),
              {
                id: 'image-1',
                type: 'image',
                data: {
                  title: 'Poster',
                  imageUrl: 'poster.png',
                  color: '#fff',
                },
              },
            ],
          },
        }}
        onCardClick={onCardClick}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('card-child:Card 4:Body 4')).toBeInTheDocument();
    fireEvent.click(screen.getByText('image-child:Poster:poster.png'));
    expect(onCardClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'image-1', type: 'image' }),
      expect.objectContaining({ width: expect.any(Number) })
    );
  });

  it('pages large folders through the compact +N stack', () => {
    render(
      <FolderView
        folder={{
          id: 'folder-large',
          rect,
          data: {
            title: 'Large Folder',
            children: Array.from({ length: 12 }, (_, index) => ({
              id: `card-${index}`,
              type: 'card',
              data: { title: `Card ${index}`, content: `Body ${index}` },
            })),
          },
        }}
        onCardClick={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByRole('option', { name: 'Open Card 0' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Show 5 more items' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Open Card 7' })).toBeNull();

    fireEvent.click(screen.getByRole('option', { name: 'Show 5 more items' }));

    expect(
      screen.getByRole('option', { name: 'Open Card 7' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Show 7 more items' })
    ).toBeInTheDocument();
  });

  it('supports roving keyboard focus, activation, and escape', async () => {
    const onCardClick = vi.fn();
    const onClose = vi.fn();

    render(
      <FolderView
        folder={{
          id: 'folder-keyboard',
          rect,
          data: {
            title: 'Keyboard Folder',
            children: [
              {
                id: 'card-1',
                type: 'card',
                data: { title: 'First', content: 'One' },
              },
              {
                id: 'card-2',
                type: 'card',
                data: { title: 'Second', content: 'Two' },
              },
            ],
          },
        }}
        onCardClick={onCardClick}
        onClose={onClose}
      />
    );

    const first = screen.getByRole('option', { name: 'Open First' });
    const second = screen.getByRole('option', { name: 'Open Second' });
    first.focus();
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(second).toHaveFocus();
    });

    fireEvent.keyDown(second, { key: 'Enter' });
    expect(onCardClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'card-2' }),
      expect.objectContaining({ width: expect.any(Number) })
    );

    fireEvent.keyDown(second, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
