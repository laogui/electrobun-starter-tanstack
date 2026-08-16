import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock('electrobun/bun', () => ({
  Utils: { paths: { userData: '/mock-user-data' } },
}));

vi.mock('node:fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises'
    );
  return { ...actual };
});

beforeAll(() => {
  vi.stubGlobal('Bun', {
    file: vi.fn((filePath: string) => ({
      exists: async () => existsSync(filePath),
      text: async () => readFileSync(filePath, 'utf8'),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
    })),
    write: vi.fn(async (filePath: string, data: string) => {
      const dir = filePath.slice(0, filePath.lastIndexOf('/'));
      if (dir) {
        mkdirSync(dir, { recursive: true });
      }
      await writeFile(filePath, data);
    }),
  });
});

import {
  cloneWidget,
  createWidget,
  deleteWidget,
  isValidWidgetId,
  loadWidget,
  loadWidgets,
  parseWidgetRecord,
  saveWidget,
  WIDGET_SCHEMA,
  widgetRelativePath,
} from './widgets';

describe('widgets I/O', () => {
  let wsPath: string;

  beforeEach(() => {
    wsPath = mkdtempSync(join(tmpdir(), 'gb-widget-'));
    mkdirSync(join(wsPath, '.ghostboard', 'widgets'), { recursive: true });
  });

  afterEach(() => {
    rmSync(wsPath, { force: true, recursive: true });
  });

  it('widgetRelativePath rejects traversal and bad chars', () => {
    expect(() => widgetRelativePath('../etc/passwd')).toThrow();
    expect(() => widgetRelativePath('with space')).toThrow();
    expect(widgetRelativePath('widget_abc123')).toBe(
      '.ghostboard/widgets/widget_abc123.json'
    );
  });

  it('isValidWidgetId rejects unsafe ids', () => {
    expect(isValidWidgetId('widget_abc-123')).toBe(true);
    expect(isValidWidgetId('../evil')).toBe(false);
    expect(isValidWidgetId('with space')).toBe(false);
  });

  it('createWidget writes a reminder due one hour from now', async () => {
    const before = Date.now();
    const record = await createWidget(wsPath, 'reminder');
    expect(record.kind).toBe('reminder');
    expect(record.title).toBe('Reminder');
    expect(record.data).toMatchObject({
      status: 'scheduled',
    });
    const dueAt = Date.parse((record.data as { dueAt?: string }).dueAt ?? '');
    expect(dueAt).toBeGreaterThan(before);
    expect(dueAt).toBeLessThanOrEqual(before + 60 * 60 * 1000 + 1000);
  });

  it('createWidget writes a checklist widget with default data', async () => {
    const record = await createWidget(wsPath, 'checklist', 'Launch');
    expect(record.schema).toBe(WIDGET_SCHEMA);
    expect(record.kind).toBe('checklist');
    expect(record.title).toBe('Launch');
    expect(record.data).toEqual({ items: [] });

    const loaded = await loadWidget(wsPath, record.id);
    expect(loaded).toEqual(record);
  });

  it('saveWidget round-trips via atomic write', async () => {
    const record = await createWidget(wsPath, 'checklist');
    const updated = {
      ...record,
      data: {
        items: [{ id: 'item_1', text: 'Do the thing', checked: false }],
      },
      updatedAt: new Date().toISOString(),
    };
    await saveWidget(wsPath, updated);
    const loaded = await loadWidget(wsPath, record.id);
    expect(loaded).toEqual(updated);
  });

  it('loadWidget returns missing for a nonexistent widget', async () => {
    const loaded = await loadWidget(wsPath, 'widget_missing');
    expect(loaded).toEqual({ id: 'widget_missing', error: 'missing' });
  });

  it('loadWidget returns corrupted for invalid JSON without throwing', async () => {
    writeFileSync(
      join(wsPath, '.ghostboard', 'widgets', 'widget_bad.json'),
      '{not json'
    );
    const loaded = await loadWidget(wsPath, 'widget_bad');
    expect(loaded).toEqual({ id: 'widget_bad', error: 'corrupted' });
  });

  it('loadWidget rejects widgetIds that would escape the widgets directory', async () => {
    const loaded = await loadWidget(wsPath, '../escape');
    expect(loaded).toEqual({ id: '../escape', error: 'corrupted' });
  });

  it('loadWidgets batch-loads concurrently and isolates a single corrupted widget', async () => {
    const good = await createWidget(wsPath, 'checklist', 'Good');
    writeFileSync(
      join(wsPath, '.ghostboard', 'widgets', 'widget_bad2.json'),
      '{not json'
    );
    const results = await loadWidgets(wsPath, [
      good.id,
      'widget_bad2',
      'widget_missing2',
    ]);
    expect(results[good.id]).toEqual(good);
    expect(results.widget_bad2).toEqual({
      id: 'widget_bad2',
      error: 'corrupted',
    });
    expect(results.widget_missing2).toEqual({
      id: 'widget_missing2',
      error: 'missing',
    });
  });

  it('cloneWidget generates a new id with identical content', async () => {
    const source = await createWidget(wsPath, 'checklist', 'Source');
    const cloned = await cloneWidget(wsPath, source.id);
    expect(cloned).not.toBeNull();
    expect(cloned?.id).not.toBe(source.id);
    expect(cloned?.data).toEqual(source.data);
    expect(cloned?.kind).toBe(source.kind);
  });

  it('cloneWidget returns null when the source widget is missing', async () => {
    const cloned = await cloneWidget(wsPath, 'widget_missing3');
    expect(cloned).toBeNull();
  });

  it('deleteWidget removes existing files and returns false for missing', async () => {
    const record = await createWidget(wsPath, 'checklist');
    await expect(deleteWidget(wsPath, record.id)).resolves.toBe(true);
    await expect(deleteWidget(wsPath, record.id)).resolves.toBe(false);
  });
});

