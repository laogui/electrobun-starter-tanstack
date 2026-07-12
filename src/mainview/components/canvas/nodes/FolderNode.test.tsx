// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getFolderThumbnailSlots } from '@/lib/folderExpansion';
import { useCanvasStore } from '@/store/canvasStore';
import FolderNode from './FolderNode';

const commitNodeDataMock = vi.fn();

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div data-testid={`handle-${id}`} />,
  Position: {
    Top: 'top',
    Right: 'right',
    Bottom: 'bottom',
    Left: 'left',
  },
}));

vi.mock('@/components/canvas/FolderChildPreview', () => ({
  FolderChildPreview: ({ child }: { child: { id: string } }) => (
    <div data-testid={`folder-preview-${child.id}`} />
  ),
}));

vi.mock('motion/react-m', () => ({
  div: (props: Record<string, unknown>) => {
    const {
      animate: _animate,
      children,
      initial: _initial,
      onAnimationComplete,
      transition: _transition,
      ...domProps
    } = props;
    return createElement(
      'div',
      {
        ...domProps,
        onTransitionEnd: onAnimationComplete as (() => void) | undefined,
      },
      children as ReactNode
    );
  },
}));

describe('FolderNode', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      commitNodeData: commitNodeDataMock,
      editingFolderId: null,
      focusedNode: null,
    });
  });

  afterEach(() => {
    commitNodeDataMock.mockReset();
    document.body.className = '';
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders folder title and subtitle at normal zoom', () => {
    render(
      <FolderNode
        data={{
          children: [{ id: 'a' }, { id: 'b' }],
          subtitle: '12 children',
          title: 'Research',
        }}
        id="folder-1"
      />
    );

    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.getByText('2 items')).toBeInTheDocument();
    expect(screen.getByText('12 children')).toBeInTheDocument();
    expect(screen.getByTestId('handle-left')).toBeInTheDocument();
  });

  it('renders up to five real child preview layers inside the folder shell', () => {
    const { container } = render(
      <FolderNode
        data={{
          children: Array.from({ length: 7 }, (_, index) => ({
            id: `child-${index}`,
            type: 'card',
            data: { content: `Card ${index}` },
          })),
          title: 'References',
        }}
        id="folder-previews"
      />
    );

    expect(
      container.querySelectorAll('[data-folder-thumbnail-id]')
    ).toHaveLength(5);
    expect(screen.getByTestId('folder-preview-child-0')).toBeInTheDocument();
    expect(screen.queryByTestId('folder-preview-child-5')).toBeNull();
  });

  it('applies the stable count-specific composition for one through five cards', () => {
    for (let count = 1; count <= 5; count += 1) {
      const children = Array.from({ length: count }, (_, index) => ({
        id: `count-${count}-child-${index}`,
        type: 'card',
        data: { content: `Card ${index}` },
      }));
      const slots = getFolderThumbnailSlots(children.map((child) => child.id));
      const { container, unmount } = render(
        <FolderNode
          data={{ children, title: `${count} cards` }}
          id={`folder-count-${count}`}
        />
      );
      const thumbnails = Array.from(
        container.querySelectorAll<HTMLElement>('[data-folder-thumbnail-id]')
      );

      expect(thumbnails).toHaveLength(count);
      for (const [index, thumbnail] of thumbnails.entries()) {
        const slot = slots[index]!;
        expect(thumbnail).toHaveStyle({
          left: `${slot.leftPercent}%`,
          top: `${slot.topPercent}%`,
        });
        expect(thumbnail.firstElementChild?.getAttribute('style')).toContain(
          `rotate(${slot.rotation}deg)`
        );
      }
      unmount();
    }
  });

  it('keeps the moving expansion visual inside the SVG middle layer', () => {
    const onExpandedChildContextMenu = vi.fn();
    const { container } = render(
      <FolderNode
        data={{
          children: [
            {
              id: 'child-a',
              type: 'card',
              data: { title: 'Inside' },
            },
          ],
          expansionChildren: [
            {
              child: {
                id: 'child-a',
                type: 'card',
                data: { title: 'Inside' },
              },
              folderId: 'folder-layered',
              motionCount: 1,
              motionOrder: 0,
              origin: {
                kind: 'peek',
                opacity: 1,
                peekIndex: 0,
                x: 40,
                y: 80,
                rotation: -5,
                scaleX: 0.3,
                scaleY: 0.45,
              },
              phase: 'open',
              target: { x: -120, y: -260, width: 180, height: 220 },
            },
          ],
          isExpanded: true,
          onExpandedChildContextMenu,
          title: 'Layered folder',
        }}
        height={280}
        id="folder-layered"
        width={280}
      />
    );

    const back = container.querySelector('[data-folder-layer="back"]');
    const middle = container.querySelector('[data-folder-layer="middle"]');
    const front = container.querySelector('[data-folder-layer="front"]');
    const movingVisual = container.querySelector(
      '[data-folder-expanded-visual-id="child-a"]'
    );

    expect(middle?.contains(movingVisual)).toBe(true);
    expect(back?.nextElementSibling).toBe(middle);
    expect(middle?.nextElementSibling).toBe(front);

    fireEvent.click(
      container.querySelector('[data-folder-child-id="child-a"]')!
    );
    expect(useCanvasStore.getState().focusedNode).toMatchObject({
      folderId: 'folder-layered',
      id: 'child-a',
      type: 'card',
    });

    fireEvent.contextMenu(movingVisual!);
    expect(onExpandedChildContextMenu).toHaveBeenCalledWith(
      expect.anything(),
      'folder-layered',
      expect.objectContaining({ id: 'child-a', type: 'card' })
    );
  });

  it('keeps closed-stack thumbnails visible under returning cards while closing', () => {
    const { container } = render(
      <FolderNode
        data={{
          children: [
            {
              id: 'child-a',
              type: 'card',
              data: { title: 'Inside' },
            },
          ],
          expansionChildren: [
            {
              child: {
                id: 'child-a',
                type: 'card',
                data: { title: 'Inside' },
              },
              folderId: 'folder-closing',
              motionCount: 1,
              motionOrder: 0,
              origin: {
                kind: 'peek',
                opacity: 1,
                peekIndex: 0,
                x: 40,
                y: 80,
                rotation: -5,
                scaleX: 0.3,
                scaleY: 0.45,
              },
              phase: 'closing',
              target: { x: -120, y: -260, width: 180, height: 220 },
            },
          ],
          isClosing: true,
          isExpanded: true,
          title: 'Closing folder',
        }}
        height={280}
        id="folder-closing"
        width={280}
      />
    );

    const thumb = container.querySelector(
      '[data-folder-thumbnail-id="child-a"] > div'
    );
    expect(thumb?.className).toContain('opacity-100');
    expect(thumb).toHaveStyle({
      width: '180px',
      height: '220px',
      transform: 'translate(-50%, -50%) scale(0.3, 0.45) rotate(-5deg)',
    });
    expect(
      container.querySelector('[data-folder-expanded-visual-id="child-a"]')
    ).toBeTruthy();
  });

  it('waits for every card in a two-row layout before removing the return layer', () => {
    const onCollapseComplete = vi.fn();
    const children = Array.from({ length: 7 }, (_, index) => ({
      id: `child-${index}`,
      type: 'card',
      data: { title: `Inside ${index}` },
    }));
    const expansionChildren = children.map((child, index) => ({
      child,
      folderId: 'folder-two-rows',
      motionCount: children.length,
      motionOrder: index,
      origin: {
        kind: index < 5 ? ('peek' as const) : ('hidden' as const),
        opacity: index < 5 ? 1 : 0,
        peekIndex: index < 5 ? index : null,
        x: 40 + index,
        y: 80 + index,
        rotation: index - 3,
        scaleX: 0.3,
        scaleY: 0.45,
      },
      phase: 'closing' as const,
      target: {
        x: -400 + index * 130,
        y: index < 4 ? -520 : -280,
        width: 180,
        height: 220,
      },
    }));
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });

    const { container } = render(
      <FolderNode
        data={{
          children,
          expansionChildren,
          isClosing: true,
          isExpanded: true,
          onCollapseComplete,
          title: 'Two-row folder',
        }}
        height={280}
        id="folder-two-rows"
        width={280}
      />
    );

    const returningCards = container.querySelectorAll('[data-folder-child-id]');
    expect(returningCards).toHaveLength(7);

    // The previous implementation treated the last array item as a barrier.
    // Finishing it first must no longer tear down the other six cards.
    fireEvent.transitionEnd(returningCards[6]!);
    expect(onCollapseComplete).not.toHaveBeenCalled();

    for (let index = 0; index < 6; index += 1) {
      fireEvent.transitionEnd(returningCards[index]!);
    }
    expect(onCollapseComplete).toHaveBeenCalledTimes(1);
    expect(onCollapseComplete).toHaveBeenCalledWith('folder-two-rows');

    fireEvent.transitionEnd(returningCards[0]!);
    expect(onCollapseComplete).toHaveBeenCalledTimes(1);
    requestAnimationFrameSpy.mockRestore();
  });

  it('hides closed-stack thumbnails while the folder is open', () => {
    const { container } = render(
      <FolderNode
        data={{
          children: [
            {
              id: 'child-a',
              type: 'card',
              data: { title: 'Inside' },
            },
          ],
          expansionChildren: [
            {
              child: {
                id: 'child-a',
                type: 'card',
                data: { title: 'Inside' },
              },
              folderId: 'folder-open',
              motionCount: 1,
              motionOrder: 0,
              origin: {
                kind: 'peek',
                opacity: 1,
                peekIndex: 0,
                x: 40,
                y: 80,
                rotation: -5,
                scaleX: 0.3,
                scaleY: 0.45,
              },
              phase: 'open',
              target: { x: -120, y: -260, width: 180, height: 220 },
            },
          ],
          isExpanded: true,
          title: 'Open folder',
        }}
        height={280}
        id="folder-open"
        width={280}
      />
    );

    const thumb = container.querySelector(
      '[data-folder-thumbnail-id="child-a"] > div'
    );
    expect(thumb?.className).toContain('opacity-0');
  });

  it('keeps folder details visible when hidden or used as a drop target', () => {
    const { container } = render(
      <FolderNode
        data={{
          isDropTarget: true,
          isHidden: true,
          subtitle: 'Hidden subtitle',
          title: 'Archive',
        }}
        id="folder-2"
      />
    );

    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(screen.getByText('Hidden subtitle')).toBeInTheDocument();
    // Folders are not resizable — no bottom-right resize control.
    expect(container.querySelector('.react-flow__resize-control')).toBeNull();
    expect(screen.queryByRole('button', { name: 'start resize' })).toBeNull();
  });

  it('renders the title as static text (no inline contentEditable)', () => {
    render(
      <FolderNode
        data={{
          subtitle: '12 children',
          title: 'Research',
        }}
        id="folder-3"
      />
    );

    const title = screen.getByText('Research');
    expect(title).not.toHaveAttribute('contenteditable', 'true');
  });

  it('dispatches a contextmenu event when the menu button is clicked', () => {
    render(
      <div className="react-flow__node">
        <FolderNode
          data={{
            subtitle: '12 children',
            title: 'Research',
          }}
          id="folder-3"
        />
      </div>
    );

    const node = document.querySelector('.react-flow__node');
    const contextMenuSpy = vi.fn();
    node?.addEventListener('contextmenu', contextMenuSpy);

    fireEvent.click(screen.getByRole('button', { name: 'Folder menu' }));

    expect(contextMenuSpy).toHaveBeenCalledTimes(1);
  });
});
