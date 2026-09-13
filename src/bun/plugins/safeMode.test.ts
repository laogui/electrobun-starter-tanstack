import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PluginStartupGuard } from './safeMode';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'plugin-safe-mode-test-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function storedState() {
  return JSON.parse(
    await readFile(join(root, 'plugins', 'startup-state.json'), 'utf8')
  ) as Record<string, unknown>;
}

describe('PluginStartupGuard', () => {
  it('marks a normal launch as starting and clears it only after ready', async () => {
    const guard = await PluginStartupGuard.start({
      appDataRoot: root,
      argv: [],
      env: {},
    });
    expect(guard.getState()).toEqual({ active: false, nextStart: 'normal' });
    expect(await storedState()).toMatchObject({ status: 'starting' });
    await guard.markReady();
    expect(await storedState()).toMatchObject({ status: 'ready' });

    const restarted = await PluginStartupGuard.start({
      appDataRoot: root,
      argv: [],
      env: {},
    });
    expect(restarted.getState()).toEqual({
      active: false,
      nextStart: 'normal',
    });
    expect(await storedState()).toMatchObject({ status: 'starting' });
  });

  it('enters sticky recovery safe mode after an incomplete startup', async () => {
    await PluginStartupGuard.start({ appDataRoot: root, argv: [], env: {} });
    const recovery = await PluginStartupGuard.start({
      appDataRoot: root,
      argv: [],
      env: {},
    });
    expect(recovery.getState()).toEqual({
      active: true,
      nextStart: 'safe-mode',
      reason: 'previous-startup-incomplete',
    });
    expect(await storedState()).toMatchObject({
      status: 'safe-mode',
      reason: 'previous-startup-incomplete',
    });

    const stillSafe = await PluginStartupGuard.start({
      appDataRoot: root,
      argv: [],
      env: {},
    });
    expect(stillSafe.getState().active).toBe(true);
    await stillSafe.prepareNormalStart();
    expect(stillSafe.getState()).toMatchObject({
      active: true,
      nextStart: 'normal',
    });

    const normal = await PluginStartupGuard.start({
      appDataRoot: root,
      argv: [],
      env: {},
    });
    expect(normal.getState().active).toBe(false);
  });

  it('honors command-line and environment safe mode before plugin loading', async () => {
    const commandLine = await PluginStartupGuard.start({
      appDataRoot: root,
      argv: ['GhostBoard', '--safe-mode'],
      env: {},
    });
    expect(commandLine.getState()).toEqual({
      active: true,
      nextStart: 'safe-mode',
      reason: 'explicit',
    });
    await commandLine.prepareNormalStart();
    const environment = await PluginStartupGuard.start({
      appDataRoot: root,
      argv: [],
      env: { GHOSTBOARD_SAFE_MODE: '1' },
    });
    expect(environment.getState().reason).toBe('explicit');
  });

  it('fails closed and preserves a damaged startup state', async () => {
    const path = join(root, 'plugins', 'startup-state.json');
    await mkdir(join(root, 'plugins'), { recursive: true });
    await writeFile(path, '{');
    const guard = await PluginStartupGuard.start({
      appDataRoot: root,
      argv: [],
      env: {},
    });
    expect(guard.getState()).toEqual({
      active: true,
      nextStart: 'safe-mode',
      reason: 'startup-state-damaged',
    });
    expect(
      (await readdir(join(root, 'plugins'))).some((name) =>
        name.startsWith('startup-state.json.corrupt-')
      )
    ).toBe(true);
  });

  it('keeps failing closed when only a preserved damaged marker remains', async () => {
    await mkdir(join(root, 'plugins'), { recursive: true });
    await writeFile(
      join(root, 'plugins', 'startup-state.json.corrupt-preserved'),
      '{'
    );
    const guard = await PluginStartupGuard.start({
      appDataRoot: root,
      argv: [],
      env: {},
    });
    expect(guard.getState()).toEqual({
      active: true,
      nextStart: 'safe-mode',
      reason: 'startup-state-damaged',
    });
  });
});
