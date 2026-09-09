import { describe, expect, it } from 'vitest';

import {
  generatePluginInstallId,
  generatePluginOperationId,
  isPluginId,
  isSemver,
  isThirdPartyPluginId,
  PLUGIN_INSTALL_ID_RE,
} from './ids';

describe('plugin ids', () => {
  it('accepts dotted kebab-case plugin ids', () => {
    expect(isPluginId('community.alice.title-tools')).toBe(true);
    expect(isThirdPartyPluginId('community.alice.title-tools')).toBe(true);
    expect(isThirdPartyPluginId('ghostboard.demo')).toBe(false);
  });

  it('rejects malformed plugin ids', () => {
    expect(isPluginId('TitleTools')).toBe(false);
    expect(isPluginId('title_tools')).toBe(false);
    expect(isPluginId('community')).toBe(false);
  });

  it('generates transaction ids', () => {
    const operationId = generatePluginOperationId();
    expect(operationId.startsWith('plgop_')).toBe(true);
    expect(PLUGIN_INSTALL_ID_RE.test(generatePluginInstallId())).toBe(true);
    expect(isSemver('1.0.0')).toBe(true);
    expect(isSemver('v1')).toBe(false);
  });
});
