import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeNodeMetadataPatch } from '../shared/nodeMetadataPatch';
import { RPC_WRITE_PARAM_SCHEMAS } from './rpc/writeParamSchemas';
import type { WorkspaceConfig } from './workspace';

vi.mock('electrobun/bun', () => ({
  default: { events: { on: vi.fn() } },
  ApplicationMenu: {},
  Updater: {},
  Utils: {
    moveToTrash: vi.fn(() => true),
    quit: vi.fn(),
    paths: { userData: '/mock-user-data' },
  },
}));

const {
  addView,
  loadWorkspaceConfig,
  parseWorkspaceConfig,
  removeView,
  renameView,
  seedFirstRunIfNeeded,
  setActiveViewId,
} = await import('./workspace');
const {
  deleteTagEverywhere,
  migrateLegacyTagsFromNotes,
  flushAllNodeMetadata,
  flushNodeMetadata,
  loadAllMetadata,
  resetNodeMetadataCacheForTests,
  setNodeMetadata,
} = await import('./nodeMetadata');

let ws: string;

const ghostDir = () => join(ws, '.ghostboard');
const configPath = () => join(ghostDir(), 'workspace.json');

async function readConfigFromDisk(): Promise<WorkspaceConfig> {
  return JSON.parse(await readFile(configPath(), 'utf8')) as WorkspaceConfig;
}

beforeEach(async () => {
  ws = await mkdtemp(join(tmpdir(), 'workspace-test-'));
  await mkdir(join(ghostDir(), 'views'), { recursive: true });
  await mkdir(join(ghostDir(), 'trash'), { recursive: true });
});

afterEach(async () => {
  resetNodeMetadataCacheForTests();
  await rm(ws, { force: true, recursive: true });
});

describe('workspace.json read-modify-write', () => {
  it('keeps every view when many addView calls race', async () => {
    await loadWorkspaceConfig(ws);
    const added = await Promise.all(
      Array.from({ length: 12 }, (_, index) => addView(ws, `Canvas ${index}`))
    );
    const config = await readConfigFromDisk();
    expect(config.views).toHaveLength(13);
    for (const entry of added) {
      expect(config.views).toContainEqual(entry);
    }
  });

  it('serializes mixed mutations without losing updates', async () => {
    const first = await addView(ws, 'First');
    const second = await addView(ws, 'Second');
    await Promise.all([
      renameView(ws, first.id, 'Renamed'),
      setActiveViewId(ws, first.id),
      removeView(ws, second.id),
      addView(ws, 'Third'),
    ]);
    const config = await readConfigFromDisk();
    const names = config.views.map((view) => view.name);
    expect(names).toContain('Renamed');
    expect(names).toContain('Third');
    expect(names).not.toContain('Second');
    expect(config.trash).toHaveLength(1);
  });
});

describe('workspace.json validation and recovery', () => {
  it('rejects a structurally invalid config', () => {
    expect(() => parseWorkspaceConfig({ views: 'nope' })).toThrow();
    expect(() =>
      parseWorkspaceConfig({ activeViewId: 'a', views: [{ id: 'a' }] })
    ).toThrow();
    expect(
      parseWorkspaceConfig({
        activeViewId: 'a',
        views: [{ id: 'a', name: 'A', file: 'views/a.canvas.json' }],
        futureKey: true,
      })
    ).toMatchObject({ schema: 'ghostboard-workspace/v1', futureKey: true });
  });

  it('restores from the rolling backup and keeps the corrupt bytes', async () => {
    const view = await addView(ws, 'Keep me');
    await renameView(ws, view.id, 'Keep me too');
    await writeFile(configPath(), '{"views": [');

    const config = await loadWorkspaceConfig(ws);
    expect(config.views.map((entry) => entry.id)).toContain(view.id);
    const corrupt = (await readdir(ghostDir())).filter((name) =>
      name.startsWith('workspace.json.corrupt-')
    );
    expect(corrupt).toHaveLength(1);
    expect(await readFile(join(ghostDir(), corrupt[0] as string), 'utf8')).toBe(
      '{"views": ['
    );
    // The recovered config is written back so later reads are clean.
    expect((await readConfigFromDisk()).views).toEqual(config.views);
  });

  it('rebuilds the view list from canvases on disk without a backup', async () => {
    await writeFile(join(ghostDir(), 'views', 'default.canvas.json'), '{}');
    await writeFile(join(ghostDir(), 'views', 'view_abc.canvas.json'), '{}');
    await writeFile(
      join(ghostDir(), 'views', 'view_abc.canvas.json.bak'),
      '{}'
    );
    await writeFile(configPath(), JSON.stringify({ views: 42 }));

    const config = await loadWorkspaceConfig(ws);
    expect(config.views.map((entry) => entry.file).sort()).toEqual([
      'views/default.canvas.json',
      'views/view_abc.canvas.json',
    ]);
    expect(config.views.map((entry) => entry.id)).toContain(
      config.activeViewId
    );
  });
});

