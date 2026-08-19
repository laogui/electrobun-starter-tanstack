import { isCanvasTypeEnabled } from '../../shared/extensions/enablement';
import { isCanvasTypeId } from '../../shared/extensions/ids';
import type { ExtensionAvailability } from '../../shared/extensions/protocol';

import type { AnyBuiltinCanvasType, BuiltinCanvasType } from './types';

function assertComplete(type: AnyBuiltinCanvasType): void {
  if (!isCanvasTypeId(type.id)) {
    throw new Error(`Invalid canvas type id: ${type.id}`);
  }
  if (!type.titleKey) {
    throw new Error(`${type.id} is missing titleKey`);
  }
  if (!(type.CanvasSurface && type.PreviewSurface)) {
    throw new Error(`${type.id} is missing a required surface`);
  }
  if (
    !(type.surface.defaultSize.width > 0 && type.surface.defaultSize.height > 0)
  ) {
    throw new Error(`${type.id} has an invalid defaultSize`);
  }
  if (typeof type.createInitialState !== 'function') {
    throw new Error(`${type.id} is missing createInitialState`);
  }
  if (typeof type.buildPresentation !== 'function') {
    throw new Error(`${type.id} is missing buildPresentation`);
  }
}

export class CanvasTypeRegistry {
  private readonly types = new Map<string, AnyBuiltinCanvasType>();

  register<TState>(type: BuiltinCanvasType<TState>): void {
    assertComplete(type as AnyBuiltinCanvasType);
    if (this.types.has(type.id)) {
      throw new Error(`Duplicate canvas type id: ${type.id}`);
    }
    this.types.set(type.id, type as AnyBuiltinCanvasType);
  }

  get(id: string): AnyBuiltinCanvasType | undefined {
    return this.types.get(id);
  }

  list(): AnyBuiltinCanvasType[] {
    return [...this.types.values()];
  }

  listEnabled(disabledCanvasTypes: readonly string[]): AnyBuiltinCanvasType[] {
    return this.list().filter((type) =>
      isCanvasTypeEnabled(type.id, disabledCanvasTypes)
    );
  }

  availability(
    canvasTypeId: string,
    disabledCanvasTypes: readonly string[]
  ): ExtensionAvailability {
    if (!this.types.has(canvasTypeId)) {
      return 'unknown';
    }
    return isCanvasTypeEnabled(canvasTypeId, disabledCanvasTypes)
      ? 'available'
      : 'disabled';
  }
}

export function createCanvasTypeRegistry(): CanvasTypeRegistry {
  return new CanvasTypeRegistry();
}

export const canvasTypeRegistry = createCanvasTypeRegistry();
