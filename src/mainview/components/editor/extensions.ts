import type { Extensions } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';

export const buildEditorExtensions = (
  placeholder = 'Write something...'
): Extensions => [
  StarterKit.configure({
    codeBlock: {
      HTMLAttributes: { class: 'prose-code' },
    },
    link: false,
  }),
  TaskList.configure({
    HTMLAttributes: { class: 'tiptap-task-list' },
  }),
  TaskItem.configure({
    nested: true,
    HTMLAttributes: { class: 'tiptap-task-item' },
  }),
  Link.configure({
    autolink: true,
    linkOnPaste: true,
    openOnClick: false,
    HTMLAttributes: {
      rel: 'noopener',
    },
  }),
  Image.configure({
    allowBase64: true,
    HTMLAttributes: {
      loading: 'lazy',
    },
  }),
  Placeholder.configure({ placeholder }),
  Markdown.configure({
    indentation: { style: 'space', size: 2 },
    markedOptions: {
      breaks: false,
      gfm: true,
    },
  }),
];
