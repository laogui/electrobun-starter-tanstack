import { describe, expect, it } from 'vitest';

import {
  createTopicChildEdgeData,
  createTopicData,
  isTopicChildEdgeData,
  isTopicColorToken,
  isTopicNodeType,
  isTopicTitleWithinLimit,
  isTopicTreeEdge,
  normalizeTopicTitle,
  parseTopicChildEdgeData,
  parseTopicData,
  resolveTopicColorToken,
  TOPIC_CHILD_EDGE_KIND,
  TOPIC_DEFAULT_COLOR,
  TOPIC_TITLE_MAX_LENGTH,
} from './topic';

describe('topic color tokens', () => {
  it('accepts tokens from the closed set', () => {
    expect(isTopicColorToken('blue')).toBe(true);
    expect(isTopicColorToken('#FF00FF')).toBe(false);
    expect(isTopicColorToken(undefined)).toBe(false);
  });

  it('falls back to the default for display without changing storage', () => {
    expect(resolveTopicColorToken('teal-from-the-future')).toBe(
      TOPIC_DEFAULT_COLOR
    );
    expect(resolveTopicColorToken('green')).toBe('green');
  });
});

describe('normalizeTopicTitle', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeTopicTitle('  产品规划  ')).toBe('产品规划');
  });

  it('collapses newlines to spaces so the title stays single-line', () => {
    expect(normalizeTopicTitle('first\nsecond')).toBe('first second');
    expect(normalizeTopicTitle('first\r\n  second')).toBe('first second');
  });

  it('keeps interior spacing otherwise', () => {
    expect(normalizeTopicTitle('a  b')).toBe('a  b');
  });
});

describe('isTopicTitleWithinLimit', () => {
  it('counts code points, not UTF-16 units', () => {
    // Each emoji is a surrogate pair: 'length' would double-count them.
    const emoji = '🙂'.repeat(TOPIC_TITLE_MAX_LENGTH);
    expect(emoji.length).toBe(TOPIC_TITLE_MAX_LENGTH * 2);
    expect(isTopicTitleWithinLimit(emoji)).toBe(true);
    expect(isTopicTitleWithinLimit(`${emoji}x`)).toBe(false);
  });
});

describe('parseTopicData', () => {
  it('accepts a well-formed v1 payload', () => {
    const result = parseTopicData(createTopicData('想法', 'blue'));
    expect(result.status).toBe('valid');
    expect(result.data).toEqual({
      color: 'blue',
      title: '想法',
      topicVersion: 1,
    });
  });

  it('accepts an empty title (a draft that was committed then cleared upstream)', () => {
    expect(parseTopicData({ title: '', topicVersion: 1 }).status).toBe('valid');
  });

  it('normalizes an unknown color token for display', () => {
    const result = parseTopicData({
      color: 'chartreuse',
      title: 'x',
      topicVersion: 1,
    });
    expect(result.data?.color).toBe(TOPIC_DEFAULT_COLOR);
  });

  it('flags an unknown topicVersion as unsupported and keeps the title readable', () => {
    const result = parseTopicData({ title: 'future', topicVersion: 7 });
    expect(result.status).toBe('unsupported-version');
    expect(result.version).toBe(7);
    expect(result.title).toBe('future');
    expect(result.data).toBeUndefined();
  });

  it('rejects a missing version rather than assuming v1', () => {
    expect(parseTopicData({ title: 'x' }).status).toBe('invalid');
  });

  it('rejects a non-string title instead of coercing it to empty', () => {
    const result = parseTopicData({ title: 123, topicVersion: 1 });
    expect(result.status).toBe('invalid');
    expect(result.data).toBeUndefined();
  });

  it('rejects non-object input', () => {
    expect(parseTopicData(null).status).toBe('invalid');
    expect(parseTopicData('topic').status).toBe('invalid');
  });
});

describe('isTopicNodeType', () => {
  it('matches only the topic node type', () => {
    expect(isTopicNodeType('topic')).toBe(true);
    expect(isTopicNodeType('sticky')).toBe(false);
    expect(isTopicNodeType(undefined)).toBe(false);
  });
});

describe('tree edge data', () => {
  it('recognizes a tree relation only by data.kind', () => {
    expect(isTopicChildEdgeData({ kind: TOPIC_CHILD_EDGE_KIND })).toBe(true);
    expect(isTopicChildEdgeData({ label: 'child of' })).toBe(false);
    expect(isTopicChildEdgeData(null)).toBe(false);
  });

  it('never treats a plain association line as a tree edge', () => {
    const plain = { data: { label: 'relates to', pathType: 'bezier' } };
    expect(isTopicTreeEdge(plain)).toBe(false);
    expect(parseTopicChildEdgeData(plain.data).status).toBe('not-topic-edge');
  });

  it('accepts a well-formed relation', () => {
    const result = parseTopicChildEdgeData(createTopicChildEdgeData(2));
    expect(result.status).toBe('valid');
    expect(result.data).toEqual({
      kind: TOPIC_CHILD_EDGE_KIND,
      order: 2,
      relationVersion: 1,
    });
  });

  it('accepts order zero', () => {
    expect(parseTopicChildEdgeData(createTopicChildEdgeData(0)).status).toBe(
      'valid'
    );
  });

  it('flags an unknown relationVersion as unsupported', () => {
    const result = parseTopicChildEdgeData({
      kind: TOPIC_CHILD_EDGE_KIND,
      order: 0,
      relationVersion: 9,
    });
    expect(result.status).toBe('unsupported-version');
    expect(result.version).toBe(9);
  });

  it('rejects a negative or fractional order', () => {
    for (const order of [-1, 1.5]) {
      const result = parseTopicChildEdgeData({
        kind: TOPIC_CHILD_EDGE_KIND,
        order,
        relationVersion: 1,
      });
      expect(result.status).toBe('invalid');
    }
  });

  it('rejects a missing order', () => {
    expect(
      parseTopicChildEdgeData({
        kind: TOPIC_CHILD_EDGE_KIND,
        relationVersion: 1,
      }).status
    ).toBe('invalid');
  });
});
