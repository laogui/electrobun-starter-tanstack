// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { editableElementToText } from './editableText';

describe('editableElementToText', () => {
  it('preserves explicit newline characters in text nodes', () => {
    const element = document.createElement('div');
    element.textContent = 'alpha\nbeta';

    expect(editableElementToText(element)).toBe('alpha\nbeta');
  });

  it('converts contentEditable block elements to markdown newlines', () => {
    const element = document.createElement('div');
    element.innerHTML = '<div># Heading</div><div></div><div>Body</div>';

    expect(editableElementToText(element)).toBe('# Heading\n\nBody');
  });

  it('converts br elements to newlines', () => {
    const element = document.createElement('div');
    element.innerHTML = 'alpha<br>beta';

    expect(editableElementToText(element)).toBe('alpha\nbeta');
  });
});
