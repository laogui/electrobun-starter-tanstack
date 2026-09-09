import { mkdtemp } from 'node:fs/promises';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createStoredZip, pluginFiles } from '../../test/pluginPackage';
import {
  loadPluginFromZipUrl,
  PluginDownloadError,
  parsePluginDownloadUrl,
} from './urlInstall';

async function listen(
  handler: (req: IncomingMessage, res: ServerResponse) => void
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected tcp address');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

describe('plugin zip url download', () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (closers.length > 0) {
      const close = closers.pop();
      await close?.();
    }
  });

  it('rejects non-https public URLs and userinfo', () => {
    expect(() => parsePluginDownloadUrl('file:///tmp/plugin.zip')).toThrow(
      PluginDownloadError
    );
    expect(() =>
      parsePluginDownloadUrl('http://example.com/plugin.zip')
    ).toThrow(PluginDownloadError);
    expect(() =>
      parsePluginDownloadUrl('https://user:pass@example.com/plugin.zip')
    ).toThrow(PluginDownloadError);
    expect(() => parsePluginDownloadUrl('http://127.0.0.1/plugin.zip')).toThrow(
      PluginDownloadError
    );
    expect(
      parsePluginDownloadUrl('https://example.com/plugin.zip').protocol
    ).toBe('https:');
    expect(
      parsePluginDownloadUrl('http://127.0.0.1:9/plugin.zip', {
        allowLoopback: true,
      }).hostname
    ).toBe('127.0.0.1');
  });

  it('downloads a loopback zip and inspects a v2 app', async () => {
    const zip = createStoredZip(pluginFiles());
    const server = await listen((req, res) => {
      if (req.url === '/plugin.zip') {
        res.writeHead(200, { 'content-type': 'application/zip' });
        res.end(Buffer.from(zip));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    closers.push(server.close);
    const dest = await mkdtemp(join(tmpdir(), 'plugin-url-'));
    const loaded = await loadPluginFromZipUrl({
      url: `${server.baseUrl}/plugin.zip`,
      destDir: dest,
      allowLoopback: true,
    });
    expect(loaded.manifest.id).toBe('community.example.app');
    expect(loaded.sources['main.js']).toBe(pluginFiles()['main.js']);
  });

  it('follows a loopback redirect to the zip', async () => {
    const zip = createStoredZip(pluginFiles());
    const server = await listen((req, res) => {
      if (req.url === '/go') {
        res.writeHead(302, { location: '/plugin.zip' });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(Buffer.from(zip));
    });
    closers.push(server.close);
    const dest = await mkdtemp(join(tmpdir(), 'plugin-url-redirect-'));
    const loaded = await loadPluginFromZipUrl({
      url: `${server.baseUrl}/go`,
      destDir: dest,
      allowLoopback: true,
    });
    expect(loaded.manifest.id).toBe('community.example.app');
  });

  it('rejects an html page even when the path looks like a zip', async () => {
    const server = await listen((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><body>not a plugin</body></html>');
    });
    closers.push(server.close);
    const dest = await mkdtemp(join(tmpdir(), 'plugin-url-html-'));
    await expect(
      loadPluginFromZipUrl({
        url: `${server.baseUrl}/plugin.zip`,
        destDir: dest,
        allowLoopback: true,
      })
    ).rejects.toMatchObject({ code: 'unsupported-source' });
  });
});
