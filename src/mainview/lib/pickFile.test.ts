import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickFile } from '@/lib/pickFile';

class FakeInput extends EventTarget {
  accept = '';
  clicked = 0;
  files: File[] | null = null;
  type = '';
  click() {
    this.clicked += 1;
  }
}

const setup = () => {
  const input = new FakeInput();
  const focusTarget = new EventTarget();
  const promise = pickFile('image/*', {
    createInput: () => input as unknown as HTMLInputElement,
    focusGraceMs: 500,
    focusTarget,
  });
  return { focusTarget, input, promise };
};

describe('pickFile (file picker settles on every outcome)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with the chosen file on change', async () => {
    const { input, promise } = setup();
    expect(input.clicked).toBe(1);
    expect(input.accept).toBe('image/*');
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    input.files = [file];
    input.dispatchEvent(new Event('change'));
    await expect(promise).resolves.toBe(file);
  });

  it('resolves null on cancel instead of hanging', async () => {
    const { input, promise } = setup();
    input.dispatchEvent(new Event('cancel'));
    await expect(promise).resolves.toBeNull();
  });

  it('falls back to focus-return when the WebView never fires cancel', async () => {
    const { focusTarget, promise } = setup();
    focusTarget.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(500);
    await expect(promise).resolves.toBeNull();
  });

  it('prefers a change that lands just after focus returns', async () => {
    const { focusTarget, input, promise } = setup();
    focusTarget.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(100);
    const file = new File(['x'], 'b.png');
    input.files = [file];
    input.dispatchEvent(new Event('change'));
    vi.advanceTimersByTime(1000);
    await expect(promise).resolves.toBe(file);
  });
});
