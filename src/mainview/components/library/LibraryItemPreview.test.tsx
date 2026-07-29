// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  LIBRARY_PREVIEW_HEIGHT,
  LIBRARY_PREVIEW_WIDTH,
  LibraryItemPreview,
} from './LibraryItemPreview';
import type { LibraryItem } from './useLibraryData';

function makeItem(overrides: Partial<LibraryItem>): LibraryItem {
  return {
    createdAt: 0,
    data: {},
    id: 'node:card-1',
    nodeId: 'card-1',
    title: 'Roadmap',
    type: 'card',
    updatedAt: 0,
    ...overrides,
  };
}

describe('LibraryItemPreview', () => {
  it('renders the real card content inside a fixed inert viewport', () => {
    const item = makeItem({
      data: { color: '#FFFFFF', previewExcerpt: 'Body text', title: 'Roadmap' },
    });
    const { container } = render(<LibraryItemPreview item={item} />);

    expect(screen.getByText('Roadmap')).toBeInTheDocument();

    const viewport = container.firstElementChild;
    expect(viewport).not.toBeNull();
    expect(viewport?.getAttribute('aria-hidden')).toBe('true');
    expect(viewport?.hasAttribute('inert')).toBe(true);
    expect(viewport?.getAttribute('style')).toContain(
      `width: ${LIBRARY_PREVIEW_WIDTH}px`
    );
    expect(viewport?.getAttribute('style')).toContain(
      `height: ${LIBRARY_PREVIEW_HEIGHT}px`
    );

    const scaled = viewport?.firstElementChild;
    expect(scaled?.getAttribute('style')).toContain('scale(');
  });

  it('renders an image item through the canvas image content path', () => {
    const item = makeItem({
      data: { thumbnailUrl: 'data:image/png;base64,AAAA', title: 'Shot' },
      id: 'node:img-1',
      nodeId: 'img-1',
      title: 'Shot',
      type: 'image',
    });
    const { container } = render(<LibraryItemPreview item={item} />);

    const img = container.querySelector(
      'img[src="data:image/png;base64,AAAA"]'
    );
    expect(img).not.toBeNull();
  });

  it('renders widget items via a static card fallback without React Flow', () => {
    // No ReactFlowProvider in this tree: the widget path must not render
    // Handle elements (they throw without the provider).
    const item = makeItem({
      data: {
        kind: 'checklist',
        previewExcerpt: 'Milk\nEggs',
        title: 'Groceries',
        widgetId: 'widget-1',
      },
      id: 'node:widget-1',
      nodeId: 'widget-1',
      title: 'Groceries',
      type: 'widget',
    });
    const { container } = render(<LibraryItemPreview item={item} />);

    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(container.querySelector('.conn-handle')).toBeNull();
  });
});
