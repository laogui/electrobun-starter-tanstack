/**
 * Renderer-side presentation for `TopicColorToken`.
 *
 * Topics persist a token, not a CSS value (see `src/shared/topic.ts`), so the
 * palette can be restyled without rewriting user files and a manifest can never
 * inject arbitrary CSS. This module is the only place that turns a token into
 * concrete colours.
 */

import {
  resolveTopicColorToken,
  type TopicColorToken,
} from '../../shared/topic';

interface TopicPalette {
  /** Node background. */
  background: string;
  /** Node border and, for the parent end, the tree edge stroke. */
  border: string;
  /** Title text. */
  foreground: string;
}

const TOPIC_PALETTES: Record<TopicColorToken, TopicPalette> = {
  neutral: {
    background: '#FFFFFF',
    border: '#D6D3D1',
    foreground: '#1C1917',
  },
  blue: { background: '#DBEAFE', border: '#93C5FD', foreground: '#1E3A8A' },
  green: { background: '#DCFCE7', border: '#86EFAC', foreground: '#14532D' },
  yellow: { background: '#FEF9C3', border: '#FDE047', foreground: '#713F12' },
  orange: { background: '#FFEDD5', border: '#FDBA74', foreground: '#7C2D12' },
  pink: { background: '#FCE7F3', border: '#F9A8D4', foreground: '#831843' },
  purple: { background: '#EDE9FE', border: '#C4B5FD', foreground: '#4C1D95' },
};

export function getTopicPalette(token: unknown): TopicPalette {
  return TOPIC_PALETTES[resolveTopicColorToken(token)];
}

/**
 * Stroke for a tree edge, derived from the parent Topic's token. Tree edges
 * have no colour of their own, so a branch always reads as one unit.
 */
export function topicEdgeStroke(parentColorToken: unknown): string {
  return getTopicPalette(parentColorToken).border;
}
