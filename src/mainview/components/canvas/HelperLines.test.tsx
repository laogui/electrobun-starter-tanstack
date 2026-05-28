// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const viewportMock = vi.hoisted(() => vi.fn());

vi.mock('@xyflow/react', () => ({
  useViewport: viewportMock,
}));

import { HelperLines } from '@/components/canvas/HelperLines';

describe('HelperLines', () => {
  it('renders nothing when no helper lines are provided', () => {
    viewportMock.mockReturnValue({ x: 10, y: 20, zoom: 2 });

    const { container } = render(<HelperLines />);

    expect(container.firstChild).toBeNull();
  });

  it('renders vertical and horizontal guide lines using viewport transform', () => {
    viewportMock.mockReturnValue({ x: 10, y: 20, zoom: 2 });

    const { container } = render(<HelperLines horizontal={4} vertical={3} />);

    expect(screen.getByText('Helper alignment lines')).toBeInTheDocument();

    const lines = container.querySelectorAll('line');
    expect(lines).toHaveLength(2);
    expect(lines[0]?.getAttribute('x1')).toBe('16');
    expect(lines[0]?.getAttribute('x2')).toBe('16');
    expect(lines[1]?.getAttribute('y1')).toBe('28');
    expect(lines[1]?.getAttribute('y2')).toBe('28');
  });
});
