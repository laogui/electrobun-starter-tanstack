import type { PluginManifest } from '../../shared/plugins/manifest';
import {
  createPluginSession,
  createViewContext,
  disposeSession,
  type PluginRuntimeSession,
  receivePluginMessage,
} from '../../shared/plugins/session';

export interface PluginPanelHandle {
  session: PluginRuntimeSession;
  subscriptions: Set<string>;
  viewId: string;
}

export function openPluginPanel(input: {
  grantedPermissions?: Iterable<string>;
  manifest: PluginManifest;
  viewId: string;
  workspaceId: string;
}): PluginPanelHandle {
  const view = input.manifest.contributes.panels.find(
    (panel) => panel.id === input.viewId
  );
  if (!view) {
    throw new Error(`unknown panel: ${input.viewId}`);
  }
  const session = createPluginSession({
    manifest: input.manifest,
    workspaceId: input.workspaceId,
    context: createViewContext(),
    grantedPermissions: input.grantedPermissions,
  });
  return {
    viewId: view.id,
    session,
    subscriptions: new Set(),
  };
}

export function subscribePanel(
  handle: PluginPanelHandle,
  subscriptionId: string
): void {
  if (handle.session.disposed) {
    throw Object.assign(new Error('panel is closed'), {
      code: 'runtime-unavailable',
    });
  }
  handle.subscriptions.add(subscriptionId);
}

export function communicateWithPanel(
  handle: PluginPanelHandle,
  payload: unknown
) {
  const received = receivePluginMessage(handle.session, {
    type: 'host-call',
    payload: { method: 'workspace.getIdentity', args: payload },
  });
  if (!received.ok) {
    throw Object.assign(new Error(received.error.message), {
      code: received.error.code,
    });
  }
  return {
    identity: handle.session.identity,
    context: handle.session.context,
  };
}

export function closePluginPanel(handle: PluginPanelHandle): void {
  handle.subscriptions.clear();
  disposeSession(handle.session, 'panel-close');
}

export function reopenPluginPanel(
  handle: PluginPanelHandle
): PluginPanelHandle {
  closePluginPanel(handle);
  return openPluginPanel({
    manifest: handle.session.manifest,
    workspaceId: handle.session.identity.workspaceId,
    viewId: handle.viewId,
    grantedPermissions: handle.session.grantedPermissions,
  });
}
