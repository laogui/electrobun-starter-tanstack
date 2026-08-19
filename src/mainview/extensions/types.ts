import type { ComponentType } from 'react';
import type { ExtensionInstanceRecord } from '../../shared/extensions/instance';
import type { ExtensionPresentation } from '../../shared/extensions/presentation';
import type {
  GhostBoardHostAPI,
  HostCapability,
  Size,
  SurfaceRenderContext,
} from '../../shared/extensions/protocol';

export type CanvasTypeCategory = 'media' | 'productivity' | 'web' | 'demo';

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
  migrateState(record: ExtensionInstanceRecord): TState;
  PreviewSurface: ComponentType<PreviewProps<TState>>;
  surface: {
    canEnterFolder: boolean;
    canEnterGroup: boolean;
    defaultSize: Size;
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