describe('missing workspace.json is not a first run', () => {
  const userCanvas = JSON.stringify({
    schema: 'ghostboard-canvas/v1',
    viewId: 'default',
    nodes: [{ id: 'mine', type: 'card', position: { x: 0, y: 0 }, data: {} }],
    edges: [],
  });

  it('keeps an existing default canvas instead of seeding the template', async () => {
    const defaultPath = join(ghostDir(), 'views', 'default.canvas.json');
    await writeFile(defaultPath, userCanvas);
    await writeFile(join(ghostDir(), 'views', 'view_abc.canvas.json'), '{}');

    await seedFirstRunIfNeeded(ws);

    expect(await readFile(defaultPath, 'utf8')).toBe(userCanvas);
    expect((await readConfigFromDisk()).views.map((v) => v.id).sort()).toEqual([
      'default',
      'view_abc',
    ]);
  });

  it('rebuilds instead of defaulting when the config disappears later', async () => {
    await writeFile(join(ghostDir(), 'views', 'view_abc.canvas.json'), '{}');
    const config = await loadWorkspaceConfig(ws);
    expect(config.views.map((v) => v.id)).toEqual(['view_abc']);
  });

  it('restores trash entries from trash/ with the file mtime', async () => {
    await writeFile(join(ghostDir(), 'views', 'default.canvas.json'), '{}');
    const trashPath = join(ghostDir(), 'trash', 'trash_1234abcd.canvas.json');
    await writeFile(
      trashPath,
      JSON.stringify({ viewId: 'view_old', nodes: [], edges: [] })
    );
    const mtime = new Date('2026-01-02T03:04:05Z');
    await utimes(trashPath, mtime, mtime);
    await writeFile(configPath(), '{broken');

    const config = await loadWorkspaceConfig(ws);
    expect(config.trash).toEqual([
      {
        trashId: 'trash_1234abcd',
        trashFile: 'trash/trash_1234abcd.canvas.json',
        deletedAt: mtime.getTime(),
        view: {
          id: 'view_old',
          name: 'view_old',
          file: 'views/view_old.canvas.json',
        },
      },
    ]);
  });
});

