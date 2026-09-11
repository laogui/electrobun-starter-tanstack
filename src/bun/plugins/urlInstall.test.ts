import { mkdtemp } from 'node:fs/promises';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStoredZip, pluginFiles } from '../../test/pluginPackage';

const lookupMock = vi.hoisted(() => vi.fn());
vi.mock('node:dns/promises', () => ({ lookup: lookupMock }));

import {
  downloadPluginZip,
  loadPluginFromZipUrl,
  PLUGIN_DOWNLOAD_MAX_BYTES,
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

  beforeEach(() => {
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });

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

  it('rejects literal private addresses in every family', () => {
    for (const host of [
      'https://10.1.2.3/p.zip',
      'https://172.16.0.1/p.zip',
      'https://192.168.1.1/p.zip',
      'https://169.254.169.254/p.zip',
      'https://100.64.0.1/p.zip',
      'https://0.0.0.0/p.zip',
      'https://[fd00::1]/p.zip',
      'https://[fe80::1]/p.zip',
      'https://[::ffff:10.0.0.1]/p.zip',
      'https://[::]/p.zip',
      'https://[ff02::1]/p.zip',
    ]) {
      expect(() => parsePluginDownloadUrl(host), host).toThrow(
        PluginDownloadError
      );
    }
  });

  it.each([
    ['127.0.0.1'],
    ['10.0.0.5'],
    ['169.254.169.254'],
    ['fd00::1'],
    ['fe80::1'],
    ['::ffff:10.0.0.1'],
  ])('rejects a hostname that resolves to %s', async (address) => {
    lookupMock.mockResolvedValue([{ address, family: 4 }]);
    const dest = await mkdtemp(join(tmpdir(), 'plugin-url-dns-'));

    await expect(
      loadPluginFromZipUrl({
        url: 'https://plugins.example.com/p.zip',
        destDir: dest,
      })
    ).rejects.toMatchObject({ code: 'forbidden-target' });
    expect(lookupMock).toHaveBeenCalledWith('plugins.example.com', {
      all: true,
    });
  });

  it('rejects when any resolved address is private', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    const dest = await mkdtemp(join(tmpdir(), 'plugin-url-dns-mixed-'));

    await expect(
      loadPluginFromZipUrl({
        url: 'https://plugins.example.com/p.zip',
        destDir: dest,
      })
    ).rejects.toMatchObject({ code: 'forbidden-target' });
  });

  it('rejects a redirect from a public host into the private network', async () => {
    const server = await listen((_req, res) => {
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta' });
      res.end();
    });
    closers.push(server.close);
    const dest = await mkdtemp(join(tmpdir(), 'plugin-url-ssrf-'));
    await expect(
      loadPluginFromZipUrl({
        url: `${server.baseUrl}/go`,
        destDir: dest,
        allowLoopback: true,
      })
    ).rejects.toMatchObject({ code: 'forbidden-target' });
  });

  it('aborts a chunked body once it passes the byte budget', async () => {
    const chunk = Buffer.alloc(256 * 1024, 0x50);
    let sent = 0;
    const server = await listen((_req, res) => {
      // No content-length: the only defence is the streaming budget.
      res.writeHead(200, { 'content-type': 'application/zip' });
      const pump = () => {
        while (sent < PLUGIN_DOWNLOAD_MAX_BYTES * 4) {
          sent += chunk.length;
          if (!res.write(chunk)) {
            res.once('drain', pump);
            return;
          }
        }
        res.end();
      };
      pump();
    });
    closers.push(server.close);
    const dest = await mkdtemp(join(tmpdir(), 'plugin-url-budget-'));

    await expect(
      loadPluginFromZipUrl({
        url: `${server.baseUrl}/plugin.zip`,
        destDir: dest,
        allowLoopback: true,
      })
    ).rejects.toMatchObject({ code: 'resource-limit' });

    // The reader stopped near the budget instead of draining the whole body.
    expect(sent).toBeLessThan(PLUGIN_DOWNLOAD_MAX_BYTES * 4);
  });

  it('gives up on a server that never responds', async () => {
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(200));
    const server = await listen(() => {
      // Never write a response.
    });
    closers.push(server.close);

    await expect(
      downloadPluginZip(`${server.baseUrl}/plugin.zip`, {
        allowLoopback: true,
      })
    ).rejects.toMatchObject({ code: 'download-failed' });
  });
});
