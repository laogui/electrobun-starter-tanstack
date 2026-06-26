import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

let userDataPath = '';

vi.mock('electrobun/bun', () => ({
  Utils: {
    paths: {
      get userData() {
        return userDataPath;
      },
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
});
