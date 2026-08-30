import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/rpc', () => ({
  rpcCloneExtensionInstance: vi.fn(),
  rpcCreateExtensionInstance: vi.fn(),
  rpcUpdateExtensionInstance: vi.fn(async () => ({ success: true })),
}));

const toastMock = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: toastMock,
}));

vi.mock('../../paraglide/messages.js', () => ({
  toast_color_change_failed: () => 'Could not change color',
}));

import { CARD_COLORS } from '@/lib/colorUtils';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import { LINK_CANVAS_TYPE_ID } from '../../shared/extensions/builtinIds';
import {
  EXTENSION_INSTANCE_SCHEMA,
  type ExtensionInstanceRecord,
} from '../../shared/extensions/instance';
import { linkCanvasType } from './builtin/web/link';
import {
  assembleExtensionMenuItems,
  cycleExtensionColor,
  listHostGenericMenuActions,
  resolveExtensionCanvasTypeId,
  runExtensionMenuAction,
} from './hostMenu';
import { registerBuiltinCanvasTypes } from './registerBuiltins';
import { type AnyBuiltinCanvasType, colorFieldInteractions } from './types';

registerBuiltinCanvasTypes();

function makeLinkRecord(
  overrides?: Partial<ExtensionInstanceRecord>
): ExtensionInstanceRecord {
  return {
    schema: EXTENSION_INSTANCE_SCHEMA,
    id: 'extinst_linkcolor1',
    canvasTypeId: LINK_CANVAS_TYPE_ID,
    appVersion: '1.0.0',
    dataVersion: 1,
    revision: 1,
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:01:00.000Z',
    state: { url: 'https://example.com', title: 'Example', color: '#FFFFFF' },
    presentation: { title: 'Example', plainText: 'https://example.com' },
    ...overrides,
  };
}

describe('listHostGenericMenuActions', () => {
  it('includes focus, color, and tags when the type declares them', () => {
    expect(
      listHostGenericMenuActions({
        openBehavior: linkCanvasType.surface.openBehavior,
        interactions: linkCanvasType.interactions,
      })
    ).toEqual([
      'focus',
      'copy',
      'change-color',
      'edit-tag',
      'toggle-lock',
      'delete',
    ]);
  });

  it('keeps the widget-sized menu when nothing is declared', () => {
    expect(listHostGenericMenuActions({})).toEqual([
      'copy',
      'toggle-lock',
      'delete',
    ]);
  });

  it('adds move-to-library when canDetach is declared', () => {
    expect(
      listHostGenericMenuActions({
        openBehavior: 'detail',
        interactions: {
          color: colorFieldInteractions<{ color: string }>(),
          supportsTags: true,
          canDetach: true,
        },
      })
    ).toEqual([
      'focus',
      'copy',
      'change-color',
      'edit-tag',
      'toggle-lock',
      'detach-from-canvas',
      'delete',
    ]);
  });
});

describe('resolveExtensionCanvasTypeId', () => {
  it('reads canvasTypeId from a top-level node', () => {
    expect(
      resolveExtensionCanvasTypeId(
        [
          {
            id: 'n1',
            data: {
              canvasTypeId: LINK_CANVAS_TYPE_ID,
              instanceId: 'extinst_a',
            },
          },
        ],
        'n1'
      )
    ).toBe(LINK_CANVAS_TYPE_ID);
  });

  it('reads canvasTypeId from a folder child', () => {
    expect(
      resolveExtensionCanvasTypeId(
        [
          {
            id: 'folder-1',
            data: {
              children: [
                {
                  id: 'child-1',
                  data: {
                    canvasTypeId: LINK_CANVAS_TYPE_ID,
                    instanceId: 'extinst_a',
                  },
                },
              ],
            },
          },
        ],
        'child-1',
        'folder-1'
      )
    ).toBe(LINK_CANVAS_TYPE_ID);
  });
});

describe('cycleExtensionColor', () => {
  beforeEach(() => {
    useExtensionInstanceStore.setState({ records: {}, history: {} });
    toastMock.mockClear();
  });

  it('writes the next palette color into instance state and records undo', async () => {
    const record = makeLinkRecord();
    useExtensionInstanceStore.getState().hydrate({ [record.id]: record });

    expect(
      cycleExtensionColor({
        canvasTypeId: LINK_CANVAS_TYPE_ID,
        instanceId: record.id,
      })
    ).toBe(true);

    const updated = useExtensionInstanceStore.getState().records[record.id];
    expect(updated && 'state' in updated ? updated.state : null).toMatchObject({
      color: CARD_COLORS[1],
    });

    useExtensionInstanceStore.getState().undoInstance(record.id);
    const undone = useExtensionInstanceStore.getState().records[record.id];
    expect(undone && 'state' in undone ? undone.state : null).toMatchObject({
      color: '#FFFFFF',
    });
  });

  it('returns false when the type does not declare color', () => {
    expect(
      cycleExtensionColor({
        canvasTypeId: 'ghostboard.productivity/checklist',
        instanceId: 'extinst_none',
      })
    ).toBe(false);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('toasts when the instance record is missing', () => {
    expect(
      cycleExtensionColor({
        canvasTypeId: LINK_CANVAS_TYPE_ID,
        instanceId: 'extinst_missing1',
      })
    ).toBe(false);
    expect(toastMock).toHaveBeenCalledWith('Could not change color');
  });
});

describe('assembleExtensionMenuItems', () => {
  it('inserts type actions after focus for links', () => {
    expect(
      assembleExtensionMenuItems({
        canvasType: linkCanvasType as AnyBuiltinCanvasType,
        state: {
          color: '#FFFFFF',
          title: 'Example',
          url: 'https://example.com',
        },
      }).map((item) => item.id)
    ).toEqual([
      'focus',
      'open-link',
      'copy-url',
      'refetch-link',
      'edit-url',
      'copy',
      'change-color',
      'edit-tag',
      'toggle-lock',
      'delete',
    ]);
  });

  it('hides url actions when the link has no url', () => {
    expect(
      assembleExtensionMenuItems({
        canvasType: linkCanvasType as AnyBuiltinCanvasType,
        state: { color: '#FFFFFF', title: '', url: '' },
      }).map((item) => item.id)
    ).toEqual([
      'focus',
      'edit-url',
      'copy',
      'change-color',
      'edit-tag',
      'toggle-lock',
      'delete',
    ]);
  });
});

describe('runExtensionMenuAction', () => {
  beforeEach(() => {
    useExtensionInstanceStore.setState({ records: {}, history: {} });
  });

  it('returns false for host-generic ids', async () => {
    expect(
      await runExtensionMenuAction({
        actionId: 'copy',
        data: {
          canvasTypeId: LINK_CANVAS_TYPE_ID,
          instanceId: 'extinst_linkcolor1',
        },
        nodeId: 'n1',
      })
    ).toBe(false);
  });

  it('resets unfurl status for refetch-link', async () => {
    const record = makeLinkRecord();
    useExtensionInstanceStore.getState().hydrate({ [record.id]: record });
    expect(
      await runExtensionMenuAction({
        actionId: 'refetch-link',
        data: {
          canvasTypeId: LINK_CANVAS_TYPE_ID,
          instanceId: record.id,
        },
        nodeId: 'n1',
      })
    ).toBe(true);
    const updated = useExtensionInstanceStore.getState().records[record.id];
    expect(updated && 'state' in updated ? updated.state : null).toMatchObject({
      unfurlStatus: 'idle',
    });
  });
});
