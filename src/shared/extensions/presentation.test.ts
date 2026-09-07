import { describe, expect, it } from 'vitest';

import {
  PRESENTATION_PLAIN_TEXT_MAX,
  sanitizePresentation,
} from './presentation';

describe('sanitizePresentation', () => {
  it('keeps plain text and a hex accent color', () => {
    expect(
      sanitizePresentation({
        title: 'Counter',
        subtitle: '3',
        plainText: 'Count: 3',
        accentColor: '#3366FF',
        accessibilityLabel: 'Counter at 3',
      })
    ).toEqual({
      title: 'Counter',
      subtitle: '3',
      plainText: 'Count: 3',
      accentColor: '#3366FF',
      accessibilityLabel: 'Counter at 3',
    });
  });

  it('strips markup and rejects non-hex colors', () => {
    expect(
      sanitizePresentation({
        title: '<b>Unsafe</b>',
        subtitle: '<script>alert(1)</script>hi',
        plainText: 'ok',
        accentColor: 'red',
        accessibilityLabel: '<style>.hidden { color: red; }</style>Safe',
      })
    ).toEqual({
      title: 'Unsafe',
      subtitle: 'hi',
      plainText: 'ok',
      accessibilityLabel: 'Safe',
    });
  });

  it('truncates plainText to the budget', () => {
    const result = sanitizePresentation({
      title: 'Big',
      plainText: 'x'.repeat(PRESENTATION_PLAIN_TEXT_MAX + 40),
    });
    expect(result.plainText).toHaveLength(PRESENTATION_PLAIN_TEXT_MAX);
  });

  it('falls back to an empty title for garbage input', () => {
    expect(sanitizePresentation(null)).toEqual({ title: '' });
    expect(sanitizePresentation('nope')).toEqual({ title: '' });
  });
});
