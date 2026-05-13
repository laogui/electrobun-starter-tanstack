// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AssetNode, { AssetContent, formatFileSize } from './AssetNode';

const OPEN_FILE_RE = /open file/i;
const rpcOpenAttachmentMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div data-testid={`handle-${id}`} />,
  NodeResizeControl: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Position: {
    Top: 'top',
    Right: 'right',
    Bottom: 'bottom',
    Left: 'left',
  },
  useViewport: () => ({ zoom: 1 }),
}));

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (
    selector: (state: { saveSnapshot: () => void }) => unknown
  ) => selector({ saveSnapshot: vi.fn() }),
}));

vi.mock('@/lib/rpc', () => ({
  rpcOpenAttachment: rpcOpenAttachmentMock,
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
  },
}));

describe('formatFileSize', () => {
  it('formats byte counts for asset metadata', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatFileSize(undefined)).toBe('Unknown size');
  });
});

describe('AssetContent', () => {
  it('renders file name, MIME type, and size', () => {
    render(
      <AssetContent
        data={{
          attachmentFile: 'attachments/file_abc.pdf',
          color: '#ffffff',
          fileName: 'report.pdf',
          kind: 'file',
          mimeType: 'application/pdf',
          size: 2048,
          title: 'report.pdf',
        }}
      />
    );

    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText('application/pdf')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });

  it('opens saved attachments from focused view', async () => {
    rpcOpenAttachmentMock.mockResolvedValueOnce({ success: true });

    render(
      <AssetContent
        data={{
          attachmentFile: 'attachments/file_abc.zip',
          color: '#ffffff',
          fileName: 'archive.zip',
          kind: 'file',
          mimeType: 'application/zip',
          size: 1024,
          title: 'archive.zip',
        }}
        isFocused
      />
    );

    fireEvent.click(screen.getByRole('button', { name: OPEN_FILE_RE }));

    await waitFor(() => {
      expect(rpcOpenAttachmentMock).toHaveBeenCalledWith(
        'attachments/file_abc.zip'
      );
    });
  });

  it('shows missing attachment state and disables opening', () => {
    render(
      <AssetContent
        data={{
          attachmentFile: 'attachments/missing.pdf',
          color: '#ffffff',
          fileName: 'missing.pdf',
          kind: 'file',
          mimeType: 'application/pdf',
          missing: true,
          title: 'missing.pdf',
        }}
        isFocused
      />
    );

    expect(screen.getByText('Missing attachment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: OPEN_FILE_RE })).toBeDisabled();
  });
});

describe('AssetNode', () => {
  it('renders asset content with connection handles', () => {
    render(
      <AssetNode
        data={{
          attachmentFile: 'attachments/file_abc.txt',
          color: '#ffffff',
          fileName: 'notes.txt',
          kind: 'file',
          mimeType: 'text/plain',
          title: 'notes.txt',
        }}
        id="asset-1"
      />
    );

    expect(screen.getByText('notes.txt')).toBeInTheDocument();
    expect(screen.getByTestId('handle-top')).toBeInTheDocument();
    expect(screen.getByTestId('handle-right')).toBeInTheDocument();
    expect(screen.getByTestId('handle-bottom')).toBeInTheDocument();
    expect(screen.getByTestId('handle-left')).toBeInTheDocument();
  });
});
