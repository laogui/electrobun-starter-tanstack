import { type Edge, MarkerType, type Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { TOPIC_CHILD_EDGE_KIND } from '../../shared/topic';
import {
  ARROW_MARKER_REF,
  arrowMarker,
  DEFAULT_EDGE_STROKE,
  resolveEdgeMarkers,
  SELECTED_EDGE_STROKE,
} from './edgeMarkers';
import { topicEdgeStroke } from './topicColors';

const node = (id: string, data: Record<string, unknown> = {}): Node => ({
  id,
  data,
  position: { x: 0, y: 0 },
});

const edge = (overrides: Partial<Edge> = {}): Edge => ({
  id: 'e1',
  source: 'a',
  target: 'b',
  markerEnd: ARROW_MARKER_REF,
  ...overrides,
});

describe('resolveEdgeMarkers', () => {
  const nodes = [node('a'), node('b')];

  it('replaces the persisted arrow ref with a built-in closed arrow', () => {
    const [resolved] = resolveEdgeMarkers([edge()], nodes);
    expect(resolved?.markerEnd).toEqual({
      type: MarkerType.ArrowClosed,
      color: DEFAULT_EDGE_STROKE,
      width: 22,
      height: 22,
      markerUnits: 'userSpaceOnUse',
    });
  });

  it('uses the accent colour for selected edges', () => {
    const [resolved] = resolveEdgeMarkers([edge({ selected: true })], nodes);
    expect(resolved?.markerEnd).toEqual(arrowMarker(SELECTED_EDGE_STROKE));
  });

  it('matches a custom edge colour, even when selected', () => {
    const [resolved] = resolveEdgeMarkers(
      [edge({ data: { color: '#ff00aa' }, selected: true })],
      nodes
    );
    expect(resolved?.markerEnd).toEqual(arrowMarker('#ff00aa'));
  });

  it('derives topic tree edge colour from the source topic', () => {
    const [resolved] = resolveEdgeMarkers(
      [edge({ data: { kind: TOPIC_CHILD_EDGE_KIND } })],
      [node('a', { color: 'blue' }), node('b')]
    );
    expect(resolved?.markerEnd).toEqual(arrowMarker(topicEdgeStroke('blue')));
  });

  it('leaves edges without the arrow ref untouched', () => {
    const plain = edge({ markerEnd: undefined });
    const [resolved] = resolveEdgeMarkers([plain], nodes);
    expect(resolved).toBe(plain);
  });

  it('resolves markerStart as well', () => {
    const [resolved] = resolveEdgeMarkers(
      [edge({ markerEnd: undefined, markerStart: ARROW_MARKER_REF })],
      nodes
    );
    expect(resolved?.markerStart).toEqual(arrowMarker(DEFAULT_EDGE_STROKE));
    expect(resolved?.markerEnd).toBeUndefined();
  });
});
