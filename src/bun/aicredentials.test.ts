import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

let userDataPath = '';

vi.mock('electrobun/bun', () => ({
  Utils: {
    paths: {
      userData: '/mock/Application Support/com.ghostboard.app/dev',
    },
  },
}));

const chmodMock = vi.fn();
const renameMock = vi.fn();
vi.mock('node:fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises'
    );

  return {
    ...actual,
    chmod: (...args: Parameters<typeof chmodMock>) => chmodMock(...args),
    rename: (...args: Parameters<typeof renameMock>) => renameMock(...args),
  };
});

describe('aicredentials', () => {
  beforeEach(async () => {
    vi.resetModules();
    userDataPath = await mkdtemp(join(tmpdir(), 'ai-credentials-test-'));
    vi.stubEnv('GHOSTBOARD_DATA_DIR', userDataPath);
    renameMock.mockReset();
    renameMock.mockImplementation(async (from: string, to: string) => {
      mkdirSync(dirname(to), { recursive: true });
      const data = await readFile(from, 'utf8');
      await writeFile(to, data);
      rmSync(from, { force: true });
    });
    chmodMock.mockReset();
    chmodMock.mockResolvedValue(undefined);
    vi.stubGlobal('Bun', {
      file: vi.fn((filePath: string) => ({
        exists: async () => true,
        json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
      })),
      write: vi.fn(writeFile),
    });
  });

  it('stores the AI API key with user-only file permissions', async () => {
    const { saveAIApiKey } = await import('./aicredentials');

    await saveAIApiKey('sk-test');

    const finalPath = join(userDataPath, 'ai-credentials.json');
    expect(chmodMock).toHaveBeenCalledWith(finalPath, 0o600);
    expect(JSON.parse(readFileSync(finalPath, 'utf8'))).toEqual({
      apiKey: 'sk-test',
    });
  });

  it('preserves other provider keys and migrates legacy keys without reusing them', async () => {
    const data = await mkdtemp(join(tmpdir(), 'ai-provider-keys-'));
    vi.stubEnv('GHOSTBOARD_DATA_DIR', data);
    const { saveAIApiKey, loadAICredentials } = await import('./aicredentials');
    await saveAIApiKey('legacy');
    await saveAIApiKey('legacy', 'openai');
    await Promise.all([
      saveAIApiKey('anthropic-key', 'anthropic'),
      saveAIApiKey('custom-key', 'custom'),
    ]);
    expect(await loadAICredentials()).toMatchObject({
      providers: {
        openai: 'legacy',
        anthropic: 'anthropic-key',
        custom: 'custom-key',
      },
    });
    expect((await loadAICredentials()).apiKey).toBeUndefined();
    await saveAIApiKey(null, 'openai');
    expect((await loadAICredentials()).providers).toEqual({
      anthropic: 'anthropic-key',
      custom: 'custom-key',
    });
  });
});
