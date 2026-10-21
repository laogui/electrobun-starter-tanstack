import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertInside,
  normalizeManifestPath,
  resolveWorkspaceSubpath,
} from './workspacePaths';

let base: string;
let ws: string;
let outside: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'workspace-paths-'));
  ws = join(base, 'ws');
  outside = join(base, 'outside');
  await mkdir(join(ws, 'attachments'), { recursive: true });
  await mkdir(join(ws, 'content'), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, 'secret.txt'), 'secret');
});

afterEach(async () => {
  await rm(base, { force: true, recursive: true });
});

describe('normalizeManifestPath', () => {
  it('normalizes separators and dot segments', () => {
    expect(normalizeManifestPath('attachments/a/../b.png')).toBe(
      'attachments/b.png'
    );
    expect(normalizeManifestPath('./content/x.md')).toBe('content/x.md');
  });
});

describe('assertInside', () => {
  it('accepts nested and not-yet-created paths', () => {
    const root = join(ws, 'attachments');
    expect(assertInside(root, 'a/b/new.png')).toBe(
      join(root, 'a', 'b', 'new.png')
    );
    expect(assertInside(root, '..hidden')).toBe(join(root, '..hidden'));
  });

  it('rejects the root itself, traversal and absolute escapes', () => {
    const root = join(ws, 'attachments');
    expect(() => assertInside(root, '')).toThrow();
    expect(() => assertInside(root, '.')).toThrow();
    expect(() => assertInside(root, '../content/x.md')).toThrow();
    expect(() => assertInside(root, join(outside, 'secret.txt'))).toThrow();
  });

  it.skipIf(process.platform === 'win32')(
    'rejects a symlinked directory that points outside the root',
    async () => {
      const root = join(ws, 'attachments');
      await symlink(outside, join(root, 'linked'));
      expect(() => assertInside(root, 'linked/secret.txt')).toThrow();
      expect(() => assertInside(root, 'linked/new-file.png')).toThrow();
    }
  );

  it.skipIf(process.platform === 'win32')(
    'rejects a symlinked file that points outside the root',
    async () => {
      const root = join(ws, 'attachments');
      await symlink(join(outside, 'secret.txt'), join(root, 'innocent.png'));
      expect(() => assertInside(root, 'innocent.png')).toThrow();
    }
  );

  it.skipIf(process.platform === 'win32')(
    'allows a workspace whose own root is reached through a symlink',
    async () => {
      const alias = join(base, 'alias');
      await symlink(ws, alias);
      expect(assertInside(join(alias, 'attachments'), 'a.png')).toBe(
        join(alias, 'attachments', 'a.png')
      );
    }
  );
});

describe('resolveWorkspaceSubpath', () => {
  const noteRule = { dir: 'content', extension: '.md', label: 'Note' };

  it('returns the normalized relative path and absolute path', () => {
    expect(resolveWorkspaceSubpath(ws, 'content/a/../b.md', noteRule)).toEqual({
      fullPath: join(ws, 'content', 'b.md'),
      relativePath: 'content/b.md',
    });
  });

  it.each([
    ['', 'Note path is required.'],
    ['/etc/passwd', 'Note path must be relative.'],
    ['content', 'Note path must stay inside content/.'],
    ['content/', 'Note path must stay inside content/.'],
    ['attachments/x.md', 'Note path must stay inside content/.'],
    ['content/../../x.md', 'Note path must stay inside content/.'],
    ['content/x.txt', 'Note path must stay inside content/.'],
  ])('rejects %j', (input, message) => {
    expect(() => resolveWorkspaceSubpath(ws, input, noteRule)).toThrow(message);
  });

  it.skipIf(process.platform === 'win32')(
    'rejects a symlink escape below the allowed directory',
    async () => {
      await symlink(outside, join(ws, 'attachments', 'out'));
      expect(() =>
        resolveWorkspaceSubpath(ws, 'attachments/out/secret.txt', {
          dir: 'attachments',
          label: 'Attachment',
        })
      ).toThrow('Attachment path must stay inside attachments/.');
    }
  );
});
