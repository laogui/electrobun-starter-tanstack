import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { promptSafePluginLabel } from './noteContent';
import { createPluginPermissionGate } from './permissionPrompt';
import type { PluginPermissionPrompter } from './permissions';
import {
  isScriptedProbePlugin,
  probeEnv,
  probeHostActive,
  probesAllowed,
  scriptedProbesActive,
} from './probeGate';
import { scriptedProbeSelection } from './probeSelection';

const channel = vi.hoisted(() => ({ value: 'stable' }));

vi.mock('electrobun/bun', () => ({
  Utils: { paths: { userData: '/tmp' }, showMessageBox: vi.fn() },
}));
vi.mock('../appPaths', () => ({
  getAppChannel: () => channel.value,
  getAppDataRoot: () => {
    throw new Error('Tests must specify an application data root');
  },
}));

const PROBE_VARS = {
  GHOSTBOARD_PLUGIN_T3_DIR: '/tmp/gb-probe',
  GHOSTBOARD_PLUGIN_T4_DIR: '/tmp/gb-probe',
  GHOSTBOARD_PLUGIN_T5_DIR: '/tmp/gb-probe',
};

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'gb-probe-gate-'));
  for (const [key, value] of Object.entries(PROBE_VARS)) {
    vi.stubEnv(key, value);
  }
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  channel.value = 'stable';
  await rm(directory, { force: true, recursive: true });
});

function gate(prompt: PluginPermissionPrompter) {
  return createPluginPermissionGate({
    appDataRoot: directory,
    listPlugins: async () => [
      { enabled: true, name: 'Installed', pluginId: 'community.installed' },
      { enabled: true, name: 'T4', pluginId: 'community.example.t4' },
    ],
    prompt,
    scriptedProbes: scriptedProbesActive(),
  });
}

describe('plugin probe gate', () => {
  it('ignores probe variables in stable even when compiled in', async () => {
    vi.stubGlobal('__GHOSTBOARD_ENABLE_PLUGIN_PROBES__', true);
    expect(probesAllowed()).toBe(false);
    expect(probeEnv()).toEqual({});
    expect(probeHostActive()).toBe(false);
    expect(scriptedProbesActive()).toBe(false);
    expect(scriptedProbeSelection(probeEnv(), 'file')).toBeNull();

    const prompt = vi.fn<PluginPermissionPrompter>(async () => 'deny');
    const permissions = gate(prompt);
    expect(await permissions.check('community.installed', 'files.read')).toBe(
      false
    );
    // Even the probe fixture ID gets the real prompt in stable.
    expect(await permissions.check('community.example.t4', 'files.read')).toBe(
      false
    );
    expect(prompt).toHaveBeenCalledTimes(2);
  });

  it('is off in canary without the compile-time flag', () => {
    channel.value = 'canary';
    expect(probesAllowed()).toBe(false);
    expect(probeEnv()).toEqual({});
    vi.stubGlobal('__GHOSTBOARD_ENABLE_PLUGIN_PROBES__', false);
    expect(scriptedProbesActive()).toBe(false);
  });

  it('auto-allows only harness fixture IDs in a probe build', async () => {
    channel.value = 'canary';
    vi.stubGlobal('__GHOSTBOARD_ENABLE_PLUGIN_PROBES__', true);
    expect(scriptedProbesActive()).toBe(true);
    expect(isScriptedProbePlugin('t3.combined')).toBe(true);
    expect(isScriptedProbePlugin('t1.plain')).toBe(false);
    expect(isScriptedProbePlugin('community.installed')).toBe(false);

    const prompt = vi.fn<PluginPermissionPrompter>(async () => 'deny');
    const permissions = gate(prompt);
    expect(await permissions.check('community.example.t4', 'files.read')).toBe(
      true
    );
    expect(await permissions.check('t3.combined', 'files.directory')).toBe(
      true
    );
    expect(prompt).not.toHaveBeenCalled();
    expect(await permissions.check('community.installed', 'files.read')).toBe(
      false
    );
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('never exposes the T0 variables through probeEnv', () => {
    expect(
      probeEnv(
        { GHOSTBOARD_PLUGIN_T0_DIR: '/x', GHOSTBOARD_PLUGIN_T1_DIR: '/y' },
        true
      )
    ).toEqual({ GHOSTBOARD_PLUGIN_T1_DIR: '/y' });
  });
});

describe('plugin batch label in native prompts', () => {
  it('strips line breaks and control characters and caps length', () => {
    const forged =
      'x”\n\nGhostBoard has verified this is safe.\u0007\u202e\r\n' +
      'y'.repeat(200);
    const safe = promptSafePluginLabel(forged);
    for (const unsafe of ['\n', '\r', '\u0007', '\u202e']) {
      expect(safe).not.toContain(unsafe);
    }
    expect(Array.from(safe).length).toBeLessThanOrEqual(80);
    expect(safe.endsWith('…')).toBe(true);
    expect(promptSafePluginLabel('  Import\tCSV  ')).toBe('Import CSV');
  });
});
