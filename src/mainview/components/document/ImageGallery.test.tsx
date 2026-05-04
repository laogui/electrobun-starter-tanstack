// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ImageGallery } from '@/components/document/ImageGallery';
import { useCanvasStore } from '@/store/canvasStore';

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=';

function makeImageNode(id: string, title: string): Node {
  return {
    id,
    type: 'image',
    position: { x: 0, y: 0 },
    data: { imageUrl: PIXEL, title, color: '#fff' },
  };
}

describe('ImageGallery', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
  });

  afterEach(() => {
    useCanvasStore.getState().reset();
  });

  it('shows the empty state when no image nodes exist', () => {
    render(<ImageGallery />);
    expect(screen.getByText('No images yet')).toBeInTheDocument();
  });

  it('renders an entry for each image node and reflects the count', () => {
    useCanvasStore
      .getState()
      .hydrate(
        [makeImageNode('img-1', 'First'), makeImageNode('img-2', 'Second')],
        []
      );

    render(<ImageGallery />);
    const tiles = screen.getAllByRole('img');
    expect(tiles).toHaveLength(2);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('opens a lightbox dialog when an image tile is clicked', () => {
    useCanvasStore
      .getState()
      .hydrate([makeImageNode('img-1', 'Lighthouse')], []);

    render(<ImageGallery />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const tile = screen.getAllByRole('button', { name: 'Lighthouse' })[0];
    fireEvent.click(tile);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
