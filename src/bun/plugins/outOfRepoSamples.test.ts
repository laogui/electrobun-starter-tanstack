import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PLUGIN_VIEW_SESSION_ID_RE } from '../../shared/plugins/ids';
import {
  createOperationContext,
  createPluginSession,
} from '../../shared/plugins/session';
import { ContentBatchStore } from './contentBatch';
import { loadPluginDirectory } from './loadDirectory';
import { runPluginCommand } from './logicRuntime';
import { requireGhostboardPluginSamplesRoot } from './outOfRepoSamples';
import {
  closePluginPanel,
  communicateWithPanel,
  openPluginPanel,
  reopenPluginPanel,
} from './panelRuntime';
import { createContentBatchProbeHost } from './probeHost';

const SAMPLES_ROOT = requireGhostboardPluginSamplesRoot();
const TITLE_TOOLS_DIR = join(SAMPLES_ROOT, 'title-tools');
const NOTES_PANEL_DIR = join(SAMPLES_ROOT, 'probe-panel');
const HOST_MARKERS = [
  'instanceId',
  'useCanvasStore',
  'electrobun',
  "from '@/",
  'from "@/',
  'node:fs',
  'src/bun',
  'src/mainview',
];

describe('portable plugin samples', () => {
  it('loads the command package without host imports or instance identity', async () => {
    const loaded = await loadPluginDirectory(TITLE_TOOLS_DIR);
    expect(loaded.directory.startsWith(SAMPLES_ROOT)).toBe(true);
    expect(loaded.manifest.id).toBe('community.example.title-tools');
    expect(loaded.manifest.contributes.commands).toHaveLength(1);
    expect(loaded.manifest.contributes.panels).toEqual([]);
    expect(loaded.manifest.contributes.canvasTypes).toEqual([]);
    const source = loaded.sources['main.js'] ?? '';
    for (const marker of HOST_MARKERS) {
      expect(source).not.toContain(marker);
    }
  });

  it('runs normalize-titles from the resolved command package', async () => {
    const loaded = await loadPluginDirectory(TITLE_TOOLS_DIR);
    const store = new ContentBatchStore();
    store.seed([
      { entityId: 'note_a', title: '  Hello   world ', revision: 3 },
    ]);
    const session = createPluginSession({
      manifest: loaded.manifest,
      workspaceId: 'ws_out_of_repo',
      context: createOperationContext(),
      grantedPermissions: ['content.selection.read', 'content.selection.write'],
    });
    expect(session.context.kind).toBe('operation');
    if (session.context.kind === 'operation') {
      expect(session.context).not.toHaveProperty('instanceId');
    }
    const operationId =
      session.context.kind === 'operation' ? session.context.operationId : '';
    const frozen = await store.freezeSelection({
      operationId,
      entityIds: ['note_a'],
    });

    const result = await runPluginCommand({
      session,
      commandId: 'normalize-titles',
      source: loaded.sources['main.js'] ?? '',
      probe: createContentBatchProbeHost(store, operationId, 'ws_out_of_repo'),
    });
    expect(result.preview).toEqual([
      { token: frozen[0]?.token, title: 'Hello world' },
    ]);
    expect((await store.get('note_a'))?.title).toBe('Hello world');
  });

  it('loads the panel package on a host-issued view session without instanceId', async () => {
    const loaded = await loadPluginDirectory(NOTES_PANEL_DIR);
    expect(loaded.manifest.id).toBe('community.example.probe-panel');
    expect(loaded.manifest.contributes.panels).toHaveLength(1);
    expect(loaded.manifest.contributes.commands).toEqual([]);
    const html = loaded.sources['panel.html'] ?? '';
    for (const marker of HOST_MARKERS) {
      expect(html).not.toContain(marker);
    }
    expect(html).toContain('viewSessionId');

    const opened = openPluginPanel({
      manifest: loaded.manifest,
      workspaceId: 'ws_out_of_repo',
      viewId: 'probe',
    });
    expect(opened.session.context.kind).toBe('view');
    if (opened.session.context.kind === 'view') {
      expect(opened.session.context.viewSessionId).toMatch(
        PLUGIN_VIEW_SESSION_ID_RE
      );
      expect(opened.session.context).not.toHaveProperty('instanceId');
    }
    const first =
      opened.session.context.kind === 'view'
        ? opened.session.context.viewSessionId
        : '';
    const reply = communicateWithPanel(opened, { ping: true });
    expect(reply.identity.pluginId).toBe('community.example.probe-panel');
    expect(reply.context.kind).toBe('view');

    const reopened = reopenPluginPanel(opened);
    const second =
      reopened.session.context.kind === 'view'
        ? reopened.session.context.viewSessionId
        : '';
    expect(second).not.toBe(first);
    closePluginPanel(reopened);
  });
});
