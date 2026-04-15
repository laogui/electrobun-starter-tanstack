// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

import { FolderView } from '@/components/canvas/FolderView';

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

describe('FolderView', () => {
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
        onClose={onClose}
        onCardClick={onCardClick}
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
          rect,
          data: {
            title: 'Only Title',
            subtitle: '',
            children: [],
          },
        }}
        onClose={onClose}
        onCardClick={vi.fn()}
      />
    );

    expect(screen.getByText('Only Title')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));

    expect(onClose).toHaveBeenCalled();
  });
});
