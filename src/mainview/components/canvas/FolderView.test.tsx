// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
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

    expect(screen.getByText('Folder Subtitle')).toBeInTheDocument();
    expect(screen.getByText('card-child:Child Card:Body')).toBeInTheDocument();
    expect(
      screen.getByText('image-child:Child Image:https://example.com/image.png')
    ).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

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

    expect(screen.getByText('Only Title')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));

    expect(onClose).toHaveBeenCalled();
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
});
