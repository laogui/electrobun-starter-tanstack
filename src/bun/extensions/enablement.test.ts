import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock('electrobun/bun', () => ({
  Utils: { paths: { userData: '/mock-user-data' } },
}));

beforeAll(() => {
  vi.stubGlobal('Bun', {
    file: vi.fn((filePath: string) => ({
      exists: async () => existsSync(filePath),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
    })),
    write: vi.fn(async (filePath: string, data: string) => {
      const dir = filePath.slice(0, filePath.lastIndexOf('/'));
      if (dir) {
        mkdirSync(dir, { recursive: true });
      }
      await writeFile(filePath, data);
    }),
  });
});

import { loadExtensionEnablement, setCanvasTypeEnabled } from './enablement';

describe('extension enablement', () => {
  let wsPath: string;

  beforeEach(() => {
    wsPath = mkdtempSync(join(tmpdir(), 'gb-ext-en-'));
    mkdirSync(join(wsPath, '.ghostboard'), { recursive: true });
  });

  afterEach(() => {
    rmSync(wsPath, { force: true, recursive: true });
  });

  it('defaults to an empty disabled list', async () => {
    await expect(loadExtensionEnablement(wsPath)).resolves.toEqual({
      schema: 'ghostboard-extension-enablement/v1',
      disabledCanvasTypes: [],
    });
  });

  it('disables and re-enables a type without deleting other files', async () => {
    const other = join(wsPath, '.ghostboard', 'extension-instances');
    mkdirSync(other, { recursive: true });
    await writeFile(join(other, 'extinst_keep.json'), '{"keep":true}');

    const disabled = await setCanvasTypeEnabled(
      wsPath,
      'ghostboard.demo/counter',
      false
    );
    expect(disabled.disabledCanvasTypes).toEqual(['ghostboard.demo/counter']);

    const enabled = await setCanvasTypeEnabled(
      wsPath,
      'ghostboard.demo/counter',
      true
    );
    expect(enabled.disabledCanvasTypes).toEqual([]);
    expect(existsSync(join(other, 'extinst_keep.json'))).toBe(true);
  });
});
