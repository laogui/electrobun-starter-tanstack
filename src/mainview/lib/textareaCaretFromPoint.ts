const MIRROR_STYLE_PROPS = [
  'boxSizing',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'textAlign',
  'textTransform',
  'wordSpacing',
] as const;

/**
 * Map a click in a textarea to a caret index. Falls back to the end when the
 * element has no layout (tests) or the point cannot be resolved.
 */
export function textareaCaretIndexFromPoint(
  textarea: HTMLTextAreaElement,
  clientX: number,
  clientY: number
): number {
  const value = textarea.value;
  if (value.length === 0) {
    return 0;
  }

  const rect = textarea.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return value.length;
  }

  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number
    ) => { offset: number; offsetNode: Node } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (typeof doc.caretPositionFromPoint === 'function') {
    const position = doc.caretPositionFromPoint(clientX, clientY);
    if (
      position &&
      (position.offsetNode === textarea ||
        textarea.contains(position.offsetNode))
    ) {
      return clampIndex(position.offset, value.length);
    }
  }
  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(clientX, clientY);
    if (
      range &&
      (range.startContainer === textarea ||
        textarea.contains(range.startContainer))
    ) {
      return clampIndex(range.startOffset, value.length);
    }
  }

  return caretIndexFromMirror(textarea, value, clientX, clientY, rect);
}

function clampIndex(index: number, length: number): number {
  if (index < 0) {
    return 0;
  }
  if (index > length) {
    return length;
  }
  return index;
}

function caretIndexFromMirror(
  textarea: HTMLTextAreaElement,
  value: string,
  clientX: number,
  clientY: number,
  rect: DOMRect
): number {
  const style = getComputedStyle(textarea);
  const mirror = document.createElement('div');
  mirror.setAttribute('aria-hidden', 'true');
  const mirrorStyle = mirror.style;
  mirrorStyle.position = 'absolute';
  mirrorStyle.visibility = 'hidden';
  mirrorStyle.whiteSpace = 'pre-wrap';
  mirrorStyle.wordWrap = 'break-word';
  mirrorStyle.overflow = 'auto';
  mirrorStyle.width = `${textarea.clientWidth}px`;
  mirrorStyle.height = `${textarea.clientHeight}px`;
  for (const prop of MIRROR_STYLE_PROPS) {
    mirrorStyle[prop] = style[prop];
  }
  document.body.append(mirror);

  const x = clientX - rect.left + textarea.scrollLeft;
  const y = clientY - rect.top + textarea.scrollTop;
  let low = 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    mirror.textContent = value.slice(0, mid);
    const marker = document.createElement('span');
    marker.textContent = value[mid] ?? '.';
    mirror.append(marker);
    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    const markerX = markerRect.left - mirrorRect.left + mirror.scrollLeft;
    const markerY = markerRect.top - mirrorRect.top + mirror.scrollTop;
    if (
      markerY + markerRect.height < y ||
      (markerY <= y && markerY + markerRect.height >= y && markerX <= x)
    ) {
      low = mid;
    } else {
      high = mid - 1;
    }
    marker.remove();
  }

  mirror.remove();
  return low;
}
