// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TiptapEditor from './TiptapEditor';

const mocks = vi.hoisted(() => ({
  buildTextNoteFrontmatter: vi.fn(() => ({
    id: 'note-1',
    title: 'Alpha',
    displayHint: 'note',
  })),
  editor: {
    commands: {
      setContent: vi.fn(),
    },
    getMarkdown: vi.fn(),
  },
  flushNow: vi.fn(),
  latestUseEditorOptions: undefined as any,
  saveNoteDebounced: vi.fn(),
  useEditor: vi.fn(),
  useNoteSaver: vi.fn(),
}));

vi.mock('@tiptap/react', () => ({
  EditorContent: ({ className }: { className?: string }) => (
    <div className={className} data-testid="editor-content" />
  ),
  useEditor: (options: any) => {
    mocks.latestUseEditorOptions = options;
    return mocks.useEditor(options);
  },
}));

vi.mock('@/hooks/useNoteSaver', () => ({
  buildTextNoteFrontmatter: mocks.buildTextNoteFrontmatter,
  useNoteSaver: mocks.useNoteSaver,
}));

describe('TiptapEditor', () => {
  beforeEach(() => {
    mocks.editor.commands.setContent.mockReset();
    mocks.editor.getMarkdown.mockReset();
    mocks.editor.getMarkdown.mockReturnValue('# Alpha');
    mocks.flushNow.mockReset();
    mocks.saveNoteDebounced.mockReset();
    mocks.useEditor.mockReset();
    mocks.useEditor.mockReturnValue(mocks.editor);
    mocks.useNoteSaver.mockReset();
    mocks.useNoteSaver.mockReturnValue({
      flushNow: mocks.flushNow,
      saveNoteDebounced: mocks.saveNoteDebounced,
    });
    mocks.latestUseEditorOptions = undefined;
  });

  it('initializes Tiptap with markdown content and renders title input', () => {
    render(
      <TiptapEditor
        color="#FFFFFF"
        data={{ color: '#FFFFFF' }}
        markdown="# Alpha"
        nodeId="node-1"
        noteId="note-1"
        onMarkdownChange={vi.fn()}
        onTitleChange={vi.fn()}
        title="Alpha"
      />
    );

    expect(mocks.latestUseEditorOptions).toMatchObject({
      content: '# Alpha',
      contentType: 'markdown',
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
    });
    expect(screen.getByRole('textbox', { name: 'Note title' })).toHaveValue(
      'Alpha'
    );
    expect(screen.getByTestId('editor-content')).toHaveClass('tiptap-editor');
  });

  it('propagates title changes and queues a note save', () => {
    const onTitleChange = vi.fn();

    render(
      <TiptapEditor
        color="#FFFFFF"
        data={{ color: '#FFFFFF' }}
        markdown="# Alpha"
        nodeId="node-1"
        noteId="note-1"
        onMarkdownChange={vi.fn()}
        onTitleChange={onTitleChange}
        title="Alpha"
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Note title' }), {
      target: { value: 'Beta' },
    });

    expect(onTitleChange).toHaveBeenCalledWith('Beta');
    expect(mocks.saveNoteDebounced).toHaveBeenCalledWith('# Alpha');
  });

  it('propagates editor updates and flushes on blur', () => {
    const onMarkdownChange = vi.fn();
    render(
      <TiptapEditor
        color="#FFFFFF"
        data={{ color: '#FFFFFF' }}
        markdown="# Alpha"
        nodeId="node-1"
        noteId="note-1"
        onMarkdownChange={onMarkdownChange}
        onTitleChange={vi.fn()}
        title="Alpha"
      />
    );

    mocks.editor.getMarkdown.mockReturnValue('## Updated');
    act(() => {
      mocks.latestUseEditorOptions.onUpdate({ editor: mocks.editor });
    });

    expect(onMarkdownChange).toHaveBeenCalledWith('## Updated');
    expect(mocks.saveNoteDebounced).toHaveBeenCalledWith('## Updated');

    mocks.editor.getMarkdown.mockReturnValue('## Final');
    act(() => {
      mocks.latestUseEditorOptions.onBlur({ editor: mocks.editor });
    });

    expect(mocks.flushNow).toHaveBeenCalledWith('## Final');
  });

  it('sets new markdown content when the prop changes externally', () => {
    const { rerender } = render(
      <TiptapEditor
        color="#FFFFFF"
        data={{ color: '#FFFFFF' }}
        markdown="# Alpha"
        nodeId="node-1"
        noteId="note-1"
        onMarkdownChange={vi.fn()}
        onTitleChange={vi.fn()}
        title="Alpha"
      />
    );

    mocks.editor.getMarkdown.mockReturnValue('# Alpha');

    rerender(
      <TiptapEditor
        color="#FFFFFF"
        data={{ color: '#FFFFFF' }}
        markdown="# Beta"
        nodeId="node-1"
        noteId="note-1"
        onMarkdownChange={vi.fn()}
        onTitleChange={vi.fn()}
        title="Alpha"
      />
    );

    expect(mocks.editor.commands.setContent).toHaveBeenCalledWith('# Beta', {
      contentType: 'markdown',
    });
  });
});
