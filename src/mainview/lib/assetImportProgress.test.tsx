// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssetImportProgressToast } from '@/lib/AssetImportProgressToast';
import { saveAssetFileWithProgressToast } from '@/lib/assetImportProgress';

const saveAssetFileMock = vi.hoisted(() => vi.fn());
const toastCustomMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/assetFiles', () => ({
  saveAssetFile: saveAssetFileMock,
}));

vi.mock('sonner', () => ({
  toast: {
    custom: toastCustomMock,
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

afterEach(() => {
  saveAssetFileMock.mockReset();
  toastCustomMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
});

describe('AssetImportProgressToast', () => {
  it('renders file import progress with a visible bar', () => {
    render(
      <AssetImportProgressToast
        fileName="clip.mp4"
        label="Reading file"
        progress={0.42}
      />
    );

    expect(screen.getByText('Adding file')).toBeInTheDocument();
    expect(screen.getByText('clip.mp4')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText('Reading file')).toBeInTheDocument();
  });
});

describe('saveAssetFileWithProgressToast', () => {
  it('updates the progress toast and replaces it with success', async () => {
    const assetData = {
      attachmentFile: 'attachments/file_abc.txt',
      color: '#FFFFFF',
      fileName: 'notes.txt',
      kind: 'file',
      mimeType: 'text/plain',
      size: 5,
      title: 'notes.txt',
    };
    saveAssetFileMock.mockImplementationOnce(async (_file, options) => {
      options.onProgress({
        fileName: 'notes.txt',
        label: 'Reading file',
        progress: 0.5,
      });
      return assetData;
    });
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    await expect(saveAssetFileWithProgressToast(file)).resolves.toEqual(
      assetData
    );

    expect(saveAssetFileMock).toHaveBeenCalledWith(file, {
      onProgress: expect.any(Function),
    });
    expect(toastCustomMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        duration: expect.any(Number),
        id: expect.stringContaining('asset-import-'),
      })
    );
    expect(toastSuccessMock).toHaveBeenCalledWith(
      'File added',
      expect.objectContaining({
        description: 'notes.txt',
        id: expect.stringContaining('asset-import-'),
      })
    );
  });
});
