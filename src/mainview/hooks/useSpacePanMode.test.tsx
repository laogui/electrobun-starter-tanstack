// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  useEditableInteractionLock,
  useSpacePanMode,
} from '@/hooks/useSpacePanMode';

const Harness = () => {
  const active = useSpacePanMode();
  return <div data-testid="space-pan">{active ? 'active' : 'inactive'}</div>;
};

const EditableLockHarness = () => {
  const active = useEditableInteractionLock();
  return (
    <div data-testid="editable-lock">{active ? 'locked' : 'unlocked'}</div>
  );
};

describe('useSpacePanMode', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('tracks space keydown and keyup', () => {
    render(<Harness />);

    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(screen.getByTestId('space-pan').textContent).toBe('active');

    fireEvent.keyUp(window, { code: 'Space', key: ' ' });
    expect(screen.getByTestId('space-pan').textContent).toBe('inactive');
  });

  it('ignores space while editing text', () => {
    render(
      <>
        <input aria-label="Title" />
        <Harness />
      </>
    );
    screen.getByLabelText('Title').focus();

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'Space',
      key: ' ',
    });
    screen.getByLabelText('Title').dispatchEvent(event);

    expect(screen.getByTestId('space-pan').textContent).toBe('inactive');
    expect(event.defaultPrevented).toBe(false);
  });

  it('prevents editable elements from taking focus while space pan is active', () => {
    render(
      <>
        <input aria-label="Title" />
        <Harness />
      </>
    );

    fireEvent.keyDown(window, { code: 'Space', key: ' ' });

    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    screen.getByLabelText('Title').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByTestId('space-pan').textContent).toBe('active');
  });

  it('prevents contenteditable surfaces from taking focus while space pan is active', () => {
    render(
      <>
        <div contentEditable suppressContentEditableWarning>
          Body
        </div>
        <Harness />
      </>
    );

    fireEvent.keyDown(window, { code: 'Space', key: ' ' });

    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    screen.getByText('Body').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByTestId('space-pan').textContent).toBe('active');
  });

  it('prevents repeated space key events from writing into an editable target during pan', () => {
    render(
      <>
        <input aria-label="Title" />
        <Harness />
      </>
    );

    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    screen.getByLabelText('Title').focus();

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'Space',
      key: ' ',
      repeat: true,
    });
    screen.getByLabelText('Title').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByTestId('space-pan').textContent).toBe('active');
  });

  it('resets when the window loses focus', () => {
    render(<Harness />);

    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(screen.getByTestId('space-pan').textContent).toBe('active');

    fireEvent.blur(window);
    expect(screen.getByTestId('space-pan').textContent).toBe('inactive');
  });
});

describe('useEditableInteractionLock', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('locks canvas dragging while an input has focus', () => {
    render(
      <>
        <input aria-label="Checklist item" />
        <EditableLockHarness />
      </>
    );

    fireEvent.focusIn(screen.getByLabelText('Checklist item'));
    expect(screen.getByTestId('editable-lock').textContent).toBe('locked');

    fireEvent.focusOut(screen.getByLabelText('Checklist item'), {
      relatedTarget: document.body,
    });
    expect(screen.getByTestId('editable-lock').textContent).toBe('unlocked');
  });

  it('locks canvas dragging while contenteditable has focus', () => {
    render(
      <>
        <div contentEditable suppressContentEditableWarning>
          Card body
        </div>
        <EditableLockHarness />
      </>
    );

    fireEvent.focusIn(screen.getByText('Card body'));
    expect(screen.getByTestId('editable-lock').textContent).toBe('locked');
  });
});
