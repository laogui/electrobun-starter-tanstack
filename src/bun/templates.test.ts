import { describe, expect, it } from 'vitest';

import { listAllTemplates, loadTemplate } from './templates';
import { parseWidgetRecord, WIDGET_SCHEMA } from './widgets';

describe('built-in templates', () => {
  it('parses every bundled template meta and manifest', () => {
    const metas = listAllTemplates();
    expect(metas.length).toBeGreaterThan(0);
    for (const meta of metas) {
      const template = loadTemplate(meta.id);
      expect(template?.meta.id).toBe(meta.id);
      expect(Array.isArray(template?.nodes)).toBe(true);
      expect(Array.isArray(template?.edges)).toBe(true);
    }
  });

  it('keeps fields the template types do not name', () => {
    const edges = listAllTemplates().flatMap(
      (meta) => loadTemplate(meta.id)?.edges ?? []
    );
    expect(edges.some((edge) => 'markerEnd' in edge)).toBe(true);
  });

  it('returns null for unknown ids', () => {
    expect(loadTemplate('does-not-exist')).toBeNull();
  });

  it('ships the cafe template with embedded assets', () => {
    const cafe = loadTemplate('cafe');
    expect(Object.keys(cafe?.assets ?? {}).length).toBeGreaterThan(0);
  });
});

describe('parseWidgetRecord', () => {
  const base = {
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'widget_1',
    schema: WIDGET_SCHEMA,
    title: 'List',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('accepts a valid record and preserves unknown keys and key order', () => {
    const input = {
      ...base,
      future: { keep: true },
      kind: 'checklist',
      data: { items: [] },
    };
    const parsed = parseWidgetRecord(input);
    expect(parsed).toEqual(input);
    expect(Object.keys(parsed)).toEqual(Object.keys(input));
  });

  it('rejects data that does not match the widget kind', () => {
    expect(
      parseWidgetRecord({ ...base, kind: 'checklist', data: { items: 1 } })
    ).toEqual({ id: 'widget_1', error: 'corrupted' });
    expect(
      parseWidgetRecord({
        ...base,
        kind: 'pomodoro',
        data: {
          completedSessions: 0,
          focusMinutes: 25,
          longBreakMinutes: 15,
          sessionsBeforeLongBreak: 4,
          shortBreakMinutes: 5,
          timer: { state: 1 },
        },
      })
    ).toEqual({ id: 'widget_1', error: 'corrupted' });
    expect(
      parseWidgetRecord({
        ...base,
        kind: 'reminder',
        data: { dueAt: 'x', status: 'scheduled' },
      })
    ).toEqual({ id: 'widget_1', error: 'corrupted' });
  });
});
