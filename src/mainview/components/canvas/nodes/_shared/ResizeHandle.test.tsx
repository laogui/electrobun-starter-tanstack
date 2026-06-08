// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ResizeHandle } from './ResizeHandle';

vi.mock('@xyflow/react', () => ({
  NodeResizeControl: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe('ResizeHandle', () => {
  it('renders the resize affordance without a keyboard-focusable control', () => {
    const { container } = render(
      <ResizeHandle
        hoverClassName="opacity-100"
        maxHeight={200}
        maxWidth={200}
        minHeight={80}
        minWidth={80}
        nodeId="node-1"
      />
    );

    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
