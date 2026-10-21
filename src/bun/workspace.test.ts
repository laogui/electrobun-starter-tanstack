import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceConfig } from './workspace';

vi.mock('electrobun/bun', () => ({
  Utils: {
    moveToTrash: vi.fn(() => true),
    paths: { userData: '/mock-user-data' },
  },
}));

const {
  addView,
  loadWorkspaceConfig,
  parseWorkspaceConfig,
  removeView,
  renameView,
  setActiveViewId,
} = await import('./workspace');

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
