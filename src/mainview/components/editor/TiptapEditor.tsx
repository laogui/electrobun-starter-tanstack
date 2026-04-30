import { EditorContent, useEditor } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { buildTextNoteFrontmatter, useNoteSaver } from '@/hooks/useNoteSaver';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { cn } from '@/lib/utils';

import { buildEditorExtensions } from './extensions';

interface TiptapEditorProps {
  color?: unknown;
  data: Record<string, unknown>;
  markdown?: unknown;
  nodeId: string;
  noteId?: unknown;
  onMarkdownChange: (markdown: string) => void;
  onTitleChange: (title: string) => void;
  title?: unknown;
}

const toText = (value: unknown): string =>
  typeof value === 'string' ? value : '';

export default function TiptapEditor({
  color,
  data,
  markdown,
  nodeId,
  noteId,
  onMarkdownChange,
  onTitleChange,
  title,
}: TiptapEditorProps) {
  const initialMarkdown = toText(markdown);
  const [titleValue, setTitleValue] = useState(toText(title));
  const latestMarkdownRef = useRef(initialMarkdown);
  const colorValue = typeof color === 'string' ? color : '#FFFFFF';
  const isDark = isColorDark(colorValue);
  const extensions = useMemo(() => buildEditorExtensions(), []);
  const frontmatter = useMemo(
    () =>
      typeof noteId === 'string'
        ? buildTextNoteFrontmatter(noteId, data, titleValue)
        : { title: titleValue, displayHint: 'note' },
    [data, noteId, titleValue]
  );
  const { flushNow, saveNoteDebounced } = useNoteSaver({
    enabled: typeof noteId === 'string',
    frontmatter,
    nodeId,
    noteId,
  });

  const handleMarkdownChange = useCallback(
    (nextMarkdown: string) => {
      latestMarkdownRef.current = nextMarkdown;
      onMarkdownChange(nextMarkdown);
      saveNoteDebounced(nextMarkdown);
    },
    [onMarkdownChange, saveNoteDebounced]
  );

  const editor = useEditor({
    content: initialMarkdown,
    contentType: 'markdown',
    extensions,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    onBlur: ({ editor }) => {
      const nextMarkdown = editor.getMarkdown();
      latestMarkdownRef.current = nextMarkdown;
      flushNow(nextMarkdown);
    },
    onUpdate: ({ editor }) => {
      handleMarkdownChange(editor.getMarkdown());
    },
  });

  useEffect(() => {
    setTitleValue(toText(title));
  }, [title]);

  useEffect(() => {
    const nextMarkdown = toText(markdown);
    latestMarkdownRef.current = nextMarkdown;
    if (!editor || editor.getMarkdown() === nextMarkdown) {
      return;
    }
    editor.commands.setContent(nextMarkdown, { contentType: 'markdown' });
  }, [editor, markdown]);

  const handleTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextTitle = event.target.value;
    setTitleValue(nextTitle);
    onTitleChange(nextTitle);
    saveNoteDebounced(latestMarkdownRef.current);
  };

  const handleTitleBlur = () => {
    flushNow(latestMarkdownRef.current);
  };

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col',
        isDark ? 'text-white' : 'text-gray-900'
      )}
      style={colorToStyle(colorValue)}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-8 py-12 sm:px-12">
          <input
            aria-label="Note title"
            className={cn(
              'mb-6 w-full border-none bg-transparent font-bold text-4xl tracking-normal outline-none placeholder:opacity-40',
              isDark ? 'placeholder:text-white' : 'placeholder:text-gray-600'
            )}
            onBlur={handleTitleBlur}
            onChange={handleTitleChange}
            placeholder="Untitled"
            value={titleValue}
          />
          {editor ? (
            <EditorContent
              className={cn(
                'tiptap-editor prose prose-lg max-w-none',
                isDark && 'prose-invert'
              )}
              editor={editor}
            />
          ) : (
            <div className="h-64 animate-pulse rounded-lg bg-black/5" />
          )}
        </div>
      </div>
    </div>
  );
}
