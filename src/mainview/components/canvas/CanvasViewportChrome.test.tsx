// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasViewportChrome } from '@/components/canvas/CanvasViewportChrome';

vi.mock('@xyflow/react', () => ({
  Controls: ({
    className,
    orientation,
  }: {
    className?: string;
    orientation?: string;
  }) => (
    <div
      className={className}
      data-orientation={orientation}
      data-testid="rf-controls"
    >
      Controls
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
  it('renders minimap and horizontal controls in one bottom-right panel', () => {
    render(
      <CanvasViewportChrome
        backgroundColor="#fff"
        maskColor="rgba(0,0,0,0.2)"
        nodeColor={() => '#ddd'}
        nodeStrokeColor="#999"
      />
    );

    const panel = screen.getByTestId('rf-panel');
    expect(panel).toHaveAttribute('data-position', 'bottom-right');
    expect(panel.className).toContain('canvas-viewport-chrome');
    expect(panel.className).toContain('canvas-floating-surface');
    expect(screen.getByTestId('rf-minimap')).toBeInTheDocument();
    expect(screen.getByTestId('rf-controls')).toHaveAttribute(
      'data-orientation',
      'horizontal'
    );
  });

  it('hides the minimap when showMinimap is false', () => {
    render(
      <CanvasViewportChrome
        backgroundColor="#fff"
        maskColor="rgba(0,0,0,0.2)"
        nodeColor={() => '#ddd'}
        nodeStrokeColor="#999"
        showMinimap={false}
      />
    );

    expect(screen.queryByTestId('rf-minimap')).not.toBeInTheDocument();
    expect(screen.getByTestId('rf-controls')).toBeInTheDocument();
    expect(screen.getByTestId('rf-panel').className).toContain(
      'canvas-viewport-chrome--controls-only'
    );
  });
});
