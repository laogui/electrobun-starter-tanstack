import { describe, expect, it } from 'vitest';

import {
  buildTopicOutlineMarkdown,
  escapeTopicTitle,
  type TopicOutlineEntry,
} from './topicMarkdownExport';

function entry(
  title: string,
  children: TopicOutlineEntry[] = []
): TopicOutlineEntry {
  return { children, title };
}

describe('escapeTopicTitle', () => {
  it('keeps Markdown syntax as literal text', () => {
    expect(escapeTopicTitle('**bold** and _em_')).toBe(
      '\\*\\*bold\\*\\* and \\_em\\_'
    );
    expect(escapeTopicTitle('a [link](url)')).toBe('a \\[link\\](url)');
    expect(escapeTopicTitle('back\\slash')).toBe('back\\\\slash');
  });

  it('keeps raw HTML from being rendered', () => {
    expect(escapeTopicTitle('<script>alert(1)</script>')).toBe(
      '\\<script\\>alert(1)\\</script\\>'
    );
    expect(escapeTopicTitle('a & b')).toBe('a \\& b');
  });

  it('escapes line-leading constructs only where they matter', () => {
    expect(escapeTopicTitle('# not a heading')).toBe('\\# not a heading');
    expect(escapeTopicTitle('1. not a list')).toBe('\\1. not a list');
    // Mid-title the same characters are ordinary text.
    expect(escapeTopicTitle('step 1. done')).toBe('step 1. done');
  });

  it('collapses newlines so a title stays one list item', () => {
    expect(escapeTopicTitle('first\nsecond\r\nthird')).toBe(
      'first second third'
    );
  });
});

describe('buildTopicOutlineMarkdown', () => {
  it('indents four spaces per level', () => {
    const markdown = buildTopicOutlineMarkdown([
      entry('Root', [entry('Child', [entry('Grandchild')])]),
    ]);
    expect(markdown).toBe('- Root\n    - Child\n        - Grandchild\n');
  });

  it('emits roots and children in the order it was given', () => {
    const markdown = buildTopicOutlineMarkdown([
      entry('A', [entry('A1'), entry('A2')]),
      entry('B'),
    ]);
    expect(markdown).toBe('- A\n    - A1\n    - A2\n- B\n');
  });

  it('prepends a heading when one is supplied', () => {
    expect(
      buildTopicOutlineMarkdown([entry('Root')], { heading: 'My Canvas' })
    ).toBe('# My Canvas\n\n- Root\n');
  });

  it('handles a deep outline without recursing', () => {
    let deepest = entry('leaf');
    for (let i = 0; i < 5000; i += 1) {
      deepest = entry(`level-${i}`, [deepest]);
    }
    expect(() => buildTopicOutlineMarkdown([deepest])).not.toThrow();
  });
});
