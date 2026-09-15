/**
 * Deterministic text measurement for Topic auto-sizing.
 *
 * Measuring happens in a detached element outside the zoomed React Flow pane,
 * so results are CSS pixels at zoom 1 — which is exactly the canvas' logical
 * unit. Measuring inside the transformed pane would bake the current zoom into
 * the persisted size.
 *
 * The measuring element copies the Topic's real typography (the
 * `text-sm/snug` values used by `.topic-title` and the editor textarea), so
 * font, weight, line-height, and CJK/Latin line-breaking all behave the same as
 * the rendered node.
 */

import {
  TOPIC_MAX_WIDTH,
  TOPIC_MIN_HEIGHT,
  TOPIC_MIN_WIDTH,
  TOPIC_PADDING_X,
  TOPIC_PADDING_Y,
} from '../../shared/topic';
import type { Size } from './collision';

/**
 * `.topic-body` draws a 1px border on every side (box-sizing: border-box), so
 * the text area inside the node is narrower and shorter than the node box by
 * two borders. Measurement must budget for it, or a title that just fits the
 * measured width re-wraps inside the node and its last line clips.
 */
const TOPIC_BODY_BORDER = 1;

const CHROME_X = TOPIC_PADDING_X * 2 + TOPIC_BODY_BORDER * 2;
const CHROME_Y = TOPIC_PADDING_Y * 2 + TOPIC_BODY_BORDER * 2;
const CONTENT_MAX_WIDTH = TOPIC_MAX_WIDTH - CHROME_X;

let measureEl: HTMLDivElement | null = null;

function getMeasureElement(): HTMLDivElement | null {
  if (typeof document === 'undefined') {
    return null;
  }
  if (measureEl?.isConnected) {
    return measureEl;
  }
  const el = document.createElement('div');
  el.className = 'topic-measure';
  el.setAttribute('aria-hidden', 'true');
  el.style.position = 'absolute';
  el.style.top = '-9999px';
  el.style.left = '-9999px';
  el.style.visibility = 'hidden';
  el.style.pointerEvents = 'none';
  el.style.width = 'max-content';
  el.style.maxWidth = `${CONTENT_MAX_WIDTH}px`;
  el.style.whiteSpace = 'pre-wrap';
  el.style.overflowWrap = 'break-word';
  // Mirror the `text-sm/snug` utilities on `.topic-title` and the editor
  // textarea. The element would otherwise inherit the body font (16px), which
  // wraps earlier than the rendered 14px title and overestimates the size.
  el.style.fontSize = '0.875rem';
  el.style.lineHeight = '1.375';
  document.body.append(el);
  measureEl = el;
  return el;
}

/** Fallback used in non-DOM environments (unit tests, Bun-side projections). */
function estimateSize(title: string): Size {
  // Rough per-character advance; CJK is roughly a full em, Latin about half.
  let advance = 0;
  for (const char of title) {
    advance += char.codePointAt(0)! > 0x2e_7f ? 14 : 7.2;
  }
  const contentWidth = Math.min(CONTENT_MAX_WIDTH, Math.ceil(advance));
  const lines = Math.max(1, Math.ceil(advance / CONTENT_MAX_WIDTH));
  return {
    width: clampTopicWidth(contentWidth + CHROME_X),
    height: Math.max(TOPIC_MIN_HEIGHT, lines * 20 + CHROME_Y),
  };
}

function clampTopicWidth(width: number): number {
  return Math.min(TOPIC_MAX_WIDTH, Math.max(TOPIC_MIN_WIDTH, Math.ceil(width)));
}

/**
 * Size a Topic node needs to show `title` in full.
 *
 * Grows to `TOPIC_MAX_WIDTH`, then wraps and grows in height. The result is
 * rounded to whole units so repeated measurements of the same title produce
 * byte-identical sizes and cannot oscillate between saves.
 */
export function measureTopicSize(title: string): Size {
  const el = getMeasureElement();
  if (!el) {
    return estimateSize(title);
  }
  // A trailing space would otherwise collapse and under-measure the caret row.
  el.textContent = title.length > 0 ? title : ' ';
  const width = clampTopicWidth(el.scrollWidth + CHROME_X);
  const height = Math.max(
    TOPIC_MIN_HEIGHT,
    Math.ceil(el.scrollHeight + CHROME_Y)
  );
  return { width, height };
}

/** Test seam: drop the cached measuring element. */
export function resetTopicMeasureCache(): void {
  measureEl?.remove();
  measureEl = null;
}
