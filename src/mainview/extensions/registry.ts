import { useSyncExternalStore } from 'react';

import { isCanvasTypeId } from '../../shared/extensions/ids';
import type { ExtensionAvailability } from '../../shared/extensions/protocol';

import type { AnyBuiltinCanvasType, BuiltinCanvasType } from './types';

/**
 * The registry stores heterogeneous canvas types, so their state parameter is
 * erased at this single boundary. Each surface only ever receives state that
 * the same type's `validateState` / `migrateState` produced.
 */
function eraseCanvasType<TState>(
  type: BuiltinCanvasType<TState>
): AnyBuiltinCanvasType {
  return type as AnyBuiltinCanvasType;
}

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
  private readonly listeners = new Set<() => void>();
  private readonly types = new Map<
    string,
    { generation?: number; owner?: string; type: AnyBuiltinCanvasType }
  >();
  private revision = 0;

  private publish(): void {
    this.revision += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }

  getRevision = (): number => this.revision;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  register<TState>(type: BuiltinCanvasType<TState>): void {
    assertComplete(eraseCanvasType(type));
    if (this.types.has(type.id)) {
      throw new Error(`Duplicate canvas type id: ${type.id}`);
    }
    this.types.set(type.id, { type: eraseCanvasType(type) });
    this.publish();
  }

  replaceOwner<TState>(
    owner: string,
    generation: number,
    types: readonly BuiltinCanvasType<TState>[]
  ): void {
    if (!(owner && Number.isSafeInteger(generation) && generation > 0)) {
      throw new Error('Canvas type owner and generation are required');
    }
    const normalizedTypes = types.map(eraseCanvasType);
    const nextIds = new Set<string>();
    for (const type of normalizedTypes) {
      assertComplete(type);
      if (nextIds.has(type.id)) {
        throw new Error(`Duplicate canvas type id: ${type.id}`);
      }
      nextIds.add(type.id);
      const current = this.types.get(type.id);
      if (current && current.owner !== owner) {
        throw new Error(`Duplicate canvas type id: ${type.id}`);
      }
    }
    for (const [id, entry] of this.types) {
      if (entry.owner === owner) {
        this.types.delete(id);
      }
    }
    for (const type of normalizedTypes) {
      this.types.set(type.id, { generation, owner, type });
    }
    this.publish();
  }

  clearOwner(owner: string, generation: number): void {
    let changed = false;
    for (const [id, entry] of this.types) {
      if (entry.owner === owner && entry.generation === generation) {
        this.types.delete(id);
        changed = true;
      }
    }
    if (changed) {
      this.publish();
    }
  }

  get(id: string): AnyBuiltinCanvasType | undefined {
    return this.types.get(id)?.type;
  }

  list(): AnyBuiltinCanvasType[] {
    return [...this.types.values()].map((entry) => entry.type);
  }

  availability(canvasTypeId: string): ExtensionAvailability {
    return this.types.has(canvasTypeId) ? 'available' : 'unknown';
  }
}

export function createCanvasTypeRegistry(): CanvasTypeRegistry {
  return new CanvasTypeRegistry();
}

export const canvasTypeRegistry = createCanvasTypeRegistry();

export function useCanvasTypeRegistryRevision(): number {
  return useSyncExternalStore(
    canvasTypeRegistry.subscribe,
    canvasTypeRegistry.getRevision,
    canvasTypeRegistry.getRevision
  );
}
