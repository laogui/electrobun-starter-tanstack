import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electrobun/bun', () => ({
  Utils: { paths: { userData: '/mock-user-data' } },
}));

const {
  loadAICredentials,
  mergeAICredentials,
  migrateLegacyAIApiKey,
  saveAIApiKey,
} = await import('./aicredentials');

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ai-credentials-'));
  vi.stubEnv('GHOSTBOARD_DATA_DIR', root);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { force: true, recursive: true });
});

const credentialsPath = () => join(root, 'ai-credentials.json');

describe('mergeAICredentials', () => {
  it('keeps provider keys when the legacy key changes and vice versa', () => {
    const start = { apiKey: 'legacy', providers: { openai: 'sk-openai' } };
    expect(mergeAICredentials(start, 'new-legacy')).toEqual({
      apiKey: 'new-legacy',
      providers: { openai: 'sk-openai' },
    });
    expect(mergeAICredentials(start, 'sk-ant', 'anthropic')).toEqual({
      apiKey: 'legacy',
      providers: { openai: 'sk-openai', anthropic: 'sk-ant' },
    });
  });

  it('clears only the key that was emptied', () => {
    const start = { apiKey: 'legacy', providers: { openai: 'sk-openai' } };
    expect(mergeAICredentials(start, null, 'openai')).toEqual({
      apiKey: 'legacy',
    });
    expect(mergeAICredentials(start, '  ')).toEqual({
      providers: { openai: 'sk-openai' },
    });
  });
});

describe('saveAIApiKey', () => {
  it('does not let legacy and per-provider saves wipe each other', async () => {
    await saveAIApiKey('sk-openai', 'openai');
    await saveAIApiKey('legacy-key');
    await saveAIApiKey('sk-ant', 'anthropic');
    expect(await loadAICredentials()).toEqual({
      apiKey: 'legacy-key',
      providers: { openai: 'sk-openai', anthropic: 'sk-ant' },
    });
  });

  it('keeps every key when provider saves race', async () => {
    await Promise.all([
      saveAIApiKey('sk-openai', 'openai'),
      saveAIApiKey('sk-ant', 'anthropic'),
      saveAIApiKey('legacy'),
    ]);
    const stored = JSON.parse(await readFile(credentialsPath(), 'utf8'));
    expect(stored).toEqual({
      apiKey: 'legacy',
      providers: { openai: 'sk-openai', anthropic: 'sk-ant' },
    });
  });

  it.skipIf(process.platform === 'win32')(
    'stores the file with owner-only permissions',
    async () => {
      await saveAIApiKey('sk-openai', 'openai');
      // biome-ignore lint/suspicious/noBitwiseOperators: permission mask
      expect((await stat(credentialsPath())).mode & 0o777).toBe(0o600);
    }
  );
});

describe('migrateLegacyAIApiKey', () => {
  it('moves the legacy key onto the provider and drops the legacy field', async () => {
    await saveAIApiKey('legacy-key');
    expect(await migrateLegacyAIApiKey('openai')).toBe('legacy-key');
    expect(await loadAICredentials()).toEqual({
      apiKey: undefined,
      providers: { openai: 'legacy-key' },
    });
    // A cleared provider key must not come back on the next startup.
    await saveAIApiKey(null, 'openai');
    expect(await migrateLegacyAIApiKey('openai')).toBeUndefined();
  });

  it('never overwrites an existing provider key', async () => {
    await saveAIApiKey('sk-openai', 'openai');
    await saveAIApiKey('legacy-key');
    expect(await migrateLegacyAIApiKey('openai')).toBe('sk-openai');
    expect((await loadAICredentials()).apiKey).toBeUndefined();
  });
});
