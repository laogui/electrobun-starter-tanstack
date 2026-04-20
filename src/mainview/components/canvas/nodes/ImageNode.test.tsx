// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ImageNode, { ImageContent } from './ImageNode';

const updateNodeDataMock = vi.fn();
const rpcSaveAttachmentMock = vi.fn();
const useViewportMock = vi.fn(() => ({ zoom: 1 }));

const CLICK_TO_ADD_IMAGE_RE = /click to add image/i;

class FileReaderMock {
  result = 'data:image/png;base64,mock';
  private readonly listeners = new Map<
    string,
    (event: { target: { result: string } }) => void
  >();

  addEventListener(
    type: string,
    callback: (event: { target: { result: string } }) => void
  ) {
    this.listeners.set(type, callback);
  }

  readAsDataURL() {
    this.listeners.get('load')?.({ target: { result: this.result } });
  }
}

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div data-testid={`handle-${id}`} />,
  NodeResizeControl: ({
    children,
    onResizeEnd,
    onResizeStart,
  }: {
    children: React.ReactNode;
    onResizeEnd?: () => void;
    onResizeStart?: () => void;
  }) => (
    <div>
      <button onClick={onResizeStart} type="button">
        start resize
      </button>
      <button onClick={onResizeEnd} type="button">
        end resize
      </button>
      {children}
    </div>
  ),
  Position: {
    Top: 'top',
    Right: 'right',
    Bottom: 'bottom',
    Left: 'left',
  },
  useReactFlow: () => ({ updateNodeData: updateNodeDataMock }),
  useViewport: () => useViewportMock(),
}));

vi.mock('@/lib/rpc', () => ({
  rpcSaveAttachment: (...args: unknown[]) => rpcSaveAttachmentMock(...args),
}));

describe('ImageNode', () => {
  vi.stubGlobal('FileReader', FileReaderMock as unknown as typeof FileReader);

  afterEach(() => {
    updateNodeDataMock.mockReset();
    rpcSaveAttachmentMock.mockReset();
    rpcSaveAttachmentMock.mockResolvedValue({ filePath: '/tmp/image.png' });
    useViewportMock.mockReset();
    useViewportMock.mockReturnValue({ zoom: 1 });
    document.body.className = '';
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders empty image state and titled image content variants', () => {
    const { rerender } = render(
      <ImageContent data={{ color: '#fff', imageUrl: '' }} isFocused={false} />
    );

    expect(screen.getByText('No image')).toBeInTheDocument();

    rerender(
      <ImageContent
        data={{
          color: '#fff',
          imageUrl: 'https://example.com/test.png',
          title: 'Cover',
        }}
        isFocused={true}
      />
    );

    expect(screen.getByRole('img', { name: 'Cover' })).toBeInTheDocument();
    expect(screen.getByText('Cover')).toBeInTheDocument();
  });

  it('renders add-image actions and zoomed-out image preview', () => {
    const { rerender } = render(
      <ImageNode data={{ color: '#fff', imageUrl: '' }} id="image-1" />
    );

    expect(
      screen.getByRole('button', { name: CLICK_TO_ADD_IMAGE_RE })
    ).toBeInTheDocument();

    useViewportMock.mockReturnValue({ zoom: 0.2 });
    rerender(
      <ImageNode
        data={{ color: '#fff', imageUrl: 'https://example.com/z.png' }}
        id="image-1"
      />
    );

    expect(
      document.querySelector('img[src="https://example.com/z.png"]')
    ).not.toBeNull();
  });

  it('handles file input uploads and saves attachments', async () => {
    rpcSaveAttachmentMock.mockResolvedValue({ filePath: '/saved/file.png' });
    render(
      <ImageNode
        data={{ color: '#fff', imageFile: undefined, imageUrl: '', title: '' }}
        id="image-2"
      />
    );

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(['image'], 'sample.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(updateNodeDataMock).toHaveBeenCalledWith('image-2', {
        imageUrl: 'data:image/png;base64,mock',
        title: 'sample',
      });
    });

    await waitFor(() => {
      expect(rpcSaveAttachmentMock).toHaveBeenCalledWith(
        'data:image/png;base64,mock',
        undefined
      );
      expect(updateNodeDataMock).toHaveBeenCalledWith('image-2', {
        imageFile: '/saved/file.png',
      });
    });
  });

  it('ignores non-image drops and handles image paste uploads', async () => {
    render(
      <ImageNode
        data={{ color: '#fff', imageUrl: '', title: 'Keep' }}
        id="image-3"
      />
    );

    const root = screen
      .getByRole('button', { name: CLICK_TO_ADD_IMAGE_RE })
      .closest('[class~="group/image"]') as HTMLElement;

    fireEvent.drop(root, {
      dataTransfer: {
        files: [new File(['text'], 'note.txt', { type: 'text/plain' })],
      },
    });
    expect(updateNodeDataMock).not.toHaveBeenCalled();

    const file = new File(['image'], 'paste.png', { type: 'image/png' });
    fireEvent.paste(root, {
      clipboardData: {
        items: [
          {
            type: 'image/png',
            getAsFile: () => file,
          },
        ],
      },
    });

    await waitFor(() => {
      expect(updateNodeDataMock).toHaveBeenCalledWith('image-3', {
        imageUrl: 'data:image/png;base64,mock',
        title: 'Keep',
      });
    });
  });
});
