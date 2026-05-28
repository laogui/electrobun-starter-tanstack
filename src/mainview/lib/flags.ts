/**
 * Feature flags for the editor / preview pipeline.
 *
 * `focusedNoteEditor` gates whether the focused text note opens any
 * rich-text editor at all. Today it always resolves to BlockNote — the
 * Tiptap engine has been removed (see
 * `docs/features/Planned/blocknote-ai-migration-plan.md`).
 */
export const FLAGS = {
  markdownPreview: true,
  focusedNoteEditor: true,
  blocknoteMarkdownMirror: true,
} as const;
