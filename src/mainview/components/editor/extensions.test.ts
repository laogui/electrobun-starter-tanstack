// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import { buildEditorExtensions } from './extensions';

describe('buildEditorExtensions', () => {
  it('round-trips the committed markdown subset through Tiptap', () => {
    const editor = new Editor({
      content:
        '# Heading\n\n- [x] Done\n- [ ] Todo\n\n![Alt](https://example.com/a.png)',
      contentType: 'markdown',
      extensions: buildEditorExtensions(),
    });

    expect(JSON.stringify(editor.getJSON())).toContain('heading');
    expect(JSON.stringify(editor.getJSON())).toContain('taskList');
    expect(JSON.stringify(editor.getJSON())).toContain('image');

    const markdown = editor.getMarkdown();
    expect(markdown).toContain('# Heading');
    expect(markdown).toContain('- [x] Done');
    expect(markdown).toContain('- [ ] Todo');
    expect(markdown).toContain('![Alt](https://example.com/a.png)');

    editor.destroy();
  });
});
