import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('electrobun/bun', () => ({ Utils: {} }));
const { saveAttachment, saveAttachmentStream } = await import('./attachments');
let ws: string;
beforeEach(async () => {
  vi.stubGlobal('Bun', {
    write: async (path: string, body: Uint8Array | Response) => {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(
        path,
        body instanceof Response
          ? new Uint8Array(await body.arrayBuffer())
          : body
      );
    },
  });
  ws = await mkdtemp(join(tmpdir(), 'attachment-integrity-'));
});
afterEach(async () => {
  await rm(ws, { recursive: true, force: true });
});
it('a failed replacement upload leaves the original attachment intact', async () => {
  await mkdir(join(ws, 'attachments'));
  await writeFile(join(ws, 'attachments/original.txt'), 'Original');
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('Partial'));
      controller.error(new Error('interrupted'));
    },
  });
  await expect(
    saveAttachmentStream(ws, { existingFile: 'attachments/original.txt', body })
  ).rejects.toThrow();
  expect(await readFile(join(ws, 'attachments/original.txt'), 'utf8')).toBe(
    'Original'
  );
  expect(await readdir(join(ws, 'attachments'))).toEqual(['original.txt']);
});
it('a generated name collision never overwrites an existing attachment', async () => {
  const uuid = vi
    .spyOn(crypto, 'randomUUID')
    .mockReturnValue('11111111-1111-4111-8111-111111111111');
  const first = await saveAttachment(ws, {
    dataUrl: 'data:text/plain;base64,T25l',
  });
  await expect(
    saveAttachment(ws, { dataUrl: 'data:text/plain;base64,VHdv' })
  ).rejects.toThrow();
  expect(await readFile(join(ws, first.filePath), 'utf8')).toBe('One');
  uuid.mockRestore();
});

it('publishes all chunks in order and atomically replaces only an explicit target', async () => {
  await mkdir(join(ws, 'attachments'));
  await writeFile(join(ws, 'attachments/replace.txt'), 'Old');
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('First'));
      controller.enqueue(new TextEncoder().encode('Second'));
      controller.close();
    },
  });
  const saved = await saveAttachmentStream(ws, {
    existingFile: 'attachments/replace.txt',
    body,
  });
  expect(await readFile(join(ws, saved.filePath), 'utf8')).toBe('FirstSecond');
  expect(await readdir(join(ws, 'attachments'))).toEqual(['replace.txt']);
});
it('imports a native file through the same durable publication path', async () => {
  const blob = Object.assign(
    new Blob(['Native bytes'], { type: 'text/plain' }),
    { exists: async () => true }
  );
  vi.stubGlobal('Bun', { file: () => blob });
  const { saveAttachmentFile } = await import('./attachments');
  const saved = await saveAttachmentFile(ws, {
    sourcePath: '/native/source.txt',
  });
  expect(await readFile(join(ws, saved.filePath), 'utf8')).toBe('Native bytes');
});
