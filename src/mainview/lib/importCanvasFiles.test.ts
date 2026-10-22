import { describe, expect, it } from 'vitest';
import {
  isCardContentData,
  isExtensionNodeData,
  isWidgetNodeData,
  toCardContentData,
  toImageData,
} from '@/components/canvas/nodes/nodeDataGuards';
import { CANVAS_EXPORT_SCHEMA } from '@/lib/canvasExport';
import { parseCanvasExportJson } from '@/lib/importCanvasFiles';
import { parseUntrustedWidgetRecord } from '@/lib/widgetTypes';

const widget = {
  createdAt: '2026-01-01T00:00:00.000Z',
  data: { items: [{ checked: true, id: 'i1', text: 'Done' }] },
  id: 'widget_1',
  kind: 'checklist',
  schema: 'ghostboard-widget/v1',
  title: 'List',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const instance = {
  appVersion: '1.0.0',
  canvasTypeId: 'ghostboard.counter/counter',
  createdAt: '2026-01-01T00:00:00.000Z',
  dataVersion: 1,
  id: 'extinst_abcdefgh',
  presentation: { title: 'Counter' },
  revision: 1,
  schema: 'ghostboard-extension-instance/v1',
  state: { count: 2 },
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const exportJson = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    edges: [],
    exportedAt: '2026-01-01T00:00:00.000Z',
    nodes: [{ data: {}, id: 'n1', position: { x: 0, y: 0 }, type: 'card' }],
    schema: CANVAS_EXPORT_SCHEMA,
    ...extra,
  });

describe('parseCanvasExportJson (untrusted canvas export files)', () => {
  it('accepts a well-formed export and keeps valid embedded records', () => {
    const parsed = parseCanvasExportJson(
      exportJson({
        extensionInstances: { extinst_abcdefgh: instance },
        viewport: { x: 1, y: 2, zoom: 1 },
        widgets: { widget_1: widget },
      })
    );
    expect(parsed?.nodes).toHaveLength(1);
    expect(parsed?.widgets?.widget_1).toEqual(widget);
    expect(parsed?.extensionInstances?.extinst_abcdefgh).toMatchObject({
      canvasTypeId: 'ghostboard.counter/counter',
      state: { count: 2 },
    });
    expect(parsed?.viewport).toEqual({ x: 1, y: 2, zoom: 1 });
  });

  it('rejects malformed documents outright', () => {
    expect(parseCanvasExportJson('not json')).toBeNull();
    expect(parseCanvasExportJson('[]')).toBeNull();
    expect(parseCanvasExportJson(exportJson({ schema: 'other' }))).toBeNull();
    expect(parseCanvasExportJson(exportJson({ nodes: {} }))).toBeNull();
    expect(parseCanvasExportJson(exportJson({ widgets: [] }))).toBeNull();
  });

  it('drops invalid embedded records and non-object nodes', () => {
    const parsed = parseCanvasExportJson(
      exportJson({
        edges: [null, { id: 'e', source: 'n1', target: 'n1' }],
        extensionInstances: { bad: { ...instance, revision: 0 } },
        nodes: [42, { id: 'n1' }],
        widgets: {
          bad: { ...widget, data: { items: 'not-an-array' } },
          widget_1: widget,
        },
      })
    );
    expect(parsed?.nodes).toEqual([{ id: 'n1' }]);
    expect(parsed?.edges).toHaveLength(1);
    expect(Object.keys(parsed?.widgets ?? {})).toEqual(['widget_1']);
    expect(parsed?.extensionInstances).toEqual({});
  });
});

describe('parseUntrustedWidgetRecord', () => {
  it('normalizes checklist items and rejects broken envelopes', () => {
    expect(
      parseUntrustedWidgetRecord({
        ...widget,
        data: { items: [{ id: 'x' }, 'junk'] },
      })?.data
    ).toEqual({ items: [{ checked: false, id: 'x', text: '' }] });
    expect(
      parseUntrustedWidgetRecord({ ...widget, id: '../escape' })
    ).toBeNull();
    expect(parseUntrustedWidgetRecord({ ...widget, kind: 'timer' })).toBeNull();
  });

  it('validates pomodoro timers and reminder status', () => {
    const pomodoro = {
      ...widget,
      data: {
        completedSessions: 0,
        focusMinutes: 25,
        longBreakMinutes: 15,
        mode: 'focus',
        sessionsBeforeLongBreak: 4,
        shortBreakMinutes: 5,
        timer: { state: 'paused', remainingMs: 1000 },
      },
      kind: 'pomodoro',
    };
    expect(parseUntrustedWidgetRecord(pomodoro)?.data).toMatchObject({
      timer: { remainingMs: 1000, state: 'paused' },
    });
    expect(
      parseUntrustedWidgetRecord({
        ...pomodoro,
        data: { ...pomodoro.data, timer: { state: 'running' } },
      })
    ).toBeNull();
    expect(
      parseUntrustedWidgetRecord({
        ...widget,
        data: { dueAt: 'x', status: 'later', timezone: 'UTC' },
        kind: 'reminder',
      })
    ).toBeNull();
  });
});

describe('node data guards', () => {
  it('keeps valid card data by identity and strips wrongly typed fields', () => {
    const valid = { color: '#fff', items: [{ text: 'a' }], title: 'T' };
    expect(isCardContentData(valid)).toBe(true);
    expect(toCardContentData(valid)).toBe(valid);

    expect(toCardContentData({ color: 7, tags: ['a', 1], title: 'T' })).toEqual(
      { title: 'T' }
    );
  });

  it('gives image data a colour and drops non-string urls', () => {
    expect(toImageData({ imageUrl: 5, title: 'Pic' })).toEqual({
      color: '',
      title: 'Pic',
    });
  });

  it('recognizes widget and extension node data', () => {
    expect(isWidgetNodeData({ kind: 'checklist', widgetId: 'w' })).toBe(true);
    expect(isWidgetNodeData({ kind: 'nope', widgetId: 'w' })).toBe(false);
    expect(isWidgetNodeData({ kind: 'checklist', widgetId: '' })).toBe(false);
    expect(isExtensionNodeData({ canvasTypeId: 'a.b', instanceId: 'i' })).toBe(
      true
    );
    expect(isExtensionNodeData({ canvasTypeId: 'a.b' })).toBe(false);
  });
});
