/**
 * Topic outline → Markdown.
 *
 * This is a deliberately narrow projection: titles and hierarchy, nothing
 * else. Notes, stickies, media, plugin cards and ordinary connections are not
 * part of an outline, and the existing Note Markdown export keeps its own
 * separate behaviour.
 *
 * Shared between the renderer (which builds the outline) and the main process
 * (which writes the file), so it stays free of React Flow and DOM types.
 */

/** One Topic in the ordered forest handed to the exporter. */
export interface TopicOutlineEntry {
  children: readonly TopicOutlineEntry[];
  title: string;
}

export interface TopicOutlineMarkdownOptions {
  /** Heading placed above the list. Omitted when empty. */
  heading?: string;
}

const INDENT = '    ';
const NEWLINES_RE = /\r\n|\r|\n/g;
const COLLAPSE_SPACE_RE = /[\t\v\f\u0020\u00a0]{2,}/g;
/** Characters that change meaning mid-line in Markdown or open raw HTML. */
const INLINE_SPECIAL_RE = /[\\`*_[\]<>&|~]/g;
/** Constructs that only take effect at the start of a line. */
const LEADING_SPECIAL_RE = /^([#>+-]|\d+[.)])/;

/**
 * Render a title as literal text.
 *
 * A Topic title is plain text by contract, so anything that would be read as
 * formatting — or as raw HTML — is escaped rather than stripped: the exported
 * outline must show exactly what the canvas showed.
 */
export function escapeTopicTitle(title: string): string {
  const singleLine = title
    .replace(NEWLINES_RE, ' ')
    .replaceAll(COLLAPSE_SPACE_RE, ' ')
    .trim();
  const escaped = singleLine.replaceAll(
    INLINE_SPECIAL_RE,
    (char) => `\\${char}`
  );
  return escaped.replace(LEADING_SPECIAL_RE, (match) => `\\${match}`);
}

/**
 * Render the forest as a nested unordered list, four spaces per level.
 *
 * Order comes from the caller, which derives it from the tree model rather
 * than from screen position, so the same canvas always exports the same file.
 */
export function buildTopicOutlineMarkdown(
  roots: readonly TopicOutlineEntry[],
  options: TopicOutlineMarkdownOptions = {}
): string {
  const lines: string[] = [];
  if (options.heading) {
    lines.push(`# ${options.heading}`, '');
  }

  // Iterative so a deep imported outline cannot overflow the stack.
  const stack: Array<{ depth: number; entry: TopicOutlineEntry }> = [];
  for (let i = roots.length - 1; i >= 0; i -= 1) {
    stack.push({ depth: 0, entry: roots[i] as TopicOutlineEntry });
  }
  while (stack.length > 0) {
    const { depth, entry } = stack.pop() as {
      depth: number;
      entry: TopicOutlineEntry;
    };
    lines.push(`${INDENT.repeat(depth)}- ${escapeTopicTitle(entry.title)}`);
    for (let i = entry.children.length - 1; i >= 0; i -= 1) {
      stack.push({
        depth: depth + 1,
        entry: entry.children[i] as TopicOutlineEntry,
      });
    }
  }

  return `${lines.join('\n')}\n`;
}
