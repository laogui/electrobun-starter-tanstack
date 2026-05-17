// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDocumentKeyboard } from '@/hooks/useDocumentKeyboard';
import { useCanvasStore } from '@/store/canvasStore';

const TestComponent = () => {
  useDocumentKeyboard();
  return <div>document-keyboard</div>;
};

const dispatchKeyboard = (eventInit: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, ...eventInit });
  globalThis.dispatchEvent(event);
  return event;
};

describe('useDocumentKeyboard', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
    useCanvasStore.setState({ searchOpen: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('toggles search with Cmd/Ctrl+K and Cmd/Ctrl+F', () => {
    render(<TestComponent />);

    dispatchKeyboard({ key: 'k', metaKey: true, cancelable: true });
    expect(useCanvasStore.getState().searchOpen).toBe(true);

    dispatchKeyboard({ key: 'f', ctrlKey: true, cancelable: true });
    expect(useCanvasStore.getState().searchOpen).toBe(false);
  });

  it('ignores non-modifier shortcuts', () => {
    render(<TestComponent />);

    dispatchKeyboard({ key: 'k' });
    dispatchKeyboard({ key: 'f' });

    expect(useCanvasStore.getState().searchOpen).toBe(false);
  });

  it('opens search on open-search custom event', () => {
    render(<TestComponent />);

    globalThis.dispatchEvent(new Event('open-search'));

    expect(useCanvasStore.getState().searchOpen).toBe(true);
  });

  it('cleans up keyboard and custom event listeners on unmount', () => {
    const removeSpy = vi.spyOn(globalThis, 'removeEventListener');
    const view = render(<TestComponent />);

    view.unmount();

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('open-search', expect.any(Function));
  });
});
