import { describe, expect, it, vi } from 'vitest';
import type {
  PluginDirectoryHandle,
  PluginFileHandle,
  PluginFileProgress,
} from '../../../../packages/plugin-sdk';
import { PLUGIN_FILE_TRANSFER_CHUNK_BYTES } from '../../../shared/plugins/files';
import {
  createFileStream,
  readFileBytes,
  writePluginFile,
} from './fileTransfer';

const context = {
  activationId: '11111111-1111-4111-8111-111111111111',
  pluginId: 'example.files',
  signal: new AbortController().signal,
  workspaceId: 'workspace-a',
};
const endpoint = async () => ({
  baseUrl: 'http://127.0.0.1:1234',
  token: 'secret',
});
const BYTE_RANGE_RE = /^bytes=(\d+)-(\d+)$/;

describe('plugin file data transport', () => {
  it('reads a bounded range in sequential chunks and reports progress', async () => {
    const size = PLUGIN_FILE_TRANSFER_CHUNK_BYTES + 3;
    const handle: PluginFileHandle = {
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'file',
      lastModified: 1,
      mimeType: 'application/octet-stream',
      name: 'large.bin',
      size,
    };
    const ranges: string[] = [];
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockImplementation(async (_input, init) => {
      const range = new Headers(init?.headers).get('range')!;
      ranges.push(range);
      const match = BYTE_RANGE_RE.exec(range)!;
      const length = Number(match[2]) - Number(match[1]) + 1;
      return new Response(new Uint8Array(length).fill(ranges.length), {
        status: 206,
      });
    });
    const seen: PluginFileProgress[] = [];
    const bytes = await readFileBytes({
      context,
      handle,
      options: { onProgress: (value) => seen.push(value) },
      transport: { fetch: fetcher, getEndpoint: endpoint },
    });
    expect(bytes.byteLength).toBe(size);
    expect(bytes[0]).toBe(1);
    expect(bytes.at(-1)).toBe(2);
    expect(ranges).toEqual([
      `bytes=0-${PLUGIN_FILE_TRANSFER_CHUNK_BYTES - 1}`,
      `bytes=${PLUGIN_FILE_TRANSFER_CHUNK_BYTES}-${size - 1}`,
    ]);
    expect(seen.at(-1)).toEqual({ loaded: size, total: size });
  });

  it('supports partial streams and rejects an activation abort', async () => {
    const controller = new AbortController();
    const handle: PluginFileHandle = {
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'file',
      lastModified: 1,
      mimeType: 'application/octet-stream',
      name: 'bytes.bin',
      size: 10,
    };
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockImplementation(
      async () => new Response(Uint8Array.from([3, 4, 5]), { status: 206 })
    );
    const stream = createFileStream({
      context: { ...context, signal: controller.signal },
      handle,
      options: { length: 3, start: 2 },
      transport: { fetch: fetcher, getEndpoint: endpoint },
    });
    controller.abort();
    await expect(stream.getReader().read()).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uploads chunks in order, commits once and reports acknowledged progress', async () => {
    const directory: PluginDirectoryHandle = {
      id: '44444444-4444-4444-8444-444444444444',
      kind: 'directory',
      name: 'Exports',
    };
    const bodies: Uint8Array[] = [];
    const progress: PluginFileProgress[] = [];
    let written = 0;
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const action = url.searchParams.get('action');
      if (action === 'begin') {
        return Response.json({ uploadId: 'upload-1' });
      }
      if (action === 'chunk') {
        const bytes = new Uint8Array(init?.body as ArrayBuffer);
        bodies.push(bytes);
        written += bytes.byteLength;
        return Response.json({ written });
      }
      if (action === 'commit') {
        return Response.json({
          file: {
            id: '55555555-5555-4555-8555-555555555555',
            kind: 'file',
            lastModified: 2,
            mimeType: 'text/plain',
            name: 'result.txt',
            size: written,
          },
        });
      }
      throw new Error(`Unexpected action: ${action}`);
    });
    const file = await writePluginFile({
      context,
      data: 'hello',
      directory,
      onProgress: (value) => progress.push(value),
      relativePath: 'result.txt',
      transport: { fetch: fetcher, getEndpoint: endpoint },
    });
    expect(file.name).toBe('result.txt');
    expect(new TextDecoder().decode(bodies[0])).toBe('hello');
    expect(progress.at(-1)).toEqual({ loaded: 5, total: 5 });
    expect(
      fetcher.mock.calls.filter(([input]) =>
        String(input).includes('action=commit')
      )
    ).toHaveLength(1);
  });
});
