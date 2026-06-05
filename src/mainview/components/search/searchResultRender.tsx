import { Fragment, type ReactNode } from 'react';

/**
 * Split `text` on case-insensitive occurrences of `query` and wrap each match
 * in a `<mark>` element so result rows can highlight the searched term.
 *
 * The matcher is intentionally simple (literal substring, not regex) to stay
 * well within the Phase 4 performance budget when rendering large result sets.
 * Overlapping matches are not possible because each scan advances past the end
 * of the previous hit.
 */
export function highlightMatches(text: string, query: string): ReactNode {
  const trimmed = query.trim();
  if (!(trimmed && text)) {
    return text;
  }

  const haystack = text.toLowerCase();
  const needle = trimmed.toLowerCase();
  const segments: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = haystack.indexOf(needle, cursor);
  let key = 0;

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      segments.push(
        <Fragment key={key++}>{text.slice(cursor, matchIndex)}</Fragment>
      );
    }
    const end = matchIndex + needle.length;
    segments.push(
      <mark
        className="rounded-[2px] bg-yellow-200 text-inherit dark:bg-yellow-400/30"
        key={key++}
      >
        {text.slice(matchIndex, end)}
      </mark>
    );
    cursor = end;
    matchIndex = haystack.indexOf(needle, cursor);
  }

  if (cursor < text.length) {
    segments.push(<Fragment key={key++}>{text.slice(cursor)}</Fragment>);
  }

  return segments;
}
