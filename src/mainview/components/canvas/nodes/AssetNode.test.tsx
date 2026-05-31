// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AssetNode, {
  AssetContent,
  formatDuration,
  formatFileSize,
} from './AssetNode';

const OPEN_FILE_RE = /open file/i;
const rpcLoadAttachmentMock = vi.hoisted(() => vi.fn());
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

vi.mock('@/components/card/useNodeTagEditing', () => ({
  useNodeTagEditing: () => ({
    dimmedByFilter: false,
    tag: undefined,
    tagColor: undefined,
    tagEditor: null,
    tags: [],
  }),
}));

vi.mock('@/lib/rpc', () => ({
  rpcLoadAttachment: rpcLoadAttachmentMock,
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

describe('formatDuration', () => {
  it('formats media durations for node metadata', () => {
    expect(formatDuration(65.2)).toBe('1:05');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(undefined)).toBeNull();
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

  it('renders a video thumbnail on the canvas without a player', () => {
    const { container } = render(
      <AssetContent
        data={{
          attachmentFile: 'attachments/video_abc.mp4',
          color: '#ffffff',
          duration: 92,
          fileName: 'demo.mp4',
          kind: 'video',
          mimeType: 'video/mp4',
          size: 4096,
          thumbnailUrl: 'data:image/jpeg;base64,thumb',
          title: 'Demo video',
        }}
      />
    );

    expect(screen.getByAltText('Demo video thumbnail')).toBeInTheDocument();
    expect(screen.getByText('1:32')).toBeInTheDocument();
    expect(container.querySelector('video')).toBeNull();
  });

  it('loads focused video media only through the attachment RPC', async () => {
    rpcLoadAttachmentMock.mockResolvedValueOnce({
      dataUrl: 'data:video/mp4;base64,AAAA',
    });

    render(
      <AssetContent
        data={{
          attachmentFile: 'attachments/video_abc.mp4',
          color: '#ffffff',
          duration: 12,
          fileName: 'demo.mp4',
          kind: 'video',
          mimeType: 'video/mp4',
          size: 4096,
          title: 'Demo video',
        }}
        isFocused
      />
    );

    await waitFor(() => {
      expect(rpcLoadAttachmentMock).toHaveBeenCalledWith(
        'attachments/video_abc.mp4'
      );
    });
    expect(
      await screen.findByLabelText('Demo video video player')
    ).toHaveAttribute('src', 'data:video/mp4;base64,AAAA');
  });

  it('loads focused audio media through the attachment RPC', async () => {
    rpcLoadAttachmentMock.mockResolvedValueOnce({
      dataUrl: 'data:audio/mpeg;base64,AAAA',
    });

    render(
      <AssetContent
        data={{
          attachmentFile: 'attachments/audio_abc.mp3',
          color: '#ffffff',
          duration: 185,
          fileName: 'demo.mp3',
          kind: 'audio',
          mimeType: 'audio/mpeg',
          size: 4096,
          title: 'Demo audio',
        }}
        isFocused
      />
    );

    await waitFor(() => {
      expect(rpcLoadAttachmentMock).toHaveBeenCalledWith(
        'attachments/audio_abc.mp3'
      );
    });
    expect(
      await screen.findByLabelText('Demo audio audio player')
    ).toHaveAttribute('src', 'data:audio/mpeg;base64,AAAA');
  });

  it('loads focused text files into an inline preview', async () => {
    rpcLoadAttachmentMock.mockResolvedValueOnce({
      dataUrl: 'data:text/plain;base64,SGVsbG8gZnJvbSBmaWxl',
    });

    render(
      <AssetContent
        data={{
          attachmentFile: 'attachments/text_abc.txt',
          color: '#ffffff',
          fileName: 'notes.txt',
          kind: 'file',
          mimeType: 'text/plain',
          size: 18,
          title: 'Notes',
        }}
        isFocused
      />
    );

    await waitFor(() => {
      expect(rpcLoadAttachmentMock).toHaveBeenCalledWith(
        'attachments/text_abc.txt'
      );
    });
    expect(await screen.findByText('Hello from file')).toBeInTheDocument();
  });

  it('loads focused PDFs into an inline preview frame', async () => {
    rpcLoadAttachmentMock.mockResolvedValueOnce({
      dataUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
    });

    render(
      <AssetContent
        data={{
          attachmentFile: 'attachments/pdf_abc.pdf',
          color: '#ffffff',
          fileName: 'report.pdf',
          kind: 'file',
          mimeType: 'application/pdf',
          size: 2048,
          title: 'Report',
        }}
        isFocused
      />
    );

    const frame = await screen.findByTitle('Report PDF preview');
    expect(frame).toHaveAttribute(
      'src',
      'data:application/pdf;base64,JVBERi0xLjQ='
    );
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
