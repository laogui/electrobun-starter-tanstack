import type { ComponentType } from 'react';
import type { ExtensionInstanceRecord } from '../../shared/extensions/instance';
import type { ExtensionPresentation } from '../../shared/extensions/presentation';
import type {
  GhostBoardHostAPI,
  HostCapability,
  Size,
  SurfaceRenderContext,
} from '../../shared/extensions/protocol';

export type CanvasTypeCategory =
  | 'media'
  | 'productivity'
  | 'web'
  | 'demo'
  | 'plugin';

export type CanvasTypeCreateFlow =
  | 'immediate'
  | 'url'
  | 'file'
  | 'image'
  | 'recording';

export interface IconProps {
  className?: string;
  size?: number;
}

export interface SurfaceProps<TState> {
  context: SurfaceRenderContext;
  host: GhostBoardHostAPI;
  presentation: ExtensionPresentation;
  state: TState;
}

export interface PreviewProps<TState> {
  context: Pick<SurfaceRenderContext, 'height' | 'locale' | 'theme' | 'width'>;
  presentation: ExtensionPresentation;
  state: TState;
}

/**
 * Host-owned interactions a canvas type can opt into. Missing fields mean the
 * host hides the corresponding generic menu items. Not required by registry
 * `assertComplete`.
 */
export interface CanvasTypeInteractions<TState> {
  /** When true, host shows "Move to library" and `detachNoteFromCanvas` honors the node. */
  canDetach?: boolean;
  /** Host shows "Change color" and writes through `updateState`. */
  color?: {
    get(state: TState): string;
    set(state: TState, color: string): TState;
  };
  /** Host shows "Edit tag" and renders tag chips from the node-metadata sidecar. */
  supportsTags?: boolean;
}

/**
 * What the host context menu reads from `interactions`. `color` is presence-only
 * because `get`/`set` are contravariant in `TState`.
 */
export type HostGenericMenuInteractions = Pick<
  CanvasTypeInteractions<unknown>,
  'canDetach' | 'supportsTags'
> & {
  color?: unknown;
};

export interface CanvasTypeMenuActionContext<TState> {
  host: GhostBoardHostAPI;
  nodeId: string;
  state: TState;
}

/**
 * Type-contributed context-menu items. Labels are i18n keys; handlers only
 * receive `(state, host, nodeId)` so they stay sandbox-shaped for RFC-2.
 */
export interface CanvasTypeMenuAction<TState> {
  danger?: boolean;
  icon: ComponentType<IconProps>;
  id: string;
  labelKey: string;
  run(ctx: CanvasTypeMenuActionContext<TState>): void | Promise<void>;
  visible?(state: TState): boolean;
}

/** Color get/set for instance state objects that store a `color` string. */
export function colorFieldInteractions<
  TState extends { color: string },
>(): NonNullable<CanvasTypeInteractions<TState>['color']> {
  return {
    get: (state) => state.color,
    set: (state, color) => ({ ...state, color }),
  };
}

export interface BuiltinCanvasType<TState> {
  buildPresentation(state: TState): ExtensionPresentation;
  CanvasSurface: ComponentType<SurfaceProps<TState>>;
  capabilities?: HostCapability[];
  category: CanvasTypeCategory;
  createFlow?: CanvasTypeCreateFlow;
  createInitialState(): TState;
  DetailSurface?: ComponentType<SurfaceProps<TState>>;
  dataVersion: number;
  descriptionKey?: string;
  icon: ComponentType<IconProps>;
  id: string;
  interactions?: CanvasTypeInteractions<TState>;
  menuActions?: readonly CanvasTypeMenuAction<TState>[];
  migrateState(record: ExtensionInstanceRecord): TState;
  PreviewSurface: ComponentType<PreviewProps<TState>>;
  surface: {
    canEnterFolder: boolean;
    canEnterGroup: boolean;
    defaultSize: Size;
    /**
     * How FocusedView chromes this type's detail surface. Missing means the
     * default contained panel. Host-owned; new types pick a layout here
     * instead of adding branches in FocusedView.
     */
    detailLayout?: 'lightbox' | 'wide';
    maxSize?: Size;
    minSize?: Size;
    openBehavior: 'none' | 'detail';
    preserveAspectRatio?: boolean;
    resizable: boolean;
  };
  titleKey: string;
  validateState(value: unknown): value is TState;
}

export type AnyBuiltinCanvasType = BuiltinCanvasType<unknown>;
