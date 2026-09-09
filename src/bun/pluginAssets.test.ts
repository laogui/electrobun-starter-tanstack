import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pluginModulePath, servePluginAsset } from './pluginAssets';

let root: string;
const token = 'test-launch-token';
const headers = { 'Access-Control-Allow-Origin': '*' };

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'plugin-assets-'));
  await mkdir(join(root, 'plugin'));
  await writeFile(
    join(root, 'plugin', 'app.js'),
    "export const value = 'entry';"
  );
  await writeFile(
    join(root, 'plugin', 'relative.js'),
    "export const value = 'relative';"
  );
  vi.stubGlobal('Bun', {
    file: (path: string) =>
      new Blob([Uint8Array.from(readFileSync(path))], {
        type: 'application/octet-stream',
      }),
  });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(root, { recursive: true, force: true });
});

function mount() {
  return {
    directory: join(root, 'plugin'),
    id: 'example.plugin',
    version: '0.1.0',
  };
}
function request(path: string, method = 'GET') {
  return servePluginAsset(
    new Request(`http://127.0.0.1${path}`, { method }),
    token,
    [mount()],
    headers
  );
}

describe('plugin HTTP directory mounts', () => {
  it('includes generation in the whole module graph and rejects retired generations', async () => {
    const current = { ...mount(), generation: 'new-generation' };
    const base = pluginModulePath(token, current);
    expect(base).toContain('/0.1.0/new-generation/');
    const response = await servePluginAsset(
      new Request(`http://127.0.0.1${base}relative.js`),
      token,
      [current],
      headers
    );
    expect(response?.status).toBe(200);
    const retired = base.replace('new-generation', 'old-generation');
    expect(
      (
        await servePluginAsset(
          new Request(`http://127.0.0.1${retired}relative.js`),
          token,
          [current],
          headers
        )
      )?.status
    ).toBe(404);
    expect(
      (
        await servePluginAsset(
          new Request(
            `http://127.0.0.1${pluginModulePath(token, mount())}relative.js`
          ),
          token,
          [current],
          headers
        )
      )?.status
    ).toBe(404);
  });
  it('serves entry and relative imports with inherited authentication and JavaScript MIME', async () => {
    const base = pluginModulePath(token, mount());
    const entry = await request(`${base}app.js`);
    expect(entry?.status).toBe(200);
    expect(entry?.headers.get('Content-Type')).toBe(
      'text/javascript; charset=utf-8'
    );
    expect(entry?.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(entry?.headers.get('Cache-Control')).toBe('no-store');
    expect(entry?.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(await entry?.text()).toContain('entry');
    const relative = new URL('./relative.js', `http://127.0.0.1${base}app.js`);
    expect(await (await request(relative.pathname))?.text()).toContain(
      'relative'
    );
  });

  it('does not serve an unknown token, disabled mount, or version', async () => {
    expect(
      (await request('/plugins/wrong/example.plugin/0.1.0/app.js'))?.status
    ).toBe(404);
    expect(
      (await request(`${pluginModulePath(token, mount())}missing.js`))?.status
    ).toBe(404);
    expect(
      (
        await servePluginAsset(
          new Request(
            `http://127.0.0.1${pluginModulePath(token, mount())}app.js`
          ),
          token,
          [],
          headers
        )
      )?.status
    ).toBe(404);
    expect(await request('/ai/chat')).toBeNull();
    expect(await request('/plugins/runtime')).toBeNull();
    expect(await request('/plugins/reload', 'POST')).toBeNull();
  });

  it('rejects traversal and escaping symlinks without exposing host files', async () => {
    await writeFile(join(root, 'outside.js'), 'private');
    await symlink(join(root, 'outside.js'), join(root, 'plugin', 'escape.js'));
    const base = pluginModulePath(token, mount());
    expect((await request(`${base}escape.js`))?.status).toBe(404);
    expect((await request(`${base}%2e%2e%2foutside.js`))?.status).toBe(400);
    expect((await request(`${base}%5coutside.js`))?.status).toBe(400);
    expect((await request(`${base}%00.js`))?.status).toBe(400);
  });

  it('supports HEAD but rejects writes to the mounted directory', async () => {
    const path = `${pluginModulePath(token, mount())}app.js`;
    expect(await (await request(path, 'HEAD'))?.text()).toBe('');
    expect((await request(path, 'POST'))?.status).toBe(405);
  });
});
