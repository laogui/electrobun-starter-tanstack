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
  useViewport: () => useViewportMock(),
}));

const saveSnapshotMock = vi.fn();

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (
    selector: (state: {
      commitNodeData: typeof updateNodeDataMock;
      updateNodeData: typeof updateNodeDataMock;
      saveSnapshot: typeof saveSnapshotMock;
    }) => unknown
  ) =>
    selector({
      commitNodeData: updateNodeDataMock,
      updateNodeData: updateNodeDataMock,
      saveSnapshot: saveSnapshotMock,
    }),
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
      <ImageNode
        data={{ color: '#fff', imageUrl: '', isHidden: true }}
        id="image-1"
      />
    );

    expect(
      screen.getByRole('button', { name: CLICK_TO_ADD_IMAGE_RE })
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole('button', { name: 'Click to add image' })
        .closest('.opacity-0')
    ).not.toBeNull();

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
    const clickSpy = vi.spyOn(input, 'click');
    const file = new File(['image'], 'sample.png', { type: 'image/png' });

    fireEvent.click(
      screen.getByRole('button', { name: CLICK_TO_ADD_IMAGE_RE })
    );
    expect(clickSpy).toHaveBeenCalledTimes(1);

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

    expect(input.value).toBe('');
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

  it('ignores paste items without files and reports attachment save failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    rpcSaveAttachmentMock.mockRejectedValueOnce(new Error('save failed'));

    render(
      <ImageNode
        data={{
          color: '#fff',
          imageFile: '/old/file.png',
          imageUrl: '',
          title: '',
        }}
        id="image-4"
      />
    );

    const root = screen
      .getByRole('button', { name: CLICK_TO_ADD_IMAGE_RE })
      .closest('[class~="group/image"]') as HTMLElement;

    const dragOver = new Event('dragover', { bubbles: true, cancelable: true });
    root.dispatchEvent(dragOver);
    expect(dragOver.defaultPrevented).toBe(true);

    fireEvent.paste(root, {
      clipboardData: {
        items: [
          {
            type: 'image/png',
            getAsFile: () => null,
          },
          {
            type: 'text/plain',
            getAsFile: () => null,
          },
        ],
      },
    });
    expect(updateNodeDataMock).not.toHaveBeenCalled();

    fireEvent.drop(root, {
      dataTransfer: {
        files: [new File(['image'], 'failing.png', { type: 'image/png' })],
      },
    });

    await waitFor(() => {
      expect(updateNodeDataMock).toHaveBeenCalledWith('image-4', {
        imageUrl: 'data:image/png;base64,mock',
        title: 'failing',
      });
    });

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        '[ImageNode] Failed to save attachment:',
        expect.any(Error)
      );
    });
  });

  it('does not update imageFile when attachment save returns no file path', async () => {
    rpcSaveAttachmentMock.mockResolvedValueOnce({});

    render(
      <ImageNode
        data={{
          color: '#fff',
          imageFile: '/old/file.png',
          imageUrl: '',
          title: 'Saved',
        }}
        id="image-5"
      />
    );

    const root = screen
      .getByRole('button', { name: CLICK_TO_ADD_IMAGE_RE })
      .closest('[class~="group/image"]') as HTMLElement;

    fireEvent.drop(root, {
      dataTransfer: {
        files: [new File(['image'], 'fresh.png', { type: 'image/png' })],
      },
    });

    await waitFor(() => {
      expect(updateNodeDataMock).toHaveBeenCalledWith('image-5', {
        imageUrl: 'data:image/png;base64,mock',
        title: 'Saved',
      });
    });

    expect(updateNodeDataMock).not.toHaveBeenCalledWith('image-5', {
      imageFile: expect.anything(),
    });
  });
});
