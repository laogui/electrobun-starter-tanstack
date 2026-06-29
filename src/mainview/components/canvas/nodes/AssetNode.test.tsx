// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AssetNode, { AssetContent } from './AssetNode';
import { formatDuration, formatFileSize } from './assetNodeFormat';

const OPEN_FILE_RE = /open file/i;
const resolveAttachmentStreamUrlMock = vi.hoisted(() => vi.fn());
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
}));

vi.mock('@/contexts/ZoomLevelContext', () => ({
  useIsZoomedOut: () => false,
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
  resolveAttachmentStreamUrl: resolveAttachmentStreamUrlMock,
  rpcLoadAttachment: rpcLoadAttachmentMock,
  rpcOpenAttachment: rpcOpenAttachmentMock,
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
  },
}));

vi.mock('../../../../paraglide/messages.js', () => ({
  toast_asset_file_open_failed: () => 'Localized file open failed',
  toast_asset_file_unsaved: () => 'Localized file unsaved',
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
  it('keeps the card face minimal without filename, MIME, or size', () => {
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

    // The card face now fills with the preview only — filename, MIME type, and
    // size all live in the hover card / focused view, so the canvas stays clean.
    expect(screen.queryByText('report.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('application/pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('2.0 KB')).not.toBeInTheDocument();
    // The PDF preview placeholder still renders so the kind reads at a glance.
    expect(screen.getByText('PDF document')).toBeInTheDocument();
  });

  it('provides a title for the truncated focused attachment path', () => {
    render(
      <AssetContent
        data={{
          attachmentFile: 'attachments/report.pdf',
          color: '#ffffff',
          fileName: 'report.pdf',
          kind: 'file',
          mimeType: 'application/octet-stream',
          title: 'Report',
        }}
        isFocused
      />
    );

    expect(screen.getByText('attachments/report.pdf')).toHaveAttribute(
      'title',
      'attachments/report.pdf'
    );
  });

  it('uses localized copy when opening an attachment fails', async () => {
    rpcOpenAttachmentMock.mockResolvedValueOnce({ success: false });

    render(
      <AssetContent
        data={{
          attachmentFile: 'attachments/draft.txt',
          color: '#ffffff',
          fileName: 'draft.txt',
          kind: 'file',
          mimeType: 'application/octet-stream',
          title: 'Draft',
        }}
        isFocused
      />
    );

    fireEvent.click(screen.getByRole('button', { name: OPEN_FILE_RE }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('Localized file open failed');
    });
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

  it('prefers the localhost stream URL for focused video playback', async () => {
    resolveAttachmentStreamUrlMock.mockResolvedValueOnce(
      'http://127.0.0.1:4242/attachment?path=attachments%2Fvideo_abc.mp4&token=abc'
    );

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
      expect(resolveAttachmentStreamUrlMock).toHaveBeenCalledWith(
        'attachments/video_abc.mp4'
      );
    });
    expect(rpcLoadAttachmentMock).not.toHaveBeenCalled();
    expect(
      await screen.findByLabelText('Demo video video player')
    ).toHaveAttribute(
      'src',
      'http://127.0.0.1:4242/attachment?path=attachments%2Fvideo_abc.mp4&token=abc'
    );
  });

  it('falls back to the attachment RPC when streaming is unavailable', async () => {
    resolveAttachmentStreamUrlMock.mockResolvedValueOnce(null);
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

  it('loads focused audio media through the stream URL', async () => {
    resolveAttachmentStreamUrlMock.mockResolvedValueOnce(
      'http://127.0.0.1:4242/attachment?path=attachments%2Faudio_abc.mp3&token=abc'
    );

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
      expect(resolveAttachmentStreamUrlMock).toHaveBeenCalledWith(
        'attachments/audio_abc.mp3'
      );
    });
    expect(rpcLoadAttachmentMock).not.toHaveBeenCalled();
    expect(
      await screen.findByLabelText('Demo audio audio player')
    ).toHaveAttribute(
      'src',
      'http://127.0.0.1:4242/attachment?path=attachments%2Faudio_abc.mp3&token=abc'
    );
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

  it('renders the PDF placeholder badge on the canvas card', () => {
    render(
      <AssetContent
        data={{
          attachmentFile: 'attachments/pdf_abc.pdf',
          color: '#ffffff',
          fileName: 'report.pdf',
          kind: 'file',
          mimeType: 'application/pdf',
          title: 'Report',
        }}
      />
    );

    // The card-mode renderer shows a styled "PDF" badge in addition to the
    // generic asset label so PDF cards are visually distinct on the canvas.
    const badges = screen.getAllByText('PDF');
    expect(badges.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('PDF document')).toBeInTheDocument();
  });

  it('renders a text excerpt preview when previewExcerpt is set', () => {
    render(
      <AssetContent
        data={{
          attachmentFile: 'attachments/text_abc.txt',
          color: '#ffffff',
          fileName: 'notes.txt',
          kind: 'file',
          mimeType: 'text/plain',
          previewExcerpt: 'A short preview of the text file contents.',
          title: 'notes.txt',
        }}
      />
    );

    expect(
      screen.getByText('A short preview of the text file contents.')
    ).toBeInTheDocument();
  });

  it('falls back to a placeholder when text excerpt is missing', () => {
    render(
      <AssetContent
        data={{
          attachmentFile: 'attachments/text_abc.txt',
          color: '#ffffff',
          fileName: 'notes.txt',
          kind: 'file',
          mimeType: 'text/plain',
          title: 'notes.txt',
        }}
      />
    );

    // No excerpt yet, but the canvas card still routes to the text branch and
    // surfaces the MIME type as the lightweight placeholder.
    expect(screen.getAllByText('text/plain').length).toBeGreaterThan(0);
  });

  it('renders an archive summary on the canvas card', () => {
    render(
      <AssetContent
        data={{
          archiveSummary: {
            entryCount: 7,
            topFiles: [
              'README.md',
              'src/index.ts',
              'src/lib.ts',
              'docs/intro.md',
              'docs/guide.md',
            ],
          },
          attachmentFile: 'attachments/zip_abc.zip',
          color: '#ffffff',
          fileName: 'project.zip',
          kind: 'file',
          mimeType: 'application/zip',
          title: 'project.zip',
        }}
      />
    );

    expect(screen.getByText('7 items')).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(screen.getByText('src/index.ts')).toBeInTheDocument();
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });

  it('shows focused image previews immediately from the thumbnail', async () => {
    rpcLoadAttachmentMock.mockImplementation(
      () =>
        new Promise(() => {
          // Intentionally never resolves to ensure we do not block on RPC.
        })
    );

    render(
      <AssetContent
        data={{
          attachmentFile: 'attachments/file_abc.png',
          color: '#ffffff',
          fileName: 'screenshot.png',
          kind: 'file',
          mimeType: 'image/png',
          thumbnailUrl: 'data:image/jpeg;base64,thumb',
          title: 'screenshot.png',
        }}
        isFocused
      />
    );

    expect(
      await screen.findByAltText('screenshot.png preview')
    ).toHaveAttribute('src', 'data:image/jpeg;base64,thumb');
    expect(screen.queryByText('Loading media')).not.toBeInTheDocument();
  });

  it('renders an image-as-file thumbnail when the MIME is image/*', () => {
    render(
      <AssetContent
        data={{
          attachmentFile: 'attachments/file_abc.png',
          color: '#ffffff',
          fileName: 'screenshot.png',
          kind: 'file',
          mimeType: 'image/png',
          thumbnailUrl: 'data:image/jpeg;base64,thumb',
          title: 'screenshot.png',
        }}
      />
    );

    // Image-as-file assets render an inline preview rather than the generic
    // file glyph, so the renderer's createImageThumbnail output is visible.
    expect(screen.getByAltText('screenshot.png thumbnail')).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,thumb'
    );
  });

  it('hides the canvas thumbnail when the attachment is missing', () => {
    render(
      <AssetContent
        data={{
          archiveSummary: { entryCount: 3, topFiles: ['a.txt'] },
          attachmentFile: 'attachments/zip_abc.zip',
          color: '#ffffff',
          fileName: 'project.zip',
          kind: 'file',
          mimeType: 'application/zip',
          missing: true,
          title: 'project.zip',
        }}
      />
    );

    // Missing assets must not render any preview surface — only the generic
    // missing badge appears.
    expect(screen.queryByText('3 items')).not.toBeInTheDocument();
    expect(screen.queryByText('a.txt')).not.toBeInTheDocument();
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

    // Filename is no longer on the card face; the type badge identifies it.
    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument();
    expect(screen.getByText('Text')).toBeInTheDocument();
    expect(screen.getByTestId('handle-top')).toBeInTheDocument();
    expect(screen.getByTestId('handle-right')).toBeInTheDocument();
    expect(screen.getByTestId('handle-bottom')).toBeInTheDocument();
    expect(screen.getByTestId('handle-left')).toBeInTheDocument();
  });
});
