// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { highlightMatches } from './searchResultRender';

function renderNode(node: React.ReactNode) {
  return render(<div data-testid="host">{node}</div>);
}

describe('highlightMatches', () => {
  it('returns the original text when the query is empty', () => {
    const { getByTestId } = renderNode(highlightMatches('Hello world', '  '));
    const host = getByTestId('host');
    expect(host.textContent).toBe('Hello world');
    expect(host.querySelector('mark')).toBeNull();
  });

  it('wraps a case-insensitive match in a <mark>', () => {
    const { getByTestId } = renderNode(
      highlightMatches('Hello World', 'world')
    );
    const host = getByTestId('host');
    const marks = host.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe('World');
    expect(host.textContent).toBe('Hello World');
  });

  it('highlights every occurrence of the query', () => {
    const { getByTestId } = renderNode(
      highlightMatches('tan tan tango', 'tan')
    );
    const host = getByTestId('host');
    expect(host.querySelectorAll('mark')).toHaveLength(3);
    expect(host.textContent).toBe('tan tan tango');
  });

  it('returns text unchanged when there is no match', () => {
    const { getByTestId } = renderNode(highlightMatches('Hello', 'zzz'));
    const host = getByTestId('host');
    expect(host.querySelector('mark')).toBeNull();
    expect(host.textContent).toBe('Hello');
  });
});
