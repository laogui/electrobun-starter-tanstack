import type { ComponentType } from 'react';
import { toast } from 'sonner';
import { CARD_COLORS } from '@/lib/colorUtils';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import * as m from '../../paraglide/messages.js';
import { isExtensionInstanceLoadError } from '../../shared/extensions/instance';
import { createExtensionHostApi } from './hostApi';
import { canvasTypeRegistry } from './registry';
import type {
  AnyBuiltinCanvasType,
  CanvasTypeMenuAction,
  HostGenericMenuInteractions,
  IconProps,
} from './types';

export type HostGenericMenuActionId =
  | 'focus'
  | 'copy'
  | 'change-color'
  | 'edit-tag'
  | 'toggle-lock'
  | 'detach-from-canvas'
  | 'delete';

export function listHostGenericMenuActions(input: {
  interactions?: HostGenericMenuInteractions;
  openBehavior?: 'none' | 'detail';
}): HostGenericMenuActionId[] {
  const actions: HostGenericMenuActionId[] = [];
  if (input.openBehavior === 'detail') {
    actions.push('focus');
  }
  actions.push('copy');
  if (input.interactions?.color) {
    actions.push('change-color');
  }
  if (input.interactions?.supportsTags) {
    actions.push('edit-tag');
  }
  actions.push('toggle-lock');
  if (input.interactions?.canDetach) {
    actions.push('detach-from-canvas');
  }
  actions.push('delete');
  return actions;
}

export function listHostGenericMenuActionsForType(
  canvasType: AnyBuiltinCanvasType | undefined
): HostGenericMenuActionId[] {
  if (!canvasType) {
    return listHostGenericMenuActions({});
  }
  return listHostGenericMenuActions({
    openBehavior: canvasType.surface.openBehavior,
    interactions: canvasType.interactions,
  });
}

function readCanvasTypeId(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') {
    return;
  }
  const canvasTypeId = (data as { canvasTypeId?: unknown }).canvasTypeId;
  return typeof canvasTypeId === 'string' ? canvasTypeId : undefined;
}

export function resolveExtensionCanvasTypeId(
  nodes: ReadonlyArray<{ data?: unknown; id: string }>,
  nodeId: string | undefined,
  folderId?: string
): string | undefined {
  if (!nodeId) {
    return;
  }
  if (folderId) {
    const folder = nodes.find((node) => node.id === folderId);
    const children =
      (
        folder?.data as
          | { children?: ReadonlyArray<{ data?: unknown; id: string }> }
          | undefined
      )?.children ?? [];
    const child = children.find((entry) => entry.id === nodeId);
    return readCanvasTypeId(child?.data);
  }
  return readCanvasTypeId(nodes.find((node) => node.id === nodeId)?.data);
}

function nextPaletteColor(current: string): string {
  const index = CARD_COLORS.indexOf(current as (typeof CARD_COLORS)[number]);
  return CARD_COLORS[(index + 1) % CARD_COLORS.length] ?? CARD_COLORS[0];
}

/** Cycle an extension instance's declared color field through the card palette. */
export function cycleExtensionColor(data: Record<string, unknown>): boolean {
  const canvasTypeId =
    typeof data.canvasTypeId === 'string' ? data.canvasTypeId : '';
  const instanceId = typeof data.instanceId === 'string' ? data.instanceId : '';
  if (!(canvasTypeId && instanceId)) {
    return false;
  }
  const canvasType = canvasTypeRegistry.get(canvasTypeId);
  const color = canvasType?.interactions?.color;
  if (!(canvasType && color)) {
    return false;
  }
  const record = useExtensionInstanceStore.getState().records[instanceId];
  if (
    !record ||
    isExtensionInstanceLoadError(record) ||
    !canvasType.validateState(record.state)
  ) {
    toast(m.toast_color_change_failed());
    return false;
  }
  const nextColor = nextPaletteColor(color.get(record.state));
  useExtensionInstanceStore
    .getState()
    .updateState(instanceId, {
      history: 'record',
      state: color.set(record.state, nextColor),
    })
    .catch(() => {
      toast(m.toast_color_change_failed());
    });
  return true;
}

const HOST_GENERIC_MENU_ACTION_IDS = new Set<string>([
  'focus',
  'copy',
  'change-color',
  'edit-tag',
  'toggle-lock',
  'detach-from-canvas',
  'delete',
]);

export function isHostGenericMenuAction(actionId: string): boolean {
  return HOST_GENERIC_MENU_ACTION_IDS.has(actionId);
}

