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
const WIDGET_ID_RE = /^widget_/;
const TEMPLATE_WIDGET_ID_RE = /^widget_tpl-/;

vi.mock('electrobun/bun', () => ({
  Utils: {
    moveToTrash: vi.fn(),
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
    const { Utils } = await import('electrobun/bun');
    vi.mocked(Utils.moveToTrash).mockReset();
    vi.mocked(Utils.moveToTrash).mockReturnValue(true);
    workspaceRoot = await mkdtemp(join(tmpdir(), 'workspace-test-'));
    renameMock.mockReset();
    renameMock.mockImplementation(async (from: string, to: string) => {
      const data = await readFile(from, 'utf8');
      await writeFile(to, data);
      rmSync(from, { force: true });
    });
  });

  it('getDefaultWorkspacePath uses ~/.ghostboard/{channel}', async () => {
    vi.stubEnv('GHOSTBOARD_DATA_DIR', '/mock-user-data');
    vi.resetModules();
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

  it('keeps trash entries when moving them to system Trash fails', async () => {
    const { Utils } = await import('electrobun/bun');
    const { initWorkspace, clearAllTrash } = await import('./workspace');
    vi.mocked(Utils.moveToTrash).mockReturnValueOnce(false);
    initWorkspace(workspaceRoot);

    const trashFile = 'trash/trash_failed.canvas.json';
    const configPath = join(workspaceRoot, '.ghostboard', 'workspace.json');
    const trashPath = join(workspaceRoot, '.ghostboard', trashFile);
    mkdirSync(join(workspaceRoot, '.ghostboard', 'trash'), { recursive: true });
    writeFileSync(trashPath, '{"payload":"keep me"}');
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
        trash: [
          {
            trashId: 'trash_failed',
            deletedAt: 100,
            trashFile,
            view: {
              id: 'view-2',
              name: 'Second',
              file: 'views/view-2.canvas.json',
            },
          },
        ],
      })
    );

    setBunFile((filePath) => ({
      exists: async () => existsSync(filePath),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
    }));

    await expect(clearAllTrash(workspaceRoot)).resolves.toEqual({
      success: false,
      purged: 0,
    });
    const saved = JSON.parse(readFileSync(configPath, 'utf8')) as {
      trash?: unknown[];
    };
    expect(saved.trash).toHaveLength(1);
  });

  it('keeps a single trash entry when purging it fails', async () => {
    const { Utils } = await import('electrobun/bun');
    const { initWorkspace, purgeTrash } = await import('./workspace');
    vi.mocked(Utils.moveToTrash).mockReturnValueOnce(false);
    initWorkspace(workspaceRoot);

    const trashFile = 'trash/trash_failed.canvas.json';
    const configPath = join(workspaceRoot, '.ghostboard', 'workspace.json');
    const trashPath = join(workspaceRoot, '.ghostboard', trashFile);
    mkdirSync(join(workspaceRoot, '.ghostboard', 'trash'), { recursive: true });
    writeFileSync(trashPath, '{"payload":"keep me"}');
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
        trash: [
          {
            trashId: 'trash_failed',
            deletedAt: 100,
            trashFile,
            view: {
              id: 'view-2',
              name: 'Second',
              file: 'views/view-2.canvas.json',
            },
          },
        ],
      })
    );

    setBunFile((filePath) => ({
      exists: async () => existsSync(filePath),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
    }));

    await expect(purgeTrash(workspaceRoot, 'trash_failed')).resolves.toEqual({
      success: false,
    });
    const saved = JSON.parse(readFileSync(configPath, 'utf8')) as {
      trash?: unknown[];
    };
    expect(saved.trash).toHaveLength(1);
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
      nodes: Array<{
        data: { kind?: string; widgetId?: string };
        type: string;
      }>;
      edges: unknown[];
    };

    // Should have 10 nodes (3 groups + 6 checklist widgets + 1 sticky).
    expect(manifest.nodes).toHaveLength(10);

    // Widget nodes should have real widgetIds (not template placeholders).
    const widgetNodes = manifest.nodes.filter((n) => n.type === 'widget');
    expect(widgetNodes).toHaveLength(6);
    for (const widget of widgetNodes) {
      expect(widget.data).toEqual({
        widgetId: expect.stringMatching(WIDGET_ID_RE),
        kind: 'checklist',
      });
      expect(widget.data.widgetId).not.toMatch(TEMPLATE_WIDGET_ID_RE);
    }

    // All widgetIds should be unique.
    const widgetIds = widgetNodes.map((node) => node.data.widgetId);
    expect(new Set(widgetIds).size).toBe(6);

    // Verify widget JSON files were created under .ghostboard/widgets/.
    const widgetsDir = join(workspaceRoot, '.ghostboard', 'widgets');
    const widgetFiles = readdirSync(widgetsDir).filter((f) =>
      f.endsWith('.json')
    );
    expect(widgetFiles).toHaveLength(6);
  });

  it('populateViewFromTemplate rewrites widget seeds and metadata keys', async () => {
    const { flushNodeMetadata, resetNodeMetadataCacheForTests } = await import(
      './nodeMetadata'
    );
    const { initWorkspace, populateViewFromTemplate } = await import(
      './workspace'
    );
    resetNodeMetadataCacheForTests();
    initWorkspace(workspaceRoot);
    setBunFile((filePath) => ({
      exists: async () => existsSync(filePath),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
    }));

    await populateViewFromTemplate(
      workspaceRoot,
      {
        id: 'view_widget',
        name: 'Widget View',
        file: 'views/widget.canvas.json',
      },
      {
        meta: {
          id: 'widget-template',
          name: 'Widget Template',
          description: '',
          category: 'planning',
          tags: [],
          thumbnail: '',
        },
        nodes: [
          {
            id: 'node-widget',
            type: 'widget',
            position: { x: 0, y: 0 },
            data: { widgetId: 'widget_template_check', kind: 'checklist' },
          },
          {
            id: 'folder-1',
            type: 'folder',
            position: { x: 10, y: 10 },
            data: {
              children: [
                {
                  id: 'child-widget',
                  type: 'widget',
                  data: {
                    widgetId: 'widget_template_reminder',
                    kind: 'reminder',
                  },
                },
              ],
            },
          },
        ],
        edges: [],
        widgets: {
          widget_template_check: {
            schema: 'ghostboard-widget/v1',
            id: 'widget_template_check',
            kind: 'checklist',
            title: 'Template checklist',
            createdAt: '2026-07-08T00:00:00.000Z',
            updatedAt: '2026-07-08T00:00:00.000Z',
            data: {
              items: [{ id: 'item_1', text: 'Seed item', checked: false }],
            },
          },
          widget_template_reminder: {
            schema: 'ghostboard-widget/v1',
            id: 'widget_template_reminder',
            kind: 'reminder',
            title: 'Template reminder',
            createdAt: '2026-07-08T00:00:00.000Z',
            updatedAt: '2026-07-08T00:00:00.000Z',
            data: {
              dueAt: '2026-07-09T09:00:00.000Z',
              timezone: 'Asia/Singapore',
              status: 'scheduled',
            },
          },
        },
        nodeMetadata: {
          widget_template_check: { tag: 'Seed', tagColor: '#D4E08B' },
        },
      }
    );
    await flushNodeMetadata(workspaceRoot);

    const manifest = JSON.parse(
      readFileSync(
        join(workspaceRoot, '.ghostboard', 'views', 'widget.canvas.json'),
        'utf8'
      )
    ) as { nodes: Record<string, any>[] };
    const widgetId = manifest.nodes[0]?.data.widgetId as string;
    const childWidgetId = manifest.nodes[1]?.data.children[0].data
      .widgetId as string;
    expect(widgetId).toMatch(WIDGET_ID_RE);
    expect(widgetId).not.toBe('widget_template_check');
    expect(childWidgetId).toMatch(WIDGET_ID_RE);
    expect(childWidgetId).not.toBe('widget_template_reminder');

    const widgetFiles = readdirSync(
      join(workspaceRoot, '.ghostboard', 'widgets')
    ).filter((file) => file.endsWith('.json'));
    expect(widgetFiles).toEqual(
      expect.arrayContaining([`${widgetId}.json`, `${childWidgetId}.json`])
    );
    const savedWidget = JSON.parse(
      readFileSync(
        join(workspaceRoot, '.ghostboard', 'widgets', `${widgetId}.json`),
        'utf8'
      )
    );
    expect(savedWidget).toMatchObject({
      id: widgetId,
      kind: 'checklist',
      data: { items: [{ id: 'item_1', text: 'Seed item', checked: false }] },
    });

    const metadata = JSON.parse(
      readFileSync(
        join(workspaceRoot, '.ghostboard', 'node-metadata.json'),
        'utf8'
      )
    ) as { entries: Record<string, unknown> };
    expect(metadata.entries[widgetId]).toEqual({
      tag: 'Seed',
      tagColor: '#D4E08B',
    });
    expect(metadata.entries.widget_template_check).toBeUndefined();
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

  it('seedFirstRunIfNeeded populates the default canvas from the seed template on first launch', async () => {
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

    // Default canvas manifest is populated from the configured seed template
    // (currently `quick-start`, see FIRST_RUN_SEED_TEMPLATE_ID in workspace.ts).
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
    // not a `tpl-*` placeholder.
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
