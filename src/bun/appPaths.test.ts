import { homedir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockUserData = '/mock/Application Support/com.ghostboard.app/canary';

vi.mock('electrobun/bun', () => ({
  Utils: {
    paths: {
      get userData() {
        return mockUserData;
      },
    },
  },
}));

describe('appPaths', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mockUserData = '/mock/Application Support/com.ghostboard.app/canary';
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves channel from Electrobun userData and builds ~/.ghostboard/{channel}', async () => {
    const { getAppChannel, getAppDataRoot } = await import('./appPaths');

    expect(getAppChannel()).toBe('canary');
    expect(getAppDataRoot()).toBe(join(homedir(), '.ghostboard', 'canary'));
  });

  it('honors GHOSTBOARD_DATA_DIR override', async () => {
    vi.stubEnv('GHOSTBOARD_DATA_DIR', '/tmp/gb-override');
    const { getAppDataRoot } = await import('./appPaths');

    expect(getAppDataRoot()).toBe('/tmp/gb-override');
  });

  it('falls back to dev when channel cannot be inferred', async () => {
    mockUserData = '/mock-user-data';
    const { getAppChannel, getAppDataRoot } = await import('./appPaths');

    expect(getAppChannel()).toBe('dev');
    expect(getAppDataRoot()).toBe(join(homedir(), '.ghostboard', 'dev'));
  });
});
