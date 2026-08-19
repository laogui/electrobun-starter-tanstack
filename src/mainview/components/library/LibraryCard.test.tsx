// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LibraryCard } from './LibraryCard';
import type { LibraryItem } from './useLibraryData';

function makeItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    createdAt: Date.now(),
    data: { title: 'Roadmap', previewExcerpt: 'Body' },
    id: 'node:card-1',
    nodeId: 'card-1',
    title: 'Roadmap',
    type: 'card',
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('LibraryCard', () => {
  it('shows a top-right Note capsule instead of a footer type icon', () => {
    render(<LibraryCard item={makeItem()} onClick={vi.fn()} />);

    expect(screen.getByText('Note')).toBeInTheDocument();
    // The miniature preview still renders the live title; the footer now shows
    // only the timestamp, so the heading is printed exactly once.
    expect(screen.getAllByText('Roadmap').length).toBe(1);
    expect(document.querySelector('svg')).toBeNull();
  });

  it('labels checklist cards and widgets with their kind capsule', () => {
    const { rerender } = render(
      <LibraryCard
        item={makeItem({
          data: { type: 'checklist', title: 'Todos' },
          title: 'Todos',
        })}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText('Checklist')).toBeInTheDocument();

    rerender(
      <LibraryCard
        item={makeItem({
          data: { kind: 'pomodoro', title: 'Focus' },
          id: 'node:widget-1',
          nodeId: 'widget-1',
          title: 'Focus',
          type: 'widget',
        })}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText('Timer')).toBeInTheDocument();
  });

  it('paints a fixed-size PDF capsule for asset cards (not a scaled native one)', () => {
    render(
      <LibraryCard
        item={makeItem({
          data: {
            fileName: 'deck.pdf',
            kind: 'file',
            mimeType: 'application/pdf',
            title: 'deck',
          },
          id: 'node:asset-1',
          nodeId: 'asset-1',
          title: 'deck.pdf',
          type: 'asset',
        })}
        onClick={vi.fn()}
      />
    );

    // AssetContent may still emit a nested TypeBadge in the DOM (hidden via
    // CSS in the real UI); the chrome capsule is the absolute top-right one.
    const chromeBadge = screen
      .getAllByText('PDF')
      .find((el) => el.className.includes('absolute'));
    expect(chromeBadge).toBeDefined();
    expect(chromeBadge).toHaveAttribute('data-type-badge');
  });

  it('labels extension media and productivity cards like the original types', () => {
    const { rerender } = render(
      <LibraryCard
        item={makeItem({
          data: {
            canvasTypeId: 'ghostboard.media/file',
            kind: 'file',
            mimeType: 'application/pdf',
            title: 'deck',
          },
          id: 'node:ext-file',
          nodeId: 'ext-file',
          title: 'deck',
          type: 'extension',
        })}
        onClick={vi.fn()}
      />
    );
    expect(
      screen.getAllByText('PDF').some((el) => el.className.includes('absolute'))
    ).toBe(true);

    rerender(
      <LibraryCard
        item={makeItem({
          data: { canvasTypeId: 'ghostboard.media/image', title: 'Logo' },
          id: 'node:ext-image',
          nodeId: 'ext-image',
          title: 'Logo',
          type: 'extension',
        })}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText('Image')).toBeInTheDocument();

    rerender(
      <LibraryCard
        item={makeItem({
          data: { canvasTypeId: 'ghostboard.productivity/pomodoro' },
          id: 'node:ext-pomodoro',
          nodeId: 'ext-pomodoro',
          title: 'Focus',
          type: 'extension',
        })}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText('Timer')).toBeInTheDocument();
  });

  it('invokes onClick when activated', () => {
    const onClick = vi.fn();
    const item = makeItem();
    render(<LibraryCard item={item} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith(item);
  });
});
