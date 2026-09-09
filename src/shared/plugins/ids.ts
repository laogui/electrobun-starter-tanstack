/** Plugin and transaction identifiers. No Bun or DOM imports. */

export { version as GHOSTBOARD_VERSION } from '../../../package.json';

/** `community.alice.title-tools` — at least one dot, kebab-case labels. */
export const PLUGIN_ID_RE = /^[a-z][a-z0-9-]{0,31}(\.[a-z][a-z0-9-]{0,31})+$/;

export const BUILTIN_PLUGIN_PREFIX = 'ghostboard.';

export const PLUGIN_OPERATION_ID_PREFIX = 'plgop_';
export const PLUGIN_INSTALL_ID_PREFIX = 'plginx_';

export const PLUGIN_OPERATION_ID_RE = /^plgop_[A-Za-z0-9_-]+$/;
export const PLUGIN_INSTALL_ID_RE = /^plginx_[A-Za-z0-9_-]+$/;
export const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[a-z0-9.-]+)?$/;

export const LOCAL_CONTRIBUTION_ID_RE = /^[a-z][a-z0-9-]{0,63}$/;

function randomToken(prefix: string): string {
  return `${prefix}${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
}

export function isPluginId(value: string): boolean {
  return PLUGIN_ID_RE.test(value);
}

export function isThirdPartyPluginId(value: string): boolean {
  return isPluginId(value) && !value.startsWith(BUILTIN_PLUGIN_PREFIX);
}

export function isSemver(value: string): boolean {
  return SEMVER_RE.test(value);
}

export function isLocalContributionId(value: string): boolean {
  return LOCAL_CONTRIBUTION_ID_RE.test(value);
}

export function generatePluginOperationId(): string {
  return randomToken(PLUGIN_OPERATION_ID_PREFIX);
}

export function generatePluginInstallId(): string {
  return randomToken(PLUGIN_INSTALL_ID_PREFIX);
}
