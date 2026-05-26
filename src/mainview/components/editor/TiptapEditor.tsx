import type { Editor } from '@tiptap/react';
import { EditorContent, useEditor } from '@tiptap/react';
import 'overlayscrollbars/overlayscrollbars.css';
import {
  Bold,
  CheckSquare,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Strikethrough,
} from 'lucide-react';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
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
  /** Optional override for where preview metadata updates are routed. */
  onPreviewUpdate?: (updates: Record<string, unknown>) => void;
  onTitleChange: (title: string) => void;
  title?: unknown;
}

const toText = (value: unknown): string =>
  typeof value === 'string' ? value : '';

interface ToolbarButtonProps {
  active?: boolean;
  disabled?: boolean;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  shortcut?: string;
}

function ToolbarButton({
  active,
  disabled,
  icon: Icon,
  label,
  onClick,
  shortcut,
}: ToolbarButtonProps) {
  return (
    <button
      aria-label={label}
      className={cn(
        'flex size-7 items-center justify-center rounded-md transition-colors',
        active
          ? 'bg-black/10 text-gray-900 dark:bg-white/20 dark:text-white'
          : 'text-gray-500 hover:bg-black/5 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200',
        disabled && 'pointer-events-none opacity-30'
      )}
      disabled={disabled}
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
      type="button"
    >
      <Icon size={15} />
    </button>
  );
}

function EditorToolbar({
  editor,
  isDark,
}: {
  editor: Editor;
  isDark: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-0.5 rounded-xl border px-2 py-1.5',
        isDark ? 'border-white/10 bg-white/5' : 'border-black/8 bg-black/[0.03]'
      )}
    >
      <ToolbarButton
        active={editor.isActive('bold')}
        icon={Bold}
        label="Bold"
        onClick={() => editor.chain().focus().toggleBold().run()}
        shortcut="⌘B"
      />
      <ToolbarButton
        active={editor.isActive('italic')}
        icon={Italic}
        label="Italic"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        shortcut="⌘I"
      />
      <ToolbarButton
        active={editor.isActive('strike')}
        icon={Strikethrough}
        label="Strikethrough"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        shortcut="⌘⇧X"
      />
      <ToolbarButton
        active={editor.isActive('code')}
        icon={Code}
        label="Inline code"
        onClick={() => editor.chain().focus().toggleCode().run()}
        shortcut="⌘E"
      />
      <div
        className={cn('mx-1 h-4 w-px', isDark ? 'bg-white/10' : 'bg-black/10')}
      />
      <ToolbarButton
        active={editor.isActive('heading', { level: 1 })}
        icon={Heading1}
        label="Heading 1"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarButton
        active={editor.isActive('heading', { level: 2 })}
        icon={Heading2}
        label="Heading 2"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        active={editor.isActive('heading', { level: 3 })}
        icon={Heading3}
        label="Heading 3"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />
      <div
        className={cn('mx-1 h-4 w-px', isDark ? 'bg-white/10' : 'bg-black/10')}
      />
      <ToolbarButton
        active={editor.isActive('bulletList')}
        icon={List}
        label="Bullet list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        active={editor.isActive('orderedList')}
        icon={ListOrdered}
        label="Ordered list"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        active={editor.isActive('taskList')}
        icon={CheckSquare}
        label="Task list"
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      />
    </div>
  );
}

export default function TiptapEditor({
  color,
  data,
  markdown,
  nodeId,
  noteId,
  onMarkdownChange,
  onPreviewUpdate,
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
    onPreviewUpdate,
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
      <OverlayScrollbarsComponent
        className="min-h-0 flex-1"
        defer
        options={{
          scrollbars: {
            theme: 'os-theme-dark',
            autoHide: 'never',
          },
          overflow: { x: 'hidden' },
        }}
      >
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
            <>
              <div className="sticky top-0 z-10 mb-4">
                <EditorToolbar editor={editor} isDark={isDark} />
              </div>
              <EditorContent
                className={cn(
                  'tiptap-editor prose prose-lg max-w-none',
                  isDark && 'prose-invert'
                )}
                editor={editor}
              />
            </>
          ) : (
            <div className="h-64 animate-pulse rounded-lg bg-black/5" />
          )}
        </div>
      </OverlayScrollbarsComponent>
    </div>
  );
}
