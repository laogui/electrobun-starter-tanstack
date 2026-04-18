import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';

export const markdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
}).use(taskLists, { enabled: false });

export const renderMarkdownToHtml = (source: string): string =>
  markdownIt.render(source);
