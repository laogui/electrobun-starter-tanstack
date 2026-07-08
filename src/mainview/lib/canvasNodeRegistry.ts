import type { Node } from '@xyflow/react';
import * as m from '../../paraglide/messages.js';
import type { Size } from './collision';
import { GROUP_COLORS, STICKY_COLORS } from './colorUtils';
import type { CanvasNodeKind } from './contentTypes';

/**
 * Default node dimensions. The registry owns these directly so it can
 * initialize `CANVAS_NODE_SPECS` without depending on rendered node component
 * registration. `canvasConstants` re-exports these for backwards compatibility.
 */
export const CARD_W = 350;
export const CARD_H = 450;
export const IMAGE_W = 350;
export const IMAGE_H = 350;
export const FOLDER_W = 280;
export const FOLDER_H = 280;
export const STICKY_W = 200;
export const STICKY_H = 200;

/**
 * Single source of truth for each canvas node kind: its React Flow node type,
 * default size, default data, and group/folder eligibility. Other modules
 * (store, predicates, drag, placement) should consume this registry instead
 * of redeclaring their own size constants or type unions.
 *
 * Note: `CanvasNodeKind` is the *creation* kind. It does not always match
 * React Flow `node.type`. For example, widget creation kinds produce nodes
 * with `type: 'widget'` and `data.kind` identifying the specific widget.
 */
export interface CanvasNodeSpec {
  canEnterFolder: boolean;
  canEnterGroup: boolean;
  defaultData: () => Record<string, unknown>;
  kind: CanvasNodeKind;
  /** Underlying React Flow node type written to `node.type`. */
  nodeType: string;
  size: Size;
}

const DEFAULT_GROUP_W = 500;
const DEFAULT_GROUP_H = 300;
const DEFAULT_ASSET_W = 350;
const DEFAULT_ASSET_H = 260;
const DEFAULT_LINK_W = 380;
const DEFAULT_LINK_H = 360;
const DEFAULT_RECORDING_W = 380;
const DEFAULT_RECORDING_H = 150;
const DEFAULT_WIDGET_W = 320;
const DEFAULT_WIDGET_H = 340;

function pickRandom<T>(values: readonly T[]): T {
  // Falls back to first entry when array is empty (which the canvas color
  // palettes never are).
  return values[Math.floor(Math.random() * values.length)] as T;
}

export const CANVAS_NODE_SPECS: Record<CanvasNodeKind, CanvasNodeSpec> = {
  card: {
    kind: 'card',
    nodeType: 'card',
    size: { width: CARD_W, height: CARD_H },
    defaultData: () => ({
      type: 'text',
      title: '',
      content: '',
      color: '#FFFFFF',
    }),
    canEnterGroup: true,
    canEnterFolder: true,
  },
  checklist: {
    kind: 'checklist',
    nodeType: 'widget',
    size: { width: DEFAULT_WIDGET_W, height: DEFAULT_WIDGET_H },
    defaultData: () => ({
      widgetId: '',
      kind: 'checklist',
    }),
    canEnterGroup: true,
    canEnterFolder: true,
  },
  pomodoro: {
    kind: 'pomodoro',
    nodeType: 'widget',
    size: { width: DEFAULT_WIDGET_W, height: DEFAULT_WIDGET_H },
    defaultData: () => ({
      widgetId: '',
      kind: 'pomodoro',
    }),
    canEnterGroup: true,
    canEnterFolder: true,
  },
  reminder: {
    kind: 'reminder',
    nodeType: 'widget',
    size: { width: DEFAULT_WIDGET_W, height: DEFAULT_WIDGET_H },
    defaultData: () => ({
      widgetId: '',
      kind: 'reminder',
    }),
    canEnterGroup: true,
    canEnterFolder: true,
  },
  sticky: {
    kind: 'sticky',
    nodeType: 'sticky',
    size: { width: STICKY_W, height: STICKY_H },
    defaultData: () => ({
      content: '',
      color: pickRandom(STICKY_COLORS),
    }),
    canEnterGroup: true,
    canEnterFolder: false,
  },
  folder: {
    kind: 'folder',
    nodeType: 'folder',
    size: { width: FOLDER_W, height: FOLDER_H },
    defaultData: () => ({
      title: m.default_folder_title(),
      subtitle: '',
      children: [],
    }),
    canEnterGroup: true,
    canEnterFolder: false,
  },
  group: {
    kind: 'group',
    nodeType: 'group',
    size: { width: DEFAULT_GROUP_W, height: DEFAULT_GROUP_H },
    defaultData: () => ({
      label: m.default_new_group_label(),
      color: pickRandom(GROUP_COLORS),
    }),
    canEnterGroup: false,
    canEnterFolder: false,
  },
  image: {
    kind: 'image',
    nodeType: 'image',
    size: { width: IMAGE_W, height: IMAGE_H },
    defaultData: () => ({
      imageUrl: '',
      title: '',
      color: '#FFFFFF',
    }),
    canEnterGroup: true,
    canEnterFolder: true,
  },
  asset: {
    kind: 'asset',
    nodeType: 'asset',
    size: { width: DEFAULT_ASSET_W, height: DEFAULT_ASSET_H },
    defaultData: () => ({
      kind: 'file',
      title: '',
      fileName: '',
      mimeType: 'application/octet-stream',
      color: '#FFFFFF',
    }),
    canEnterGroup: true,
    canEnterFolder: true,
  },
  link: {
    kind: 'link',
    nodeType: 'link',
    size: { width: DEFAULT_LINK_W, height: DEFAULT_LINK_H },
    defaultData: () => ({
      url: '',
      title: '',
      color: '#FFFFFF',
    }),
    canEnterGroup: true,
    canEnterFolder: true,
  },
  recording: {
    kind: 'recording',
    nodeType: 'recording',
    size: { width: DEFAULT_RECORDING_W, height: DEFAULT_RECORDING_H },
    defaultData: () => ({
      color: '#FFFFFF',
      fileName: '',
      mimeType: 'audio/mp4',
      recordingNumber: 1,
      title: '',
    }),
    canEnterGroup: true,
    canEnterFolder: true,
  },
};

/** Look up the spec for a `CanvasNodeKind`. */
export function getNodeSpec(kind: CanvasNodeKind): CanvasNodeSpec {
  return CANVAS_NODE_SPECS[kind];
}

/** Look up a spec by React Flow `node.type`, returns the first matching entry.
 *  Used by helpers like `collision.getNodeSize` that only see `node.type`. */
export function findSpecByNodeType(nodeType: string): CanvasNodeSpec | null {
  // Multiple widget creation kinds share `nodeType: 'widget'`; callers that
  // only have the runtime node type need the shared size/eligibility only.
  for (const spec of Object.values(CANVAS_NODE_SPECS)) {
    if (spec.nodeType === nodeType) {
      return spec;
    }
  }
  return null;
}

/** Shape consumed by `canvasStore.createNode()` and related helpers. */
export interface NewNodeSpec {
  base: Omit<Node, 'id' | 'position'>;
  size: Size;
}

/**
 * Build the partial node payload for a new node of the given kind. The store
 * adds `id` and `position` afterwards. `style` is set to the spec's default
 * size so React Flow gets explicit dimensions on the first render.
 */
export function buildNewNodeSpec(kind: CanvasNodeKind): NewNodeSpec {
  const spec = getNodeSpec(kind);
  const { width, height } = spec.size;
  return {
    size: spec.size,
    base: {
      type: spec.nodeType,
      style: { width, height },
      data: spec.defaultData(),
    },
  };
}
