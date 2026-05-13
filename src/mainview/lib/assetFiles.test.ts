// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { saveAssetFile } from '@/lib/assetFiles';

const rpcSaveAttachmentMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rpc', () => ({
  rpcSaveAttachment: rpcSaveAttachmentMock,
}));

describe('saveAssetFile', () => {
  it('saves a file through the attachment RPC and returns lightweight metadata', async () => {
    rpcSaveAttachmentMock.mockResolvedValueOnce({
      filePath: 'attachments/file_abc.txt',
    });
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    await expect(saveAssetFile(file)).resolves.toEqual({
      attachmentFile: 'attachments/file_abc.txt',
      color: '#FFFFFF',
      fileName: 'notes.txt',
      kind: 'file',
      mimeType: 'text/plain',
      size: 5,
      title: 'notes.txt',
    });

    expect(rpcSaveAttachmentMock).toHaveBeenCalledWith(
      'data:text/plain;base64,aGVsbG8=',
      undefined,
      {
        kind: 'file',
        mimeType: 'text/plain',
        suggestedName: 'notes.txt',
      }
    );
  });
});
