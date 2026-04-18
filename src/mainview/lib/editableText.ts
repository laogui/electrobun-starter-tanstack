const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DIV',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'LI',
  'MAIN',
  'NAV',
  'P',
  'PRE',
  'SECTION',
]);

const normalizeEditableText = (text: string): string =>
  text.replaceAll(/\r\n?/g, '\n').replaceAll('\u00a0', ' ');

const TRAILING_NEWLINE_RE = /\n$/;

const nodeToEditableText = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }

  if (!(node instanceof HTMLElement)) {
    return '';
  }

  if (node.tagName === 'BR') {
    return '\n';
  }

  const childText = Array.from(node.childNodes)
    .map(nodeToEditableText)
    .join('');
  if (!BLOCK_TAGS.has(node.tagName)) {
    return childText;
  }

  return childText === '\n' ? '\n' : `${childText}\n`;
};

export const editableElementToText = (element: HTMLElement): string => {
  if (typeof element.innerText === 'string') {
    return normalizeEditableText(element.innerText);
  }

  return normalizeEditableText(
    Array.from(element.childNodes).map(nodeToEditableText).join('')
  ).replace(TRAILING_NEWLINE_RE, '');
};
