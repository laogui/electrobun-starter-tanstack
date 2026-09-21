// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { memo } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nodeRenderPropsEqual } from './nodeRenderPropsEqual';

afterEach(cleanup);

describe('node content rendering', () => {
  it('skips coordinate-only frames, but renders content and interaction changes', () => {
    const renderContent = vi.fn();
    const Content = memo((props: Record<string, unknown>) => {
      renderContent(props);
      return null;
    }, nodeRenderPropsEqual);
    let props = {
      data: { title: 'Note' },
      dragging: true,
      height: 200,
      id: 'note',
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
      selected: false,
      width: 300,
    };
    const { rerender } = render(<Content {...props} />);
    for (let frame = 1; frame <= 60; frame += 1) {
      props = { ...props, positionAbsoluteX: frame, positionAbsoluteY: frame };
      rerender(<Content {...props} />);
    }
    expect(renderContent).toHaveBeenCalledTimes(1);
    for (const change of [
      { data: { title: 'Edited' } },
      { selected: true },
      { dragging: false },
      { width: 350 },
      { height: 250 },
    ]) {
      props = { ...props, ...change };
      rerender(<Content {...props} />);
    }
    expect(renderContent).toHaveBeenCalledTimes(6);
  });
});
