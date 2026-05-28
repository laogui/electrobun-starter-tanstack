import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcSaveAttachmentMock = vi.fn();
const rpcLoadAttachmentMock = vi.fn();

vi.mock('@/lib/rpc', () => ({
  rpcSaveAttachment: (...args: unknown[]) => rpcSaveAttachmentMock(...args),
  rpcLoadAttachment: (...args: unknown[]) => rpcLoadAttachmentMock(...args),
}));

import {
  inferAttachmentKind,
  resolveBlockNoteFileUrl,
  uploadBlockNoteFile,
} from './blocknoteAttachments';

describe('inferAttachmentKind', () => {
  it('maps mime types to GhostBoard kinds', () => {
    expect(inferAttachmentKind('image/png')).toBe('image');
    expect(inferAttachmentKind('video/mp4')).toBe('video');
    expect(inferAttachmentKind('audio/mpeg')).toBe('audio');
    expect(inferAttachmentKind('application/pdf')).toBe('file');
    expect(inferAttachmentKind(undefined)).toBe('file');
  });
});

class FakeFile {
  constructor(
    public name: string,
    public type: string,
    private readonly bytes: Uint8Array
  ) {}
}

function fakeFile(
  name: string,
  type: string,
  content = new Uint8Array([1, 2, 3])
): File {
  // BlockNote only reads name/type and hands the File to FileReader, which
  // we stub below — so the actual `File` constructor (jsdom) is not needed.
  return new FakeFile(name, type, content) as unknown as File;
}

class FakeFileReader {
  result: string | null = null;
  error: Error | null = null;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  private readonly listeners = new Map<string, Array<() => void>>();

  addEventListener(event: string, cb: () => void) {
    const list = this.listeners.get(event) ?? [];
    list.push(cb);
    this.listeners.set(event, list);
  }

  readAsDataURL(file: File) {
    setTimeout(() => {
      const { type } = file;
      const mime = type || 'application/octet-stream';
      this.result = `data:${mime};base64,AQID`;
      for (const cb of this.listeners.get('load') ?? []) {
        cb();
      }
    }, 0);
  }

  triggerError(message: string) {
    this.error = new Error(message);
    for (const cb of this.listeners.get('error') ?? []) {
      cb();
    }
  }
}

beforeEach(() => {
  rpcSaveAttachmentMock.mockReset();
  rpcLoadAttachmentMock.mockReset();
  vi.stubGlobal('FileReader', FakeFileReader);
});

describe('uploadBlockNoteFile', () => {
  it('saves the file via rpcSaveAttachment and returns the workspace path', async () => {
    rpcSaveAttachmentMock.mockResolvedValue({
      filePath: 'attachments/image_abc.png',
    });
    const result = await uploadBlockNoteFile(fakeFile('cat.png', 'image/png'));
    expect(result).toBe('attachments/image_abc.png');
    expect(rpcSaveAttachmentMock).toHaveBeenCalledWith(
      expect.stringMatching(/^data:image\/png;base64,/),
      undefined,
      {
        kind: 'image',
        mimeType: 'image/png',
        suggestedName: 'cat.png',
      }
    );
  });

  it('throws when the Bun side fails to persist', async () => {
    rpcSaveAttachmentMock.mockResolvedValue(null);
    await expect(uploadBlockNoteFile(fakeFile('a.bin', ''))).rejects.toThrow(
      /Failed to save attachment/
    );
  });
});

describe('resolveBlockNoteFileUrl', () => {
  it('passes through http(s) / data / blob URLs unchanged', async () => {
    await expect(
      resolveBlockNoteFileUrl('https://example.com/x.png')
    ).resolves.toBe('https://example.com/x.png');
    await expect(
      resolveBlockNoteFileUrl('data:image/png;base64,AAAA')
    ).resolves.toBe('data:image/png;base64,AAAA');
    expect(rpcLoadAttachmentMock).not.toHaveBeenCalled();
  });

  it('resolves workspace-relative paths through rpcLoadAttachment', async () => {
    rpcLoadAttachmentMock.mockResolvedValue({
      dataUrl: 'data:image/png;base64,XYZ',
    });
    const out = await resolveBlockNoteFileUrl('attachments/foo.png');
    expect(out).toBe('data:image/png;base64,XYZ');
    expect(rpcLoadAttachmentMock).toHaveBeenCalledWith('attachments/foo.png');
  });

  it('falls back to the raw path when loading fails', async () => {
    rpcLoadAttachmentMock.mockResolvedValue(null);
    await expect(
      resolveBlockNoteFileUrl('attachments/missing.png')
    ).resolves.toBe('attachments/missing.png');
  });

  it('returns the raw path and warns when loadAttachment throws', async () => {
    rpcLoadAttachmentMock.mockRejectedValue(new Error('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(resolveBlockNoteFileUrl('attachments/x.png')).resolves.toBe(
      'attachments/x.png'
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
