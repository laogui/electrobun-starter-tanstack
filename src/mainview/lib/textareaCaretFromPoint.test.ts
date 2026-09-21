// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { textareaCaretIndexFromPoint } from '@/lib/textareaCaretFromPoint';

describe('textareaCaretIndexFromPoint', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('returns 0 for an empty textarea', () => {
    const textarea = document.createElement('textarea');
    document.body.append(textarea);
    expect(textareaCaretIndexFromPoint(textarea, 10, 10)).toBe(0);
  });

  it('falls back to the end when the textarea has no layout', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'hello world';
    document.body.append(textarea);
    expect(textareaCaretIndexFromPoint(textarea, 4, 4)).toBe(11);
  });
});
