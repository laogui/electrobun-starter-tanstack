/**
 * Deterministic text measurement for Topic auto-sizing.
 *
 * Measuring happens in a detached element outside the zoomed React Flow pane,
 * so results are CSS pixels at zoom 1 — which is exactly the canvas' logical
 * unit. Measuring inside the transformed pane would bake the current zoom into
 * the persisted size.
 *
 * The measuring element copies the Topic's real typography from a CSS class, so
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

const CONTENT_MAX_WIDTH = TOPIC_MAX_WIDTH - TOPIC_PADDING_X * 2;

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
    width: clampTopicWidth(contentWidth + TOPIC_PADDING_X * 2),
    height: Math.max(TOPIC_MIN_HEIGHT, lines * 20 + TOPIC_PADDING_Y * 2),
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
  const width = clampTopicWidth(el.scrollWidth + TOPIC_PADDING_X * 2);
  const height = Math.max(
    TOPIC_MIN_HEIGHT,
    Math.ceil(el.scrollHeight + TOPIC_PADDING_Y * 2)
  );
  return { width, height };
}

/** Test seam: drop the cached measuring element. */
export function resetTopicMeasureCache(): void {
  measureEl?.remove();
  measureEl = null;
}