function readExtensionRef(
  data: unknown
): { canvasTypeId: string; instanceId: string } | undefined {
  if (!data || typeof data !== 'object') {
    return;
  }
  const canvasTypeId = (data as { canvasTypeId?: unknown }).canvasTypeId;
  const instanceId = (data as { instanceId?: unknown }).instanceId;
  if (typeof canvasTypeId !== 'string' || typeof instanceId !== 'string') {
    return;
  }
  if (!(canvasTypeId && instanceId)) {
    return;
  }
  return { canvasTypeId, instanceId };
}

export function resolveExtensionNodeRef(
  nodes: ReadonlyArray<{ data?: unknown; id: string }>,
  nodeId: string | undefined,
  folderId?: string
): { canvasTypeId: string; instanceId: string } | undefined {
  if (!nodeId) {
    return;
  }
  if (folderId) {
    const folder = nodes.find((node) => node.id === folderId);
    const children =
      (
        folder?.data as
          | { children?: ReadonlyArray<{ data?: unknown; id: string }> }
          | undefined
      )?.children ?? [];
    const child = children.find((entry) => entry.id === nodeId);
    return readExtensionRef(child?.data);
  }
  return readExtensionRef(nodes.find((node) => node.id === nodeId)?.data);
}

export type AssembledExtensionMenuItem =
  | { id: HostGenericMenuActionId; source: 'host' }
  | {
      danger?: boolean;
      icon: ComponentType<IconProps>;
      id: string;
      labelKey: string;
      source: 'type';
    };

function listVisibleTypeMenuActions(
  canvasType: AnyBuiltinCanvasType | undefined,
  state: unknown
): readonly CanvasTypeMenuAction<unknown>[] {
  const actions = canvasType?.menuActions ?? [];
  if (!canvasType || actions.length === 0) {
    return [];
  }
  const hasValidState = canvasType.validateState(state);
  return actions.filter((action) => {
    if (!action.visible) {
      return true;
    }
    return hasValidState ? action.visible(state) : false;
  });
}

/** Host items with type-specific actions inserted after Focus, matching the T0 matrix. */
export function assembleExtensionMenuItems(input: {
  canvasType: AnyBuiltinCanvasType | undefined;
  state: unknown;
}): AssembledExtensionMenuItem[] {
  const hostIds = listHostGenericMenuActionsForType(input.canvasType);
  const typeItems = listVisibleTypeMenuActions(
    input.canvasType,
    input.state
  ).map(
    (action): AssembledExtensionMenuItem => ({
      source: 'type',
      id: action.id,
      labelKey: action.labelKey,
      icon: action.icon,
      ...(action.danger ? { danger: true } : {}),
    })
  );
  const focusIndex = hostIds.indexOf('focus');
  if (focusIndex === -1) {
    return [
      ...typeItems,
      ...hostIds.map(
        (id): AssembledExtensionMenuItem => ({ source: 'host', id })
      ),
    ];
  }
  const before = hostIds.slice(0, focusIndex + 1);
  const after = hostIds.slice(focusIndex + 1);
  return [
    ...before.map((id): AssembledExtensionMenuItem => ({ source: 'host', id })),
    ...typeItems,
    ...after.map((id): AssembledExtensionMenuItem => ({ source: 'host', id })),
  ];
}

export async function runExtensionMenuAction(input: {
  actionId: string;
  data: Record<string, unknown>;
  folderId?: string;
  nodeId: string;
}): Promise<boolean> {
  if (HOST_GENERIC_MENU_ACTION_IDS.has(input.actionId)) {
    return false;
  }
  const ref = readExtensionRef(input.data);
  if (!ref) {
    return false;
  }
  const canvasType = canvasTypeRegistry.get(ref.canvasTypeId);
  const action = canvasType?.menuActions?.find(
    (entry) => entry.id === input.actionId
  );
  if (!(canvasType && action)) {
    return false;
  }
  const record = useExtensionInstanceStore.getState().records[ref.instanceId];
  if (
    !record ||
    isExtensionInstanceLoadError(record) ||
    !canvasType.validateState(record.state)
  ) {
    return true;
  }
  const host = createExtensionHostApi({
    canvasTypeId: ref.canvasTypeId,
    instanceId: ref.instanceId,
    nodeId: input.nodeId,
    ...(input.folderId ? { folderId: input.folderId } : {}),
  });
  await action.run({
    host,
    nodeId: input.nodeId,
    state: record.state,
  });
  return true;
}
