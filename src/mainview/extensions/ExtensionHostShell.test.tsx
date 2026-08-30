// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExtensionHostShell } from '@/extensions/ExtensionHostShell';
import { registerBuiltinCanvasTypes } from '@/extensions/registerBuiltins';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import {
  CHECKLIST_CANVAS_TYPE_ID,
  LINK_CANVAS_TYPE_ID,
} from '../../shared/extensions/builtinIds';
import { EXTENSION_INSTANCE_SCHEMA } from '../../shared/extensions/instance';

registerBuiltinCanvasTypes();

vi.mock('@/lib/rpc', () => ({
  rpcCloneExtensionInstance: vi.fn(),
  rpcCreateExtensionInstance: vi.fn(),
  rpcUpdateExtensionInstance: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/components/canvas/nodes/_shared/NodeHandles', () => ({
  NodeHandles: () => <div data-testid="handles" />,
}));

vi.mock('@/components/canvas/nodes/_shared/ResizeHandle', () => ({
  ResizeHandle: () => <div data-testid="resize" />,
}));

const tagEditing = vi.hoisted(() => ({
  dimmedByFilter: false,
  tag: 'work' as string | undefined,
  tagColor: '#DBEAFE' as string | undefined,
  tagColors: { work: '#DBEAFE' } as Record<string, string> | undefined,
  tags: ['work'] as string[] | undefined,
}));

vi.mock('@/components/card/useNodeTagEditing', () => ({
  useNodeTagEditing: () => ({
    dimmedByFilter: tagEditing.dimmedByFilter,
    openTagEditor: vi.fn(),
    tag: tagEditing.tag,
    tagColor: tagEditing.tagColor,
    tagColors: tagEditing.tagColors,
    tagEditor: <div data-testid="tag-editor" />,
    tags: tagEditing.tags,
  }),
}));

describe('ExtensionHostShell', () => {
  beforeEach(() => {
    tagEditing.dimmedByFilter = false;
    tagEditing.tag = 'work';
    tagEditing.tagColor = '#DBEAFE';
    tagEditing.tagColors = { work: '#DBEAFE' };
    tagEditing.tags = ['work'];
    useExtensionInstanceStore.setState({ records: {}, history: {} });
    useCanvasStore.getState().setRenamingNodeId(null);
    document.documentElement.classList.remove('dark');
  });

  it('renders tag chips for types that declare supportsTags', () => {
    render(
      <ExtensionHostShell
        availability="available"
        canvasTypeId={LINK_CANVAS_TYPE_ID}
        instanceId="extinst_link1"
        minHeight={120}
        minWidth={160}
        nodeId="node-1"
        readOnly={false}
        resizable={false}
        selected={false}
      >
        <div>surface</div>
      </ExtensionHostShell>
    );

    expect(screen.getByText('work')).toBeInTheDocument();
    expect(screen.getByTestId('tag-editor')).toBeInTheDocument();
  });

  it('does not render tag chips for productivity widgets', () => {
    render(
      <ExtensionHostShell
        availability="available"
        canvasTypeId={CHECKLIST_CANVAS_TYPE_ID}
        instanceId="extinst_check1"
        minHeight={120}
        minWidth={160}
        nodeId="node-2"
        readOnly={false}
        resizable={false}
        selected={false}
      >
        <div>surface</div>
      </ExtensionHostShell>
    );

    expect(screen.queryByText('work')).toBeNull();
    expect(screen.queryByTestId('tag-editor')).toBeNull();
  });

  it('uses instance fill color for uncolored tag contrast, not the app theme', () => {
    tagEditing.tagColor = undefined;
    tagEditing.tagColors = undefined;
    document.documentElement.classList.add('dark');
    useExtensionInstanceStore.getState().hydrate({
      extinst_link1: {
        schema: EXTENSION_INSTANCE_SCHEMA,
        id: 'extinst_link1',
        canvasTypeId: LINK_CANVAS_TYPE_ID,
        appVersion: '1.0.0',
        dataVersion: 1,
        revision: 1,
        createdAt: '2026-08-19T00:00:00.000Z',
        updatedAt: '2026-08-19T00:01:00.000Z',
        state: {
          url: 'https://example.com',
          title: 'Example',
          color: '#FFFFFF',
        },
        presentation: { title: 'Example' },
      },
    });

    render(
      <ExtensionHostShell
        availability="available"
        canvasTypeId={LINK_CANVAS_TYPE_ID}
        instanceId="extinst_link1"
        minHeight={120}
        minWidth={160}
        nodeId="node-1"
        readOnly={false}
        resizable={false}
        selected={false}
      >
        <div>surface</div>
      </ExtensionHostShell>
    );

    expect(screen.getByText('work')).toHaveClass('text-neutral-700');
  });

  it('commits rename into instance state', async () => {
    useExtensionInstanceStore.getState().hydrate({
      extinst_link1: {
        schema: EXTENSION_INSTANCE_SCHEMA,
        id: 'extinst_link1',
        canvasTypeId: LINK_CANVAS_TYPE_ID,
        appVersion: '1.0.0',
        dataVersion: 1,
        revision: 1,
        createdAt: '2026-08-19T00:00:00.000Z',
        updatedAt: '2026-08-19T00:01:00.000Z',
        state: {
          url: 'https://example.com',
          title: 'Example',
          color: '#FFFFFF',
        },
        presentation: { title: 'Example' },
      },
    });
    useCanvasStore.getState().setRenamingNodeId('node-1');

    render(
      <ExtensionHostShell
        availability="available"
        canvasTypeId={LINK_CANVAS_TYPE_ID}
        instanceId="extinst_link1"
        minHeight={120}
        minWidth={160}
        nodeId="node-1"
        readOnly={false}
        resizable={false}
        selected={false}
      >
        <div>surface</div>
      </ExtensionHostShell>
    );

    const input = screen.getByRole('textbox', { name: 'Rename' });
    fireEvent.change(input, { target: { value: 'Renamed link' } });
    fireEvent.blur(input);

    await waitFor(() => {
      const updated =
        useExtensionInstanceStore.getState().records.extinst_link1;
      expect(
        updated && 'state' in updated ? updated.state : null
      ).toMatchObject({ title: 'Renamed link' });
    });
  });
});
