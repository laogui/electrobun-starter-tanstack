// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasViewportChrome } from '@/components/canvas/CanvasViewportChrome';

vi.mock('@xyflow/react', () => ({
  Controls: ({
    children,
    className,
    orientation,
  }: {
    children?: ReactNode;
    className?: string;
    orientation?: string;
  }) => (
    <div
      className={className}
      data-orientation={orientation}
      data-testid="rf-controls"
    >
      Controls
      {children}
    </div>
  ),
  MiniMap: () => <div data-testid="rf-minimap">MiniMap</div>,
  Panel: ({
    children,
    className,
    position,
  }: {
    children?: ReactNode;
    className?: string;
    position?: string;
  }) => (
    <div className={className} data-position={position} data-testid="rf-panel">
      {children}
    </div>
  ),
}));

describe('CanvasViewportChrome', () => {
  it('renders the expanded overview and requests collapse when clicked', () => {
    const onShowMinimapChange = vi.fn();
    render(
      <CanvasViewportChrome
        backgroundColor="#fff"
        maskColor="rgba(0,0,0,0.2)"
        nodeColor={() => '#ddd'}
        nodeStrokeColor="#999"
        onShowMinimapChange={onShowMinimapChange}
        showMinimap
      />
    );

    const panel = screen.getByTestId('rf-panel');
    expect(panel).toHaveAttribute('data-position', 'bottom-right');
    expect(panel.className).toContain('canvas-viewport-chrome');
    expect(panel.className).toContain('canvas-floating-surface');
    expect(screen.getByTestId('rf-minimap')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button'));
    expect(onShowMinimapChange).toHaveBeenCalledWith(false);
    expect(screen.getByTestId('rf-controls')).toHaveAttribute(
      'data-orientation',
      'horizontal'
    );
  });

  it('defaults to a collapsed overview and requests expansion when clicked', () => {
    const onShowMinimapChange = vi.fn();
    render(
      <CanvasViewportChrome
        backgroundColor="#fff"
        maskColor="rgba(0,0,0,0.2)"
        nodeColor={() => '#ddd'}
        nodeStrokeColor="#999"
        onShowMinimapChange={onShowMinimapChange}
      />
    );

    const toggle = screen.getByRole('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(onShowMinimapChange).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId('rf-minimap')).not.toBeInTheDocument();
    expect(screen.getByTestId('rf-controls')).toBeInTheDocument();
    expect(screen.getByTestId('rf-panel').className).toContain(
      'canvas-viewport-chrome--controls-only'
    );
  });
});
