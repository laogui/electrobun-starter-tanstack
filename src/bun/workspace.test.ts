import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const DATA_TMP_RE = /^.*data\.json\.[\da-f]+\.tmp$/;
const TRASH_ID_RE = /^trash_/;
const NOTE_ID_RE = /^note_/;

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

  it('removeView returns success=false when attempting to remove the last view', async () => {
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

    await expect(removeView(workspaceRoot, 'default')).resolves.toEqual({
      success: false,
    });
  });

  it('removeView soft-deletes the manifest into trash and reassigns activeViewId', async () => {
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
    writeFileSync(manifestPath, '{"payload":"keep me"}');

    setBunFile((filePath) => ({
      exists: async () => existsSync(filePath),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
    }));

    const result = await removeView(workspaceRoot, 'view-2');
    expect(result.success).toBe(true);
    expect(result.activeViewId).toBe('default');
    expect(result.trashId).toMatch(TRASH_ID_RE);

    const saved = JSON.parse(readFileSync(configPath, 'utf8')) as {
      activeViewId: string;
      views: unknown[];
      trash?: Array<{
        trashId: string;
        trashFile: string;
        view: { id: string };
      }>;
    };
    expect(saved.activeViewId).toBe('default');
    expect(saved.views).toHaveLength(1);
    expect(existsSync(manifestPath)).toBe(false);

    expect(saved.trash).toHaveLength(1);
    const trashEntry = saved.trash?.[0];
    expect(trashEntry?.view.id).toBe('view-2');
    const trashPath = join(
      workspaceRoot,
      '.ghostboard',
      trashEntry?.trashFile ?? ''
    );
    expect(existsSync(trashPath)).toBe(true);
    expect(readFileSync(trashPath, 'utf8')).toBe('{"payload":"keep me"}');
  });

  it('restoreView moves the manifest back and re-adds the view entry', async () => {
    const { initWorkspace, removeView, restoreView } = await import(
      './workspace'
    );
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
    writeFileSync(manifestPath, '{"payload":"keep me"}');

    setBunFile((filePath) => ({
      exists: async () => existsSync(filePath),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
    }));

    const deleted = await removeView(workspaceRoot, 'view-2');
    expect(deleted.trashId).toBeDefined();

    const restored = await restoreView(
      workspaceRoot,
      deleted.trashId as string
    );
    expect(restored.success).toBe(true);
    expect(restored.view?.id).toBe('view-2');

    const saved = JSON.parse(readFileSync(configPath, 'utf8')) as {
      views: Array<{ id: string }>;
      trash?: unknown[];
    };
    expect(saved.views.map((v) => v.id)).toContain('view-2');
    expect(saved.trash ?? []).toHaveLength(0);
    expect(existsSync(manifestPath)).toBe(true);
    expect(readFileSync(manifestPath, 'utf8')).toBe('{"payload":"keep me"}');
  });

  it('restoreView returns success=false for an unknown trashId', async () => {
    const { initWorkspace, restoreView } = await import('./workspace');
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

    await expect(
      restoreView(workspaceRoot, 'trash_does_not_exist')
    ).resolves.toEqual({ success: false });
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

  it('addViewFromTemplate creates a view with populated notes from the kanban template', async () => {
    const { initWorkspace, addViewFromTemplate, loadWorkspaceConfig } =
      await import('./workspace');
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

    const result = await addViewFromTemplate(
      workspaceRoot,
      'My Kanban',
      'kanban'
    );

    expect(result.success).toBe(true);
    expect(result.entry.name).toBe('My Kanban');

    // Verify the view was added to workspace config
    const config = await loadWorkspaceConfig(workspaceRoot);
    const view = config.views.find((v) => v.id === result.entry.id);
    expect(view).toBeDefined();

    // Verify the canvas manifest was written
    const manifestPath = join(workspaceRoot, '.ghostboard', result.entry.file);
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      nodes: Array<{ data: { noteId?: string }; type: string }>;
      edges: unknown[];
    };

    // Should have 10 nodes (3 groups + 6 cards + 1 sticky)
    expect(manifest.nodes).toHaveLength(10);

    // Card nodes should have real noteIds (not template placeholders)
    const cardNodes = manifest.nodes.filter((n) => n.type === 'card');
    expect(cardNodes).toHaveLength(6);
    for (const card of cardNodes) {
      expect(card.data.noteId).toMatch(NOTE_ID_RE);
    }

    // All noteIds should be unique
    const noteIds = cardNodes.map((c) => c.data.noteId);
    expect(new Set(noteIds).size).toBe(6);

    // Verify .md files were created in content/
    const contentDir = join(workspaceRoot, 'content');
    const mdFiles = readdirSync(contentDir).filter((f) => f.endsWith('.md'));
    expect(mdFiles).toHaveLength(6);
  });

  it('addViewFromTemplate throws for a non-existent template', async () => {
    const { initWorkspace, addViewFromTemplate } = await import('./workspace');
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

    await expect(
      addViewFromTemplate(workspaceRoot, 'Test', 'nonexistent')
    ).rejects.toThrow('Template not found: nonexistent');
  });

  it('seedFirstRunIfNeeded populates the default canvas with the demo template on first launch', async () => {
    const { initWorkspace, seedFirstRunIfNeeded } = await import('./workspace');
    initWorkspace(workspaceRoot);

    setBunFile((filePath) => ({
      exists: async () => existsSync(filePath),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
    }));

    await seedFirstRunIfNeeded(workspaceRoot);

    // workspace.json now exists with the default config.
    const configPath = join(workspaceRoot, '.ghostboard', 'workspace.json');
    expect(existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      activeViewId: string;
      views: Array<{ id: string; file: string }>;
    };
    expect(config.activeViewId).toBe('default');

    // Default canvas manifest is populated with demo template content.
    const manifestPath = join(
      workspaceRoot,
      '.ghostboard',
      'views',
      'default.canvas.json'
    );
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      nodes: Array<{ data: { noteId?: string }; type: string }>;
    };
    expect(manifest.nodes.length).toBeGreaterThan(0);
    // Every card noteId in the seeded manifest should be a real note id,
    // not a `tpl-demo-*` placeholder.
    for (const node of manifest.nodes) {
      if (node.type === 'card' && node.data.noteId) {
        expect(node.data.noteId).toMatch(NOTE_ID_RE);
      }
    }
  });

  it('seedFirstRunIfNeeded is a no-op when workspace.json already exists', async () => {
    const { initWorkspace, seedFirstRunIfNeeded } = await import('./workspace');
    initWorkspace(workspaceRoot);

    const configPath = join(workspaceRoot, '.ghostboard', 'workspace.json');
    const customConfig = {
      schema: 'ghostboard-workspace/v1',
      activeViewId: 'custom',
      views: [
        { id: 'custom', name: 'Custom', file: 'views/custom.canvas.json' },
      ],
    };
    writeFileSync(configPath, JSON.stringify(customConfig));

    setBunFile((filePath) => ({
      exists: async () => existsSync(filePath),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
    }));

    await seedFirstRunIfNeeded(workspaceRoot);

    // Existing config left alone; no demo manifest written.
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual(customConfig);
    expect(
      existsSync(
        join(workspaceRoot, '.ghostboard', 'views', 'default.canvas.json')
      )
    ).toBe(false);
  });
});
