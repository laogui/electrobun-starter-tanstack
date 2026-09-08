import { mkdtemp, readFile } from 'node:fs/promises';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { requireGhostboardPluginSamplesRoot } from './outOfRepoSamples';
import {
  loadPluginFromZipUrl,
  PluginDownloadError,
  parsePluginDownloadUrl,
} from './urlInstall';

function writeU16(target: number[], value: number): void {
  target.push(value % 256, Math.floor(value / 256) % 256);
}

function writeU32(target: number[], value: number): void {
  writeU16(target, value % 65_536);
  writeU16(target, Math.floor(value / 65_536) % 65_536);
}

function createStoredZip(files: Record<string, string>): Uint8Array {
  const localParts: number[] = [];
  const centralParts: number[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = new TextEncoder().encode(name);
    const data = new TextEncoder().encode(text);
    const localOffset = offset;
    writeU32(localParts, 0x04_03_4b_50);
    writeU16(localParts, 20);
    writeU16(localParts, 0);
    writeU16(localParts, 0);
    writeU16(localParts, 0);
    writeU16(localParts, 0);
    writeU32(localParts, 0);
    writeU32(localParts, data.length);
    writeU32(localParts, data.length);
    writeU16(localParts, nameBytes.length);
    writeU16(localParts, 0);
    localParts.push(...nameBytes, ...data);
    offset += 30 + nameBytes.length + data.length;
    writeU32(centralParts, 0x02_01_4b_50);
    writeU16(centralParts, 20);
    writeU16(centralParts, 20);
    writeU16(centralParts, 0);
    writeU16(centralParts, 0);
    writeU16(centralParts, 0);
    writeU16(centralParts, 0);
    writeU32(centralParts, 0);
    writeU32(centralParts, data.length);
    writeU32(centralParts, data.length);
    writeU16(centralParts, nameBytes.length);
    writeU16(centralParts, 0);
    writeU16(centralParts, 0);
    writeU16(centralParts, 0);
    writeU16(centralParts, 0);
    writeU32(centralParts, 0);
    writeU32(centralParts, localOffset);
    centralParts.push(...nameBytes);
  }
  const eocd: number[] = [];
  writeU32(eocd, 0x06_05_4b_50);
  writeU16(eocd, 0);
  writeU16(eocd, 0);
  writeU16(eocd, Object.keys(files).length);
  writeU16(eocd, Object.keys(files).length);
  writeU32(eocd, centralParts.length);
  writeU32(eocd, localParts.length);
  writeU16(eocd, 0);
  return Uint8Array.from([...localParts, ...centralParts, ...eocd]);
}

const TITLE_TOOLS_DIR = join(
  requireGhostboardPluginSamplesRoot(),
  'title-tools'
);

async function titleToolsZip(): Promise<Uint8Array> {
  return createStoredZip({
    'ghostboard.plugin.json': await readFile(
      join(TITLE_TOOLS_DIR, 'ghostboard.plugin.json'),
      'utf8'
    ),
    'main.js': await readFile(join(TITLE_TOOLS_DIR, 'main.js'), 'utf8'),
  });
}

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

  it('downloads a loopback zip and loads title-tools', async () => {
    const zip = await titleToolsZip();
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
    expect(loaded.manifest.id).toBe('community.example.title-tools');
    expect(loaded.sources['main.js']).toContain('normalizeTitles');
  });

  it('follows a loopback redirect to the zip', async () => {
    const zip = await titleToolsZip();
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
    expect(loaded.manifest.id).toBe('community.example.title-tools');
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
