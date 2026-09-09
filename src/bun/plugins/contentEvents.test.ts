import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { deleteBlockNoteSidecar, saveBlockNoteSidecar } from '../blocknote';
import {
  createExtensionInstance,
  deleteExtensionInstance,
  updateExtensionInstance,
} from '../extensions/instanceStore';
import { deleteNoteFile, saveNote } from '../notes';
import { createWidget, deleteWidget } from '../widgets';
import { pluginWorkspaceId, subscribeContentChanges } from './contentEvents';

let workspace: string;
const disposers: (() => void)[] = [];
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'gb-plugin-events-'));
  vi.stubGlobal('Bun', {
    file: (path: string) => ({
      exists: async () => existsSync(path),
      text: () => readFile(path, 'utf8'),
      json: async () => JSON.parse(await readFile(path, 'utf8')),
    }),
    write: async (path: string, data: string) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data);
    },
  });
});
afterEach(async () => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
  vi.unstubAllGlobals();
  await rm(workspace, { recursive: true, force: true });
});

it('pushes successful sidecar and legacy note saves/deletions with fixed workspace identity', async () => {
  const changed = vi.fn();
  const other = vi.fn();
  disposers.push(
    subscribeContentChanges(workspace, changed),
    subscribeContentChanges(join(workspace, 'other'), other)
  );
  await saveBlockNoteSidecar(workspace, 'note-a', { blocks: [], revision: 1 });
  expect(changed).toHaveBeenLastCalledWith({
    workspaceId: pluginWorkspaceId(workspace),
    kind: 'note',
    operation: 'upsert',
    ids: ['note-a'],
  });
  await deleteBlockNoteSidecar(workspace, 'note-a');
  expect(changed.mock.calls[1]?.[0].operation).toBe('delete');
  expect(await deleteBlockNoteSidecar(workspace, 'note-a')).toBe(false);
  expect(changed).toHaveBeenCalledTimes(2);
  await saveNote(
    workspace,
    'content/legacy.md',
    { id: 'note-legacy' },
    '# Legacy'
  );
  await deleteNoteFile(workspace, 'content/legacy.md');
  expect(
    changed.mock.calls
      .slice(2)
      .map(([event]) => [event.ids[0], event.operation])
  ).toEqual([
    ['note-legacy', 'upsert'],
    ['note-legacy', 'delete'],
  ]);
  expect(other).not.toHaveBeenCalled();
});

it('covers extension creation, persisted editing and deletion, plus legacy widgets', async () => {
  const changed = vi.fn();
  disposers.push(subscribeContentChanges(workspace, changed));
  const instance = await createExtensionInstance(workspace, {
    appVersion: '1.0.0',
    canvasTypeId: 'ghostboard.demo/counter',
    dataVersion: 1,
    state: { count: 0 },
    presentation: { title: 'Counter' },
  });
  await updateExtensionInstance(workspace, {
    appVersion: '1.0.0',
    instanceId: instance.id,
    expectedRevision: 1,
    state: { count: 1 },
    presentation: { title: 'One' },
  });
  await deleteExtensionInstance(workspace, instance.id);
  expect(
    changed.mock.calls.map(([event]) => [
      event.kind,
      event.ids[0],
      event.operation,
    ])
  ).toEqual([
    ['extension', instance.id, 'upsert'],
    ['extension', instance.id, 'upsert'],
    ['extension', instance.id, 'delete'],
  ]);
  const widget = await createWidget(workspace, 'checklist');
  await deleteWidget(workspace, widget.id);
  expect(changed.mock.calls.slice(3).map(([event]) => event.kind)).toEqual([
    'widget',
    'widget',
  ]);
});

it('does not announce failed writes and does not let a delivery error fail a committed save', async () => {
  const changed = vi.fn();
  disposers.push(subscribeContentChanges(workspace, changed));
  vi.spyOn(Bun, 'write').mockRejectedValueOnce(new Error('disk full'));
  await expect(
    saveBlockNoteSidecar(workspace, 'note-a', { blocks: [], revision: 1 })
  ).rejects.toThrow('disk full');
  expect(changed).not.toHaveBeenCalled();
  disposers.push(
    subscribeContentChanges(workspace, () => {
      throw new Error('delivery failed');
    })
  );
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  await saveBlockNoteSidecar(workspace, 'note-a', { blocks: [], revision: 1 });
  expect(changed).toHaveBeenCalledOnce();
  expect(warn).toHaveBeenCalledOnce();
});
