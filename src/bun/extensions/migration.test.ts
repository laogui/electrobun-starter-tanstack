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

beforeAll(() => {
  vi.stubGlobal('Bun', {
    file: vi.fn((filePath: string) => ({
      exists: async () => existsSync(filePath),
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

import { CHECKLIST_CANVAS_TYPE_ID } from '../../shared/extensions/builtinIds';
import { instanceIdFromWidgetId } from '../../shared/extensions/migrationIds';
import type { ManifestNode } from '../manifest';
import { migrateLegacyCanvasNodes } from './migration';

describe('legacy canvas migration', () => {
  let wsPath: string;

  beforeEach(() => {
    wsPath = mkdtempSync(join(tmpdir(), 'gb-ext-mig-'));
    mkdirSync(join(wsPath, '.ghostboard', 'widgets'), { recursive: true });
    mkdirSync(join(wsPath, '.ghostboard', 'extension-instances'), {
      recursive: true,
    });
  });

  afterEach(() => {
    rmSync(wsPath, { force: true, recursive: true });
  });

  it('rewrites a widget node to an extension and is idempotent', async () => {
    writeFileSync(
      join(wsPath, '.ghostboard', 'widgets', 'widget_abc.json'),
      JSON.stringify({
        schema: 'ghostboard-widget/v1',
        id: 'widget_abc',
        kind: 'checklist',
        title: 'Bugs',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        data: { items: [{ id: '1', text: 'Crash', checked: false }] },
      })
    );
    const nodes = [
      {
        id: 'n1',
        type: 'widget',
        position: { x: 0, y: 0 },
        data: { widgetId: 'widget_abc', kind: 'checklist' },
      },
    ] as ManifestNode[];

    const first = await migrateLegacyCanvasNodes(
      wsPath,
      'view_1',
      nodes,
      '1.0.0'
    );
    expect(first.changed).toBe(true);
    expect(first.nodes[0]).toMatchObject({
      type: 'extension',
      data: {
        canvasTypeId: CHECKLIST_CANVAS_TYPE_ID,
        instanceId: instanceIdFromWidgetId('widget_abc'),
      },
    });
    expect(
      existsSync(join(wsPath, '.ghostboard', 'widgets', 'widget_abc.json'))
    ).toBe(true);

    const second = await migrateLegacyCanvasNodes(
      wsPath,
      'view_1',
      first.nodes,
      '1.0.0'
    );
    expect(second.changed).toBe(false);
  });

  it('rewrites a link node with a stable instance id', async () => {
    const nodes = [
      {
        id: 'n_link',
        type: 'link',
        position: { x: 10, y: 10 },
        data: {
          url: 'https://example.com',
          title: 'Example',
          color: '#FFFFFF',
        },
      },
    ] as ManifestNode[];
    const first = await migrateLegacyCanvasNodes(
      wsPath,
      'view_1',
      nodes,
      '1.0.0'
    );
    const second = await migrateLegacyCanvasNodes(
      wsPath,
      'view_1',
      nodes,
      '1.0.0'
    );
    expect(first.changed).toBe(true);
    expect(first.nodes[0]?.type).toBe('extension');
    expect((first.nodes[0]?.data as { instanceId?: string }).instanceId).toBe(
      (second.nodes[0]?.data as { instanceId?: string }).instanceId
    );
  });
});
