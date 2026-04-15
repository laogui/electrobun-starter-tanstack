// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const createNodeMock = vi.fn();

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (
    selector: (state: { createNode: typeof createNodeMock }) => unknown
  ) => selector({ createNode: createNodeMock }),
}));

import { useNodeCreation } from '@/hooks/useNodeCreation';

const Harness = ({
  current,
  type,
}: {
  current: { getViewport: () => { x: number; y: number; zoom: number } } | null;
  type: 'card' | 'folder';
}) => {
  const rfInstance = { current };
  const { onCreateNode } = useNodeCreation({ rfInstance });

  return (
    <button
      type='button'
      onClick={() => {
        onCreateNode(type);
      }}
    >
      create
    </button>
  );
};

describe('useNodeCreation', () => {
  it('passes card type and rfInstance.current to store createNode', () => {
    const instance = {
      getViewport: () => ({ x: 10, y: 20, zoom: 1.5 }),
    };

    render(<Harness current={instance} type='card' />);
    screen.getByRole('button', { name: 'create' }).click();

    expect(createNodeMock).toHaveBeenCalledWith('card', instance);
  });

  it('stays stable when rfInstance.current is null', () => {
    render(<Harness current={null} type='folder' />);
    screen.getByRole('button', { name: 'create' }).click();

    expect(createNodeMock).toHaveBeenCalledWith('folder', null);
  });
});