describe('WIDGET_SCHEMA constant', () => {
  it('stays at the v1 ghostboard schema id', () => {
    expect(WIDGET_SCHEMA).toBe('ghostboard-widget/v1');
  });
});

describe('parseWidgetRecord', () => {
  function validChecklist(overrides: Record<string, unknown> = {}) {
    return {
      schema: WIDGET_SCHEMA,
      id: 'widget_valid',
      kind: 'checklist',
      title: 'List',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
      data: { items: [] },
      ...overrides,
    };
  }

  function validPomodoro(overrides: Record<string, unknown> = {}) {
    return {
      schema: WIDGET_SCHEMA,
      id: 'widget_pomo',
      kind: 'pomodoro',
      title: 'Timer',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
      data: {
        mode: 'focus',
        focusMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: 15,
        sessionsBeforeLongBreak: 4,
        completedSessions: 0,
        timer: { state: 'idle' },
      },
      ...overrides,
    };
  }

  it('accepts a valid checklist record', () => {
    const result = parseWidgetRecord(validChecklist());
    expect('error' in result).toBe(false);
  });

  it('accepts a valid pomodoro record', () => {
    const result = parseWidgetRecord(validPomodoro());
    expect('error' in result).toBe(false);
  });

  it('accepts a pomodoro record with optional clockKind and stopwatch', () => {
    const result = parseWidgetRecord(
      validPomodoro({
        data: {
          clockKind: 'stopwatch',
          mode: 'focus',
          focusMinutes: 25,
          shortBreakMinutes: 5,
          longBreakMinutes: 15,
          sessionsBeforeLongBreak: 4,
          completedSessions: 0,
          timer: { state: 'idle' },
          stopwatch: {
            state: 'running',
            startedAt: '2026-07-08T12:00:00.000Z',
            elapsedMs: 1000,
          },
        },
      })
    );
    expect('error' in result).toBe(false);
  });

  it('rejects an unknown kind', () => {
    const result = parseWidgetRecord(
      validChecklist({ id: 'widget_bad', kind: 'mystery' })
    );
    expect(result).toEqual({ id: 'widget_bad', error: 'corrupted' });
  });

  it('rejects a checklist without an items array', () => {
    const result = parseWidgetRecord(
      validChecklist({ id: 'widget_noitems', data: { items: 'oops' } })
    );
    expect(result).toEqual({ id: 'widget_noitems', error: 'corrupted' });
  });

  it('rejects a pomodoro missing required numeric fields', () => {
    const result = parseWidgetRecord(
      validPomodoro({
        id: 'widget_badpomo',
        data: {
          mode: 'focus',
          focusMinutes: 25,
          timer: { state: 'idle' },
        },
      })
    );
    expect(result).toEqual({ id: 'widget_badpomo', error: 'corrupted' });
  });

  it('rejects a reminder missing dueAt/status/timezone', () => {
    const result = parseWidgetRecord({
      schema: WIDGET_SCHEMA,
      id: 'widget_badrem',
      kind: 'reminder',
      title: 'Reminder',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
      data: { dueAt: '2026-07-10T00:00:00.000Z' },
    });
    expect(result).toEqual({ id: 'widget_badrem', error: 'corrupted' });
  });

  it('rejects a wrong schema', () => {
    const result = parseWidgetRecord({ ...validChecklist(), schema: 'other' });
    expect(result).toEqual({ id: 'unknown', error: 'corrupted' });
  });

  it('rejects a non-object input', () => {
    expect(parseWidgetRecord(null)).toEqual({
      id: 'unknown',
      error: 'corrupted',
    });
    expect(parseWidgetRecord('x')).toEqual({
      id: 'unknown',
      error: 'corrupted',
    });
  });

  it('saveWidget throws for an invalid payload', async () => {
    const wsPath = mkdtempSync(join(tmpdir(), 'gb-widget-save-'));
    try {
      await expect(
        saveWidget(wsPath, {
          schema: WIDGET_SCHEMA,
          id: 'widget_bad',
          kind: 'mystery',
          title: 'Bad',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
          data: {},
        } as any)
      ).rejects.toThrow('Refusing to save invalid widget record');
    } finally {
      rmSync(wsPath, { force: true, recursive: true });
    }
  });

  it('loadWidget returns corrupted for a wrong-kind data payload', async () => {
    const wsPath = mkdtempSync(join(tmpdir(), 'gb-widget-load-'));
    try {
      mkdirSync(join(wsPath, '.ghostboard', 'widgets'), {
        recursive: true,
      });
      writeFileSync(
        join(wsPath, '.ghostboard', 'widgets', 'widget_wrongschema.json'),
        JSON.stringify({
          schema: WIDGET_SCHEMA,
          id: 'widget_wrongschema',
          kind: 'checklist',
          title: 'Bad',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
          data: { items: 'not-an-array' },
        })
      );
      const loaded = await loadWidget(wsPath, 'widget_wrongschema');
      expect(loaded).toEqual({
        id: 'widget_wrongschema',
        error: 'corrupted',
      });
    } finally {
      rmSync(wsPath, { force: true, recursive: true });
    }
  });
});
