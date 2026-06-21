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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electrobun/bun', () => ({
  Utils: {
    openPath: vi.fn(),
  },
}));

import {
  assertWorkspaceAttachmentPath,
  saveAttachmentStream,
} from './attachments';

const temporaryWorkspaces: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryWorkspaces
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true }))
  );
});

describe('assertWorkspaceAttachmentPath', () => {
  const workspaceRoot = '/tmp/workspace';

  it('accepts normalized paths under attachments/', () => {
    const result = assertWorkspaceAttachmentPath(
      workspaceRoot,
      'attachments/sub/../img_a1b2c3d4.png'
    );

    expect(result.relativePath).toBe('attachments/img_a1b2c3d4.png');
    expect(result.fullPath).toBe('/tmp/workspace/attachments/img_a1b2c3d4.png');
  });

  it('rejects absolute paths', () => {
    expect(() =>
      assertWorkspaceAttachmentPath(
        workspaceRoot,
        '/tmp/workspace/attachments/a.png'
      )
    ).toThrow('Attachment path must be relative.');
  });

  it('rejects paths outside attachments/', () => {
    expect(() =>
      assertWorkspaceAttachmentPath(workspaceRoot, 'content/a.md')
    ).toThrow('Attachment path must stay inside attachments/.');

    expect(() =>
      assertWorkspaceAttachmentPath(workspaceRoot, 'attachments')
    ).toThrow('Attachment path must stay inside attachments/.');
  });

  it('rejects traversal attempts', () => {
    expect(() =>
      assertWorkspaceAttachmentPath(workspaceRoot, 'attachments/../secrets.txt')
    ).toThrow('Attachment path must stay inside attachments/.');
  });
});

describe('saveAttachmentStream', () => {
  beforeEach(() => {
    const bunWriteMock = Bun.write as unknown as {
      mockImplementationOnce: (
        implementation: (
          destination: string,
          input: Blob | ReadableStream | Response | Uint8Array
        ) => Promise<number>
      ) => void;
    };
    bunWriteMock.mockImplementationOnce(async (destination, input) => {
      const data =
        input instanceof Response
          ? new Uint8Array(await input.arrayBuffer())
          : String(input);
      await writeFile(destination, data);
      return typeof data === 'string' ? data.length : data.byteLength;
    });
  });

  it('writes the bytes from a readable stream', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'gb-attachments-'));
    temporaryWorkspaces.push(workspaceRoot);
    await mkdir(join(workspaceRoot, 'attachments'));

    const result = await saveAttachmentStream(workspaceRoot, {
      body: new Response('actual bytes').body!,
      mimeType: 'text/plain',
      suggestedName: 'sample.txt',
    });

    expect(await readFile(join(workspaceRoot, result.filePath), 'utf8')).toBe(
      'actual bytes'
    );
  });

  it('removes a partial temporary file when streaming fails', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'gb-attachments-'));
    temporaryWorkspaces.push(workspaceRoot);
    const attachmentsPath = join(workspaceRoot, 'attachments');
    await mkdir(attachmentsPath);
    const bunWriteMock = Bun.write as unknown as {
      mockReset: () => void;
      mockImplementationOnce: (
        implementation: (destination: string) => Promise<number>
      ) => void;
    };
    bunWriteMock.mockReset();
    bunWriteMock.mockImplementationOnce(async (destination) => {
      await writeFile(destination, 'partial');
      throw new Error('write failed');
    });

    await expect(
      saveAttachmentStream(workspaceRoot, {
        body: new Response('actual bytes').body!,
        mimeType: 'text/plain',
        suggestedName: 'sample.txt',
      })
    ).rejects.toThrow('write failed');

    expect(await readdir(attachmentsPath)).toEqual([]);
  });
});
