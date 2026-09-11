import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
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

import { EXTENSION_INSTANCE_SCHEMA } from '../../shared/extensions/instance';
import {
  cloneExtensionInstance,
  createExtensionInstance,
  deleteInstancesByCanvasType,
  instanceRelativePath,
  loadExtensionInstance,
  loadExtensionInstances,
  updateExtensionInstance,
} from './instanceStore';
import {
  cancelExtensionTasksByInstance,
  listExtensionTasks,
  scheduleExtensionTask,
} from './scheduler';

describe('extension instance store', () => {
  let wsPath: string;

  beforeEach(() => {
    wsPath = mkdtempSync(join(tmpdir(), 'gb-ext-inst-'));
    mkdirSync(join(wsPath, '.ghostboard', 'extension-instances'), {
      recursive: true,
    });
  });

  afterEach(() => {
    rmSync(wsPath, { force: true, recursive: true });
  });

  it('rejects traversal in instance paths', () => {
    expect(() => instanceRelativePath('../etc/passwd')).toThrow();
    expect(() => instanceRelativePath('with space')).toThrow();
  });

  it('reuses a predetermined instance id without duplicating the file', async () => {
    const created = await createExtensionInstance(wsPath, {
      id: 'extinst_widget_abc',
      appVersion: '1.0.0',
      canvasTypeId: 'ghostboard.demo/counter',
      dataVersion: 1,
      state: { count: 1 },
      presentation: { title: 'Counter' },
    });
    const again = await createExtensionInstance(wsPath, {
      id: 'extinst_widget_abc',
      appVersion: '1.0.0',
      canvasTypeId: 'ghostboard.demo/counter',
      dataVersion: 1,
      state: { count: 99 },
      presentation: { title: 'Other' },
    });
    expect(created.id).toBe('extinst_widget_abc');
    expect(again.id).toBe(created.id);
    expect(again.state).toEqual({ count: 1 });
  });

  it('creates, loads, and updates a record while keeping extras', async () => {
    const created = await createExtensionInstance(wsPath, {
      appVersion: '1.0.0',
      canvasTypeId: 'ghostboard.demo/counter',
      dataVersion: 1,
      state: { count: 0 },
      presentation: { title: 'Counter', subtitle: '0' },
    });
    expect(created.schema).toBe(EXTENSION_INSTANCE_SCHEMA);
    expect(created.revision).toBe(1);

    const path = join(
      wsPath,
      '.ghostboard',
      'extension-instances',
      `${created.id}.json`
    );
    const onDisk = JSON.parse(readFileSync(path, 'utf8')) as Record<
      string,
      unknown
    >;
    onDisk.futureHostField = 'keep';
    await writeFile(path, JSON.stringify(onDisk));

    const updated = await updateExtensionInstance(wsPath, {
      appVersion: '1.0.1',
      expectedRevision: 1,
      instanceId: created.id,
      state: { count: 2 },
      presentation: { title: 'Counter', subtitle: '2' },
    });
    expect('error' in updated).toBe(false);
    if ('error' in updated) {
      return;
    }
    expect(updated.record.revision).toBe(2);
    expect(updated.record.state).toEqual({ count: 2 });
    expect(updated.extras.futureHostField).toBe('keep');

    const batch = await loadExtensionInstances(wsPath, [created.id]);
    expect(batch[created.id]).toMatchObject({
      id: created.id,
      revision: 2,
    });
  });

  it('persists monotonic data-version migrations and rejects downgrades', async () => {
    const created = await createExtensionInstance(wsPath, {
      appVersion: '1.0.0',
      canvasTypeId: 'example.cards/counter',
      dataVersion: 1,
      state: { count: 3 },
      presentation: { title: 'Legacy counter' },
    });
    const migrated = await updateExtensionInstance(wsPath, {
      appVersion: '1.1.0',
      dataVersion: 2,
      expectedRevision: 1,
      instanceId: created.id,
      state: { count: 3, label: 'Migrated' },
      presentation: { title: 'Migrated', plainText: 'Count 3' },
    });
    expect(migrated).toMatchObject({
      record: {
        canvasTypeId: 'example.cards/counter',
        dataVersion: 2,
        revision: 2,
        state: { count: 3, label: 'Migrated' },
      },
    });
    await expect(
      updateExtensionInstance(wsPath, {
        appVersion: '1.0.0',
        dataVersion: 1,
        expectedRevision: 2,
        instanceId: created.id,
        state: { count: 3 },
        presentation: { title: 'Downgraded' },
      })
    ).rejects.toThrow('invalid-data-version');
    expect(await loadExtensionInstance(wsPath, created.id)).toMatchObject({
      record: { dataVersion: 2, revision: 2 },
    });
  });

  it('clones to a new id and reports missing files', async () => {
    const created = await createExtensionInstance(wsPath, {
      appVersion: '1.0.0',
      canvasTypeId: 'ghostboard.demo/counter',
      dataVersion: 1,
      state: { count: 7 },
      presentation: { title: 'Counter', subtitle: '7' },
    });
    const cloned = await cloneExtensionInstance(wsPath, created.id);
    expect(cloned).not.toBeNull();
    expect(cloned?.id).not.toBe(created.id);
    expect(cloned?.state).toEqual({ count: 7 });

    const missing = await loadExtensionInstance(wsPath, 'extinst_missingxxxx');
    expect(missing).toEqual({ id: 'extinst_missingxxxx', error: 'missing' });
  });

  it('reports malformed JSON as corrupted without throwing', async () => {
    const path = join(
      wsPath,
      '.ghostboard',
      'extension-instances',
      'extinst_bad_json.json'
    );
    await writeFile(path, '{"schema":"ghostboard-extension-instance/v1"');

    await expect(
      loadExtensionInstance(wsPath, 'extinst_bad_json')
    ).resolves.toEqual({ id: 'extinst_bad_json', error: 'corrupted' });
  });

  it('keeps unknown canvas types opaque through load and clone', async () => {
    const created = await createExtensionInstance(wsPath, {
      appVersion: '1.0.0',
      canvasTypeId: 'ghostboard.future/new-type',
      dataVersion: 7,
      state: { fromNewerApp: { answer: 42 } },
      presentation: {
        title: 'Future content',
        plainText: 'Keep this opaque state',
      },
    });

    const loaded = await loadExtensionInstance(wsPath, created.id);
    expect(loaded).toMatchObject({
      record: {
        canvasTypeId: 'ghostboard.future/new-type',
        dataVersion: 7,
        state: { fromNewerApp: { answer: 42 } },
        presentation: {
          title: 'Future content',
          plainText: 'Keep this opaque state',
        },
      },
    });

    const cloned = await cloneExtensionInstance(wsPath, created.id);
    expect(cloned).toMatchObject({
      canvasTypeId: 'ghostboard.future/new-type',
      dataVersion: 7,
      state: { fromNewerApp: { answer: 42 } },
      presentation: {
        title: 'Future content',
        plainText: 'Keep this opaque state',
      },
    });
    expect(cloned?.id).not.toBe(created.id);
  });

  it('deletes only instances of the requested canvas type', async () => {
    const keep = await createExtensionInstance(wsPath, {
      appVersion: '1.0.0',
      canvasTypeId: 'ghostboard.demo/counter',
      dataVersion: 1,
      state: { count: 1 },
      presentation: { title: 'Keep' },
    });
    const remove = await createExtensionInstance(wsPath, {
      appVersion: '1.0.0',
      canvasTypeId: 'ghostboard.web/link',
      dataVersion: 1,
      state: { url: 'https://example.com' },
      presentation: { title: 'Remove' },
    });

    const deleted = await deleteInstancesByCanvasType(
      wsPath,
      'ghostboard.web/link'
    );
    expect(deleted).toEqual([remove.id]);
    expect(await loadExtensionInstance(wsPath, keep.id)).toMatchObject({
      record: { id: keep.id },
    });
    expect(await loadExtensionInstance(wsPath, remove.id)).toMatchObject({
      error: 'missing',
    });
  });

  it('leaves no scheduled tasks behind after clearing a canvas type', async () => {
    const keep = await createExtensionInstance(wsPath, {
      appVersion: '1.0.0',
      canvasTypeId: 'ghostboard.demo/counter',
      dataVersion: 1,
      presentation: { title: 'Keep' },
      state: { count: 1 },
    });
    const remove = await createExtensionInstance(wsPath, {
      appVersion: '1.0.0',
      canvasTypeId: 'ghostboard.productivity/reminder',
      dataVersion: 1,
      presentation: { title: 'Remove' },
      state: {},
    });
    for (const instance of [keep, remove]) {
      await scheduleExtensionTask(wsPath, {
        canvasTypeId: instance.canvasTypeId,
        fireAt: '2030-01-01T00:00:00.000Z',
        id: 'reminder',
        instanceId: instance.id,
        repeat: 'none',
      });
    }

    // Mirrors the extensionInstanceClearType handler in src/bun/index.ts.
    const deleted = await deleteInstancesByCanvasType(
      wsPath,
      'ghostboard.productivity/reminder'
    );
    await cancelExtensionTasksByInstance(wsPath, deleted);

    expect(
      (await listExtensionTasks(wsPath)).map((task) => task.instanceId)
    ).toEqual([keep.id]);
  });
});
