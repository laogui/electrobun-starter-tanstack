// @vitest-environment jsdom

import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { counterCanvasType } from '@/extensions/builtin/counter';
import ExtensionNode from '@/extensions/ExtensionNode';
import { registerBuiltinCanvasTypes } from '@/extensions/registerBuiltins';
import { canvasTypeRegistry } from '@/extensions/registry';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionEnablementStore } from '@/store/extensionEnablementStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import { LINK_CANVAS_TYPE_ID } from '../../shared/extensions/builtinIds';

registerBuiltinCanvasTypes();

const rpcMocks = vi.hoisted(() => ({
  clone: vi.fn(),
  create: vi.fn(),
  setEnabled: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/rpc', () => ({
  rpcCloneExtensionInstance: rpcMocks.clone,
  rpcCreateExtensionInstance: rpcMocks.create,
  rpcSetExtensionEnabled: rpcMocks.setEnabled,
  rpcUpdateExtensionInstance: rpcMocks.update,
}));

vi.mock('@/components/canvas/nodes/_shared/NodeHandles', () => ({
  NodeHandles: () => <div data-testid="handles" />,
}));

vi.mock('@/components/canvas/nodes/_shared/ResizeHandle', () => ({
  ResizeHandle: () => <div data-testid="resize" />,
}));

vi.mock('@/components/card/useNodeTagEditing', () => ({
  useNodeTagEditing: () => ({
    dimmedByFilter: false,
    openTagEditor: vi.fn(),
    tag: undefined,
    tagColor: undefined,
    tagColors: undefined,
    tagEditor: null,
    tags: undefined,
  }),
}));

function renderExtensionNode(canvasTypeId: string, instanceId: string) {
  return render(
    <ExtensionNode
      {...({
        data: { canvasTypeId, instanceId },
        id: 'node-1',
        selected: false,
      } as any)}
    />
  );
}

describe('ExtensionNode damaged-data fallback', () => {
  beforeEach(() => {
    canvasTypeRegistry.clearOwner('example.cards', 1);
    useCanvasStore.getState().reset();
    useExtensionInstanceStore.setState({ records: {}, history: {} });
    useExtensionEnablementStore.setState({ disabledCanvasTypes: [] });
    rpcMocks.clone.mockReset();
    rpcMocks.create.mockReset();
    rpcMocks.setEnabled.mockReset();
    rpcMocks.setEnabled.mockResolvedValue({ success: true });
    rpcMocks.update.mockReset();
    document.documentElement.classList.remove('dark');
  });

  it.each([
    'missing',
    'corrupted',
  ] as const)('shows the original-file-kept message for a %s instance', (error) => {
    const instanceId = `extinst_${error}`;
    useExtensionInstanceStore.getState().hydrate({
      [instanceId]: { id: instanceId, error },
    });

    renderExtensionNode(LINK_CANVAS_TYPE_ID, instanceId);

    expect(
      screen.getByText(
        'This instance could not be loaded. The original file is kept.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText('This canvas type is unavailable. Data is kept.')
    ).toBeNull();
  });

  it('shows an opaque presentation for an unknown canvas type', () => {
    useExtensionInstanceStore.getState().hydrate({
      extinst_future: {
        id: 'extinst_future',
        canvasTypeId: 'ghostboard.future/new-type',
        appVersion: '9.0.0',
        dataVersion: 4,
        revision: 1,
        createdAt: '2026-09-07T00:00:00.000Z',
        updatedAt: '2026-09-07T00:00:00.000Z',
        schema: 'ghostboard-extension-instance/v1',
        state: { fromNewerApp: true },
        presentation: { title: 'Future card', plainText: 'Opaque content' },
      },
    });

    renderExtensionNode('ghostboard.future/new-type', 'extinst_future');

    expect(screen.getByText('Future card')).toBeInTheDocument();
    expect(
      screen.getByText('This canvas type is unavailable. Data is kept.')
    ).toBeInTheDocument();
  });

  it('reacts to late plugin publication and returns to the saved-summary fallback on disable', () => {
    const canvasTypeId = 'example.cards/counter';
    useExtensionInstanceStore.getState().hydrate({
      extinst_public: {
        id: 'extinst_public',
        canvasTypeId,
        appVersion: '1.0.0',
        dataVersion: 1,
        revision: 1,
        createdAt: '2026-09-10T00:00:00.000Z',
        updatedAt: '2026-09-10T00:00:00.000Z',
        schema: 'ghostboard-extension-instance/v1',
        state: { count: 5 },
        presentation: { title: 'Saved public counter', plainText: 'Count 5' },
      },
    });
    renderExtensionNode(canvasTypeId, 'extinst_public');
    expect(screen.getByText('Saved public counter')).toBeInTheDocument();

    act(() => {
      canvasTypeRegistry.replaceOwner('example.cards', 1, [
        { ...counterCanvasType, id: canvasTypeId },
      ]);
    });
    expect(screen.getByText('5')).toBeInTheDocument();

    act(() => {
      canvasTypeRegistry.clearOwner('example.cards', 1);
    });
    expect(screen.getByText('Saved public counter')).toBeInTheDocument();
    expect(
      screen.getByText('This canvas type is unavailable. Data is kept.')
    ).toBeInTheDocument();
  });

  it('does not execute a migration while the canvas type is disabled', async () => {
    const canvasTypeId = 'example.cards/counter';
    canvasTypeRegistry.replaceOwner('example.cards', 1, [
      {
        ...counterCanvasType,
        id: canvasTypeId,
        dataVersion: 2,
        migrateState: () => ({ count: 2 }),
      },
    ]);
    useExtensionEnablementStore.setState({
      disabledCanvasTypes: [canvasTypeId],
    });
    useExtensionInstanceStore.getState().hydrate({
      extinst_disabled_old: {
        id: 'extinst_disabled_old',
        canvasTypeId,
        appVersion: '1.0.0',
        dataVersion: 1,
        revision: 1,
        createdAt: '2026-09-10T00:00:00.000Z',
        updatedAt: '2026-09-10T00:00:00.000Z',
        schema: 'ghostboard-extension-instance/v1',
        state: { count: 1 },
        presentation: { title: 'Disabled counter', plainText: 'Count 1' },
      },
    });

    renderExtensionNode(canvasTypeId, 'extinst_disabled_old');

    expect(
      screen.getByText('This canvas type is disabled in the current workspace.')
    ).toBeInTheDocument();
    await waitFor(() => expect(rpcMocks.update).not.toHaveBeenCalled());
  });
});
