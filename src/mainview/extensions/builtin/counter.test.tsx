// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GhostBoardHostAPI } from '../../../shared/extensions/protocol';
import { counterCanvasType } from './counter';

function renderCounter(readOnly = false) {
  const updateState = vi.fn().mockResolvedValue(undefined);
  const host = { instance: { updateState } } as unknown as GhostBoardHostAPI;
  const Surface = counterCanvasType.CanvasSurface;
  const result = render(
    <Surface
      context={{
        height: 200,
        locale: 'en',
        readOnly,
        selected: false,
        surface: 'canvas',
        theme: 'light',
        width: 240,
      }}
      host={host}
      presentation={{ title: 'Counter' }}
      state={{ count: 5 }}
    />
  );
  return { ...result, updateState };
}

describe('counter canvas interactions', () => {
  it('leaves the background, title and value outside React Flow drag exclusions', () => {
    const { container } = renderCounter();

    // React Flow rejects a drag when the target or any ancestor has nodrag.
    for (const target of [
      container.firstElementChild,
      screen.getByText('Counter'),
      screen.getByText('5'),
    ]) {
      expect(target).not.toBeNull();
      expect(target?.closest('.nodrag')).toBeNull();
    }
  });

  it('isolates both buttons from dragging and panning while preserving updates', async () => {
    const { updateState } = renderCounter();
    const user = userEvent.setup();
    const buttons = screen.getAllByRole('button');

    for (const button of buttons) {
      const icon = button.querySelector('svg');
      expect(icon).not.toBeNull();
      expect(icon?.closest('.nodrag')).toBe(button);
      expect(icon?.closest('.nopan')).toBe(button);
      await user.click(button);
    }

    expect(updateState).toHaveBeenCalledTimes(2);
    expect(updateState).toHaveBeenNthCalledWith(1, {
      history: 'record',
      state: { count: 4 },
    });
    expect(updateState).toHaveBeenNthCalledWith(2, {
      history: 'record',
      state: { count: 6 },
    });
  });

  it('keeps read-only controls disabled', async () => {
    const { updateState } = renderCounter(true);
    const user = userEvent.setup();
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
      await user.click(button);
    }
    expect(updateState).not.toHaveBeenCalled();
  });
});
