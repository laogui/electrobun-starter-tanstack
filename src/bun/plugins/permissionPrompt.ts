import { Utils } from 'electrobun/bun';

import {
  PLUGIN_PERMISSION_DESCRIPTIONS,
  type PluginPermissionDecision,
  PluginPermissionGate,
  type PluginPermissionPrompter,
  PluginPermissionStore,
} from './permissions';
import { isScriptedProbePlugin } from './probeGate';

const BUTTONS = ['Allow Once', 'Always Allow', 'Deny'] as const;
const DENY_INDEX = 2;

/**
 * Native (Bun-process) confirmation dialog for sensitive plugin operations.
 * Drawn by Electrobun's `Utils.showMessageBox`, outside the renderer realm, so
 * plugin code cannot dismiss or auto-accept it. Deny is the default and the
 * Escape/close action.
 */
export const nativePluginPermissionPrompt: PluginPermissionPrompter = async ({
  detail,
  permission,
  pluginId,
  pluginName,
}) => {
  const { response } = await Utils.showMessageBox({
    type: 'warning',
    title: 'Plugin permission',
    message: `“${pluginName}” wants to ${PLUGIN_PERMISSION_DESCRIPTIONS[permission]}.`,
    detail: [
      `Plugin ID: ${pluginId}`,
      detail,
      'Plugins run with the same access as GhostBoard. Only allow this if you trust the plugin. “Always Allow” is remembered for this plugin until the grant is revoked.',
    ]
      .filter(Boolean)
      .join('\n\n'),
    buttons: [...BUTTONS],
    defaultId: DENY_INDEX,
    cancelId: DENY_INDEX,
  });
  const decisions: Record<number, PluginPermissionDecision> = {
    0: 'allow-once',
    1: 'always-allow',
  };
  return decisions[response] ?? 'deny';
};

/**
 * Wire the gate used by the app: grants in `<appDataRoot>`, the native
 * prompt, and installed + enabled plugins only.
 *
 * `scriptedProbes` is true only when `probesAllowed()` (never in stable, never
 * from an environment variable alone) and a T1–T5 harness launched the app.
 * Nobody is present to answer a dialog then, so the harness's own fixture
 * IDs (`isScriptedProbePlugin`) are allowed once. Any other plugin still gets
 * the real native prompt.
 */
export function createPluginPermissionGate(input: {
  appDataRoot: string;
  isScriptedProbePlugin?: (pluginId: string) => boolean;
  listPlugins: () => Promise<
    readonly { enabled: boolean; name: string; pluginId: string }[]
  >;
  prompt?: PluginPermissionPrompter;
  scriptedProbes: boolean;
}): PluginPermissionGate {
  const realPrompt = input.prompt ?? nativePluginPermissionPrompt;
  const isProbe = input.isScriptedProbePlugin ?? isScriptedProbePlugin;
  const scripted = (pluginId: string) =>
    input.scriptedProbes && isProbe(pluginId);
  return new PluginPermissionGate({
    store: new PluginPermissionStore(input.appDataRoot),
    describePlugin: async (pluginId) => {
      if (scripted(pluginId)) {
        return pluginId;
      }
      const plugins = await input.listPlugins();
      return plugins.find(
        (plugin) => plugin.pluginId === pluginId && plugin.enabled
      )?.name;
    },
    prompt: (request) =>
      scripted(request.pluginId)
        ? Promise.resolve('allow-once')
        : realPrompt(request),
  });
}
