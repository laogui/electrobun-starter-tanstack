import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadPluginDirectory } from './loadDirectory';
import {
  closePluginPanel,
  communicateWithPanel,
  openPluginPanel,
  reopenPluginPanel,
  subscribePanel,
} from './panelRuntime';

const PROBE_PANEL_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/plugins/probe-panel'
);

describe('probe-panel view lifecycle', () => {
  it('opens, communicates, closes subscriptions, and reopens with a new view session', async () => {
    const loaded = await loadPluginDirectory(PROBE_PANEL_DIR);
    expect(loaded.manifest.contributes.commands).toEqual([]);
    expect(loaded.manifest.contributes.panels).toHaveLength(1);
    expect(loaded.sources['panel.html']).toContain('probe-panel');

    const opened = openPluginPanel({
      manifest: loaded.manifest,
      workspaceId: 'ws_panel',
      viewId: 'probe',
    });
    expect(opened.session.context.kind).toBe('view');
    const firstViewId =
      opened.session.context.kind === 'view'
        ? opened.session.context.viewSessionId
        : '';
    subscribePanel(opened, 'selection');
    expect(opened.subscriptions.has('selection')).toBe(true);

    const reply = communicateWithPanel(opened, { ping: true });
    expect(reply.identity.pluginId).toBe('community.example.probe-panel');
    expect(reply.identity.workspaceId).toBe('ws_panel');
    expect(reply.context.kind).toBe('view');

    closePluginPanel(opened);
    expect(opened.subscriptions.size).toBe(0);
    expect(() => communicateWithPanel(opened, { ping: true })).toThrow(
      'session is disposed'
    );

    const reopened = reopenPluginPanel(opened);
    const secondViewId =
      reopened.session.context.kind === 'view'
        ? reopened.session.context.viewSessionId
        : '';
    expect(secondViewId).not.toBe(firstViewId);
    expect(
      communicateWithPanel(reopened, { ping: true }).identity.sessionId
    ).toBe(reopened.session.identity.sessionId);
    closePluginPanel(reopened);
  });
});
