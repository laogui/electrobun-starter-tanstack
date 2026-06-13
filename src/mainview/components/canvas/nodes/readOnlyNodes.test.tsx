// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AssetNodeReadOnly,
  CardNodeReadOnly,
  FolderNodeReadOnly,
  GroupNodeReadOnly,
  ImageNodeReadOnly,
  LinkNodeReadOnly,
  StickyNodeReadOnly,
} from './readOnlyNodes';

const CLICK_TO_ADD_IMAGE_RE = /click to add image/i;

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div data-testid={`handle-${id}`} />,
  NodeResizeControl: () => null,
  Position: {
    Top: 'top',
    Right: 'right',
    Bottom: 'bottom',
    Left: 'left',
  },
  useReactFlow: () => ({}),
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      children?: React.ReactNode;
    }) => <div {...props}>{children}</div>,
  },
}));

vi.mock('@/components/preview/NotePreview', () => ({
  NotePreview: ({
    excerpt,
    fallback,
    html,
  }: {
    excerpt?: string;
    fallback?: string;
    html?: string;
  }) => (
    <div data-testid="note-preview">
      {html ?? excerpt ?? fallback ?? 'empty-preview'}
    </div>
  ),
}));

// Hard-fail if any read-only wrapper accidentally subscribes to the store.
vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: () => {
    throw new Error('read-only nodes must not subscribe to canvasStore');
  },
}));

// Hard-fail if any read-only wrapper accidentally calls RPC.
vi.mock('@/lib/rpc', () => ({
  rpcOpenAttachment: () => {
    throw new Error('read-only nodes must not open attachments');
  },
  rpcSaveAttachment: () => {
    throw new Error('read-only nodes must not call RPC');
  },
}));

describe('readOnlyNodes', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('CardNodeReadOnly', () => {
    it('renders a default card preview with handles and no editable surfaces', () => {
      render(
        <CardNodeReadOnly
          data={{
            color: '#ffffff',
            content: 'Body',
            previewHtml: '<p>Static preview</p>',
            title: 'Static card',
          }}
        />
      );

      expect(screen.getByText('Static card')).toBeInTheDocument();
      expect(screen.getByTestId('note-preview')).toHaveTextContent(
        '<p>Static preview</p>'
      );
      expect(screen.getByTestId('handle-top')).toBeInTheDocument();
      expect(screen.getByTestId('handle-right')).toBeInTheDocument();
      expect(screen.getByTestId('handle-bottom')).toBeInTheDocument();
      expect(screen.getByTestId('handle-left')).toBeInTheDocument();
      expect(
        document.querySelectorAll('[contenteditable="true"]')
      ).toHaveLength(0);
    });

    it('renders a checklist card without the add-item input', () => {
      render(
        <CardNodeReadOnly
          data={{
            color: '#ffffff',
            items: [
              { checked: false, text: 'Milk' },
              { checked: true, text: 'Eggs' },
            ],
            title: 'Groceries',
            type: 'checklist',
          }}
        />
      );

      expect(screen.getByText('Milk')).toBeInTheDocument();
      expect(screen.getByText('Eggs')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Add item...')).toBeNull();
    });
  });

  describe('ImageNodeReadOnly', () => {
    it('renders an image with alt text and handles', () => {
      render(
        <ImageNodeReadOnly
          data={{
            color: '#ffffff',
            imageUrl: 'https://example.com/cover.png',
            title: 'Cover',
          }}
        />
      );

      expect(screen.getByRole('img', { name: 'Cover' })).toBeInTheDocument();
      expect(screen.getByTestId('handle-right')).toBeInTheDocument();
    });

    it('renders empty placeholder without interactive upload affordance', () => {
      render(<ImageNodeReadOnly data={{ color: '#ffffff', imageUrl: '' }} />);

      expect(screen.getByText('No image')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: CLICK_TO_ADD_IMAGE_RE })
      ).toBeNull();
    });
  });

  describe('LinkNodeReadOnly', () => {
    it('renders link metadata with handles', () => {
      render(
        <LinkNodeReadOnly
          data={{
            color: '#ffffff',
            title: '',
            url: 'https://www.example.com/docs',
          }}
        />
      );

      expect(screen.getAllByText('example.com')).toHaveLength(2);
      expect(screen.getByText('Link')).toBeInTheDocument();
      expect(screen.getByTestId('handle-right')).toBeInTheDocument();
    });
  });

  describe('AssetNodeReadOnly', () => {
    it('renders asset metadata with handles', () => {
      render(
        <AssetNodeReadOnly
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
      expect(screen.getByText('PDF document')).toBeInTheDocument();
      expect(screen.getByTestId('handle-right')).toBeInTheDocument();
    });
  });

  describe('StickyNodeReadOnly', () => {
    it('renders note text as non-editable', () => {
      render(
        <StickyNodeReadOnly
          data={{ color: '#ffee88', content: 'Static sticky' }}
        />
      );

      const text = screen.getByText('Static sticky');
      expect(text).toBeInTheDocument();
      expect(text.getAttribute('contenteditable')).toBe('false');
      expect(screen.getByTestId('handle-bottom')).toBeInTheDocument();
    });

    it('does not call onChange when the body is clicked', () => {
      render(
        <StickyNodeReadOnly
          data={{ color: '#ffee88', content: 'Do not react' }}
        />
      );

      // Clicking should not throw or trigger any store side-effect
      // (useCanvasStore is mocked to throw).
      const text = screen.getByText('Do not react');
      expect(() => fireEvent.click(text)).not.toThrow();
    });
  });

  describe('FolderNodeReadOnly', () => {
    it('renders title and subtitle without contentEditable', () => {
      render(
        <FolderNodeReadOnly data={{ subtitle: '8 items', title: 'Archive' }} />
      );

      const title = screen.getByText('Archive');
      expect(title.getAttribute('contenteditable')).toBeNull();
      expect(screen.getByText('8 items')).toBeInTheDocument();
      expect(screen.getByTestId('handle-left')).toBeInTheDocument();
    });
  });

  describe('GroupNodeReadOnly', () => {
    it('renders label without contentEditable inside canvas-group container', () => {
      const { container } = render(
        <GroupNodeReadOnly data={{ color: 'blue', label: 'Planning' }} />
      );

      const label = screen.getByText('Planning');
      expect(label.getAttribute('contenteditable')).toBe('false');
      expect(container.querySelector('.canvas-group')).not.toBeNull();
      expect(container.querySelector('.group-blue')).not.toBeNull();
      expect(screen.getByTestId('handle-top')).toBeInTheDocument();
    });

    it('falls back to group-blue when color is missing', () => {
      const { container } = render(
        <GroupNodeReadOnly data={{ label: 'Team' }} />
      );

      expect(container.querySelector('.group-blue')).not.toBeNull();
    });
  });
});