describe('node metadata never overwrites what it could not read', () => {
  const metadataPath = () => join(ghostDir(), 'node-metadata.json');

  it('rejects and writes nothing when the file cannot be read', async () => {
    // A directory makes readFile fail with EISDIR (not ENOENT, not corrupt).
    await mkdir(metadataPath());
    await expect(loadAllMetadata(ws)).rejects.toThrow();
    await expect(setNodeMetadata(ws, 'n1', { tags: ['x'] })).rejects.toThrow();
    await flushNodeMetadata(ws);
    expect(await readdir(metadataPath())).toEqual([]);
  });

  it('keeps every entry when the first loads race', async () => {
    await writeFile(
      metadataPath(),
      JSON.stringify({
        schema: 'ghostboard-node-metadata/v1',
        entries: { a: { tags: ['keep'] } },
      })
    );
    await Promise.all([
      setNodeMetadata(ws, 'b', { tags: ['one'] }),
      setNodeMetadata(ws, 'c', { tags: ['two'] }),
    ]);
    await flushNodeMetadata(ws);
    const stored = JSON.parse(await readFile(metadataPath(), 'utf8')) as {
      entries: Record<string, unknown>;
    };
    expect(Object.keys(stored.entries).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('legacy tags stay deleted after restart', () => {
  it('does not repeat a completed migration after the last tag is removed', async () => {
    vi.stubGlobal('Bun', {
      file: (path: string) => ({
        exists: async () => existsSync(path),
        text: () => readFile(path, 'utf8'),
      }),
    });
    await mkdir(join(ws, 'content'));
    await writeFile(
      join(ws, 'content', 'legacy.md'),
      '---\nid: note_legacy\ntag: Old\n---\nBody'
    );
    await migrateLegacyTagsFromNotes(ws);
    expect((await loadAllMetadata(ws)).note_legacy).toEqual({ tags: ['Old'] });
    await deleteTagEverywhere(ws, 'Old');
    await flushNodeMetadata(ws);
    resetNodeMetadataCacheForTests(ws);
    await migrateLegacyTagsFromNotes(ws);
    expect(await loadAllMetadata(ws)).toEqual({});
  });
});

describe('metadata durability at RPC and shutdown boundaries', () => {
  it('preserves explicit deletion through JSON and the write schema without clearing omitted fields', async () => {
    await setNodeMetadata(ws, 'note', {
      tags: ['Old', 'Keep'],
      tagColors: { Old: 'red' },
    });
    const wire = JSON.parse(
      JSON.stringify({
        id: 'note',
        metadata: encodeNodeMetadataPatch({
          tagColors: undefined,
        }),
      })
    );
    const params = RPC_WRITE_PARAM_SCHEMAS.setNodeMetadata.parse(wire);
    await setNodeMetadata(ws, params.id, params.metadata);
    await flushAllNodeMetadata();
    resetNodeMetadataCacheForTests();
    expect((await loadAllMetadata(ws)).note).toEqual({
      tags: ['Old', 'Keep'],
    });
  });

  it('folds a legacy primary tag into the single tag list', async () => {
    await setNodeMetadata(ws, 'note', {
      tag: 'Old',
      tagColor: 'red',
      tags: ['Keep', 'old'],
      tagColors: { Keep: 'blue' },
    });
    await flushAllNodeMetadata();
    resetNodeMetadataCacheForTests();
    expect((await loadAllMetadata(ws)).note).toEqual({
      tags: ['Old', 'Keep'],
      tagColors: { Keep: 'blue', Old: 'red' },
    });
  });

  it('folds legacy primary tags already on disk and never writes them back', async () => {
    await mkdir(ghostDir(), { recursive: true });
    await writeFile(
      join(ghostDir(), 'node-metadata.json'),
      JSON.stringify({
        schema: 'ghostboard-node-metadata/v1',
        entries: {
          a: { tag: 'Lead', tagColor: 'yellow', tags: ['Quote'] },
          b: { tagColor: 'red' },
        },
      })
    );
    expect(await loadAllMetadata(ws)).toEqual({
      a: { tags: ['Lead', 'Quote'], tagColors: { Lead: 'yellow' } },
    });
    await setNodeMetadata(ws, 'c', { tags: ['New'] });
    await flushAllNodeMetadata();
    const raw = await readFile(join(ghostDir(), 'node-metadata.json'), 'utf8');
    expect(raw).not.toContain('"tag"');
    expect(raw).not.toContain('"tagColor"');
  });

  it('shutdown flush reports failures and can retry the in-memory data', async () => {
    await setNodeMetadata(ws, 'note', { tags: ['Latest'] });
    const path = join(ghostDir(), 'node-metadata.json');
    await mkdir(path);
    await expect(flushAllNodeMetadata()).rejects.toThrow();
    await rm(path, { recursive: true });
    await flushAllNodeMetadata();
    resetNodeMetadataCacheForTests();
    expect((await loadAllMetadata(ws)).note).toEqual({ tags: ['Latest'] });
  });
});

it('holds application quit until metadata is durable and allows retry after failure', async () => {
  const { default: Electrobun, Utils } = await import('electrobun/bun');
  const { installQuitFlush } = await import('./appLifecycle');
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  installQuitFlush();
  const onQuit = vi
    .mocked(Electrobun.events.on)
    .mock.calls.find(([name]) => name === 'before-quit')?.[1];
  expect(onQuit).toBeDefined();
  await setNodeMetadata(ws, 'quit-note', { tags: ['Saved at quit'] });
  const path = join(ghostDir(), 'node-metadata.json');
  await mkdir(path);
  const event = { response: { allow: true } };
  // Electrobun supplies its native event wrapper; only the response is used here.
  (onQuit as (event: unknown) => void)(event);
  expect(event.response.allow).toBe(false);
  await vi.waitFor(() => expect(errors).toHaveBeenCalled());
  expect(Utils.quit).not.toHaveBeenCalled();
  await rm(path, { recursive: true });
  (onQuit as (event: unknown) => void)({ response: { allow: true } });
  await vi.waitFor(() => expect(Utils.quit).toHaveBeenCalledOnce());
  resetNodeMetadataCacheForTests();
  expect((await loadAllMetadata(ws))['quit-note']).toEqual({
    tags: ['Saved at quit'],
  });
});
