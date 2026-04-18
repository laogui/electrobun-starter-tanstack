declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it';

  export interface MarkdownItTaskListsOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }

  const taskLists: MarkdownIt.PluginWithOptions<MarkdownItTaskListsOptions>;
  export default taskLists;
}
