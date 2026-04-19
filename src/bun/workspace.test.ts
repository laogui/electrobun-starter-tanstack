import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const DATA_TMP_RE = /^.*data\.json\.[\da-f]+\.tmp$/;

vi.mock('electrobun/bun', () => ({
  Utils: {
    paths: {
      userData: '/mock-user-data',
    },
  },
}));

const renameMock = vi.fn();
vi.mock('node:fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises'
    );

  return {
    ...actual,
    rename: (...args: Parameters<typeof renameMock>) => renameMock(...args),
  };
});

const setBunFile = (
  handler: (filePath: string) => {
    exists: () => Promise<boolean>;
    json: () => Promise<unknown>;
  }
) => {
  vi.stubGlobal('Bun', {
    file: vi.fn((filePath: string) => handler(filePath)),
    write: vi.fn(writeFile),
  });
};

describe('workspace', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'workspace-test-'));
    renameMock.mockReset();
    renameMock.mockImplementation(async (from: string, to: string) => {
      const data = await readFile(from, 'utf8');
      await writeFile(to, data);
      rmSync(from, { force: true });
    });
  });

  it('getDefaultWorkspacePath uses Electrobun userData', async () => {
    const { getDefaultWorkspacePath } = await import('./workspace');

    expect(getDefaultWorkspacePath()).toBe('/mock-user-data/workspace');
  });

  it('initWorkspace creates the expected directory tree', async () => {
    const { initWorkspace } = await import('./workspace');

    const result = initWorkspace(workspaceRoot);

    expect(result).toBe(workspaceRoot);
    expect(existsSync(join(workspaceRoot, '.ghostboard'))).toBe(true);
    expect(existsSync(join(workspaceRoot, '.ghostboard', 'views'))).toBe(true);
    expect(existsSync(join(workspaceRoot, 'content'))).toBe(true);
    expect(existsSync(join(workspaceRoot, 'attachments'))).toBe(true);
  });

  it('loadWorkspaceConfig writes and returns the default config when missing', async () => {
    const { initWorkspace, loadWorkspaceConfig } = await import('./workspace');
    initWorkspace(workspaceRoot);

    setBunFile((filePath) => ({
      exists: async () => existsSync(filePath),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
    }));

    const config = await loadWorkspaceConfig(workspaceRoot);
    const persisted = JSON.parse(
      readFileSync(join(workspaceRoot, '.ghostboard', 'workspace.json'), 'utf8')
    );

    expect(config).toEqual({
      schema: 'ghostboard-workspace/v1',
      activeViewId: 'default',
      views: [
        {
          id: 'default',
          name: 'Default Canvas',
          file: 'views/default.canvas.json',
        },
      ],
    });
    expect(persisted).toEqual(config);
  });

  it('loadWorkspaceConfig reads an existing config file', async () => {
    const { initWorkspace, loadWorkspaceConfig } = await import('./workspace');
    initWorkspace(workspaceRoot);
    const configPath = join(workspaceRoot, '.ghostboard', 'workspace.json');
    const existing = {
      schema: 'ghostboard-workspace/v1',
      activeViewId: 'focus',
      views: [{ id: 'focus', name: 'Focus', file: 'views/focus.canvas.json' }],
    };
    writeFileSync(configPath, JSON.stringify(existing, null, 2));

    setBunFile((filePath) => ({
      exists: async () => existsSync(filePath),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
    }));

    await expect(loadWorkspaceConfig(workspaceRoot)).resolves.toEqual(existing);
  });

  it('atomicWrite writes to a temp file and renames it into place', async () => {
    const { atomicWrite } = await import('./workspace');

    const targetPath = join(workspaceRoot, 'data.json');
    await atomicWrite(targetPath, '{"ok":true}');

    // tmp filename now includes a random suffix — only assert the final destination
    expect(renameMock).toHaveBeenCalledWith(
      expect.stringMatching(DATA_TMP_RE),
      targetPath
    );
    expect(readFileSync(targetPath, 'utf8')).toBe('{"ok":true}');
  });

  it('saveWorkspaceConfig persists the JSON payload', async () => {
    const { initWorkspace, saveWorkspaceConfig } = await import('./workspace');
    initWorkspace(workspaceRoot);

    await saveWorkspaceConfig(workspaceRoot, {
      schema: 'ghostboard-workspace/v1',
      activeViewId: 'focus',
      views: [{ id: 'focus', name: 'Focus', file: 'views/focus.canvas.json' }],
    });

    const saved = JSON.parse(
      readFileSync(join(workspaceRoot, '.ghostboard', 'workspace.json'), 'utf8')
    ) as { activeViewId: string };
    expect(saved.activeViewId).toBe('focus');
  });

  it('addView appends a new view and makes it active', async () => {
    const { initWorkspace, addView } = await import('./workspace');
    initWorkspace(workspaceRoot);
    mkdirSync(join(workspaceRoot, '.ghostboard'), { recursive: true });

    const configPath = join(workspaceRoot, '.ghostboard', 'workspace.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        schema: 'ghostboard-workspace/v1',
        activeViewId: 'default',
        views: [
          {
            id: 'default',
            name: 'Default Canvas',
            file: 'views/default.canvas.json',
          },
        ],
      })
    );

    setBunFile((filePath) => ({
      exists: async () => existsSync(filePath),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
    }));
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '12345678-abcd-0000-0000-000000000000'
    );

    const entry = await addView(workspaceRoot, 'Inbox');
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      activeViewId: string;
      views: unknown[];
    };

    expect(entry).toEqual({
      id: 'view_12345678',
      name: 'Inbox',
      file: 'views/view_12345678.canvas.json',
    });
    expect(config.activeViewId).toBe('view_12345678');
    expect(config.views).toHaveLength(2);
  });

  it('removeView returns false when attempting to remove the last view', async () => {
    const { initWorkspace, removeView } = await import('./workspace');
    initWorkspace(workspaceRoot);

    const configPath = join(workspaceRoot, '.ghostboard', 'workspace.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        schema: 'ghostboard-workspace/v1',
        activeViewId: 'default',
        views: [
          {
            id: 'default',
            name: 'Default Canvas',
            file: 'views/default.canvas.json',
          },
        ],
      })
    );

    setBunFile((filePath) => ({
      exists: async () => existsSync(filePath),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
    }));

    await expect(removeView(workspaceRoot, 'default')).resolves.toBe(false);
  });

  it('removeView deletes the manifest file and reassigns activeViewId', async () => {
    const { initWorkspace, removeView } = await import('./workspace');
    initWorkspace(workspaceRoot);

    const configPath = join(workspaceRoot, '.ghostboard', 'workspace.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        schema: 'ghostboard-workspace/v1',
        activeViewId: 'view-2',
        views: [
          {
            id: 'default',
            name: 'Default Canvas',
            file: 'views/default.canvas.json',
          },
          { id: 'view-2', name: 'Second', file: 'views/view-2.canvas.json' },
        ],
      })
    );
    const manifestPath = join(
      workspaceRoot,
      '.ghostboard',
      'views',
      'view-2.canvas.json'
    );
    writeFileSync(manifestPath, '{}');

    setBunFile((filePath) => ({
      exists: async () => existsSync(filePath),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
    }));

    await expect(removeView(workspaceRoot, 'view-2')).resolves.toBe(true);
    const saved = JSON.parse(readFileSync(configPath, 'utf8')) as {
      activeViewId: string;
      views: unknown[];
    };

    expect(saved.activeViewId).toBe('default');
    expect(saved.views).toHaveLength(1);
    expect(existsSync(manifestPath)).toBe(false);
  });

  it('renameView updates an existing view name and returns false for missing views', async () => {
    const { initWorkspace, renameView } = await import('./workspace');
    initWorkspace(workspaceRoot);

    const configPath = join(workspaceRoot, '.ghostboard', 'workspace.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        schema: 'ghostboard-workspace/v1',
        activeViewId: 'default',
        views: [
          {
            id: 'default',
            name: 'Default Canvas',
            file: 'views/default.canvas.json',
          },
        ],
      })
    );

    setBunFile((filePath) => ({
      exists: async () => existsSync(filePath),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
    }));

    await expect(renameView(workspaceRoot, 'default', 'Renamed')).resolves.toBe(
      true
    );
    await expect(renameView(workspaceRoot, 'missing', 'Nope')).resolves.toBe(
      false
    );

    const saved = JSON.parse(readFileSync(configPath, 'utf8')) as {
      views: { name: string }[];
    };
    expect(saved.views[0]?.name).toBe('Renamed');
  });
});
