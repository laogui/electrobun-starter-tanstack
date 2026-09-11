import { Puzzle } from 'lucide-react';

import type {
  CanvasTypeDefinition,
  CanvasTypePresentation,
  JsonValue,
} from '../../../../packages/plugin-sdk';
import { isCanvasTypeId } from '../../../shared/extensions/ids';
import type { ExtensionInstanceRecord } from '../../../shared/extensions/instance';
import { sanitizePresentation } from '../../../shared/extensions/presentation';
import { isLocalContributionId, isPluginId } from '../../../shared/plugins/ids';
import type { AnyBuiltinCanvasType } from '../../extensions/types';

const DEFAULT_SIZE = { height: 200, width: 280 } as const;
const DEFAULT_MIN_SIZE = { height: 120, width: 160 } as const;
const MIN_DIMENSION = 80;
const MAX_DIMENSION = 4096;

function isJsonValue(
  value: unknown,
  seen = new Set<object>()
): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (!value || typeof value !== 'object' || seen.has(value)) {
    return false;
  }
  seen.add(value);
  let valid: boolean;
  if (Array.isArray(value)) {
    valid = value.every((entry) => isJsonValue(entry, seen));
  } else if (Object.getPrototypeOf(value) !== Object.prototype) {
    valid = false;
  } else {
    valid = Object.entries(value).every(
      ([key, entry]) => key !== '__proto__' && isJsonValue(entry, seen)
    );
  }
  seen.delete(value);
  return valid;
}

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertSize(
  value: { height: number; width: number } | undefined,
  name: string
): void {
  if (!value) {
    return;
  }
  if (
    !(Number.isFinite(value.width) && Number.isFinite(value.height)) ||
    value.width < MIN_DIMENSION ||
    value.height < MIN_DIMENSION ||
    value.width > MAX_DIMENSION ||
    value.height > MAX_DIMENSION
  ) {
    throw new Error(
      `Canvas type ${name} must be between ${MIN_DIMENSION} and ${MAX_DIMENSION}px`
    );
  }
}

export function pluginCanvasTypeId(pluginId: string, localId: string): string {
  if (!(isPluginId(pluginId) && isLocalContributionId(localId))) {
    throw new Error('Canvas type requires a valid plugin-local kebab-case id');
  }
  const id = `${pluginId}/${localId}`;
  if (!isCanvasTypeId(id)) {
    throw new Error(`Invalid canvas type id: ${id}`);
  }
  return id;
}

export function adaptPluginCanvasType<TState>(
  pluginId: string,
  definition: CanvasTypeDefinition<TState>
): AnyBuiltinCanvasType {
  if (
    !definition ||
    typeof definition !== 'object' ||
    typeof definition.title !== 'string' ||
    !definition.title.trim() ||
    typeof definition.component !== 'function' ||
    typeof definition.createInitialState !== 'function' ||
    typeof definition.validateState !== 'function' ||
    typeof definition.summarize !== 'function' ||
    !Number.isSafeInteger(definition.dataVersion) ||
    definition.dataVersion < 1
  ) {
    throw new Error(
      'Canvas type requires title, component, dataVersion, createInitialState, validateState and summarize'
    );
  }
  if (
    definition.migrateState !== undefined &&
    typeof definition.migrateState !== 'function'
  ) {
    throw new Error('Canvas type migrateState must be a function');
  }
  const id = pluginCanvasTypeId(pluginId, definition.id);
  assertSize(definition.surface?.defaultSize, 'defaultSize');
  assertSize(definition.surface?.minSize, 'minSize');
  assertSize(definition.surface?.maxSize, 'maxSize');
  const createInitialState = (): TState => {
    const state = definition.createInitialState();
    if (!(isJsonValue(state) && definition.validateState(state))) {
      throw new Error(`${id} createInitialState returned invalid JSON state`);
    }
    return cloneJson(state) as TState;
  };

  const buildPresentation = (state: unknown) => {
    if (!(isJsonValue(state) && definition.validateState(state))) {
      throw new Error(`${id} received invalid state`);
    }
    const summary = definition.summarize(cloneJson(state));
    if (!summary || typeof summary !== 'object') {
      throw new Error(`${id} summarize must return a presentation object`);
    }
    return sanitizePresentation({
      ...(summary as CanvasTypePresentation),
      title:
        typeof summary.title === 'string' && summary.title.trim()
          ? summary.title
          : definition.title,
    });
  };
  buildPresentation(createInitialState());

  const PublicCanvasSurface = definition.component;
  const PublicPreviewSurface = definition.previewComponent;
  const CanvasSurface: AnyBuiltinCanvasType['CanvasSurface'] = ({
    context,
    host,
    presentation,
    state,
  }) => (
    <PublicCanvasSurface
      context={{ ...context, surface: context.surface as 'canvas' | 'detail' }}
      presentation={presentation}
      state={state as TState}
      updateState={async (nextState, options) => {
        if (!(isJsonValue(nextState) && definition.validateState(nextState))) {
          throw new Error(`${id} updateState received invalid JSON state`);
        }
        const snapshot = await host.instance.updateState({
          history: options?.history ?? 'record',
          state: cloneJson(nextState),
        });
        if (
          !(
            isJsonValue(snapshot.state) &&
            definition.validateState(snapshot.state)
          )
        ) {
          throw new Error(`${id} host returned invalid state`);
        }
        return {
          revision: snapshot.revision,
          state: cloneJson(snapshot.state),
          presentation: snapshot.presentation,
        };
      }}
    />
  );
  return {
    id,
    titleKey: definition.title.trim(),
    ...(definition.description?.trim()
      ? { descriptionKey: definition.description.trim() }
      : {}),
    icon: Puzzle,
    category: 'plugin',
    dataVersion: definition.dataVersion,
    surface: {
      defaultSize: definition.surface?.defaultSize ?? DEFAULT_SIZE,
      minSize: definition.surface?.minSize ?? DEFAULT_MIN_SIZE,
      ...(definition.surface?.maxSize
        ? { maxSize: definition.surface.maxSize }
        : {}),
      resizable: definition.surface?.resizable ?? true,
      openBehavior: definition.surface?.openBehavior ?? 'none',
      canEnterGroup: true,
      canEnterFolder: true,
    },
    createInitialState,
    validateState: (value: unknown): value is TState =>
      isJsonValue(value) && definition.validateState(value),
    migrateState: (record: ExtensionInstanceRecord) => {
      if (!isJsonValue(record.state)) {
        throw new Error(`${id} cannot migrate non-JSON state`);
      }
      if (record.dataVersion === definition.dataVersion) {
        if (!definition.validateState(record.state)) {
          throw new Error(`${id} state failed validation`);
        }
        return cloneJson(record.state);
      }
      if (record.dataVersion > definition.dataVersion) {
        throw new Error(`${id} data is from a newer plugin version`);
      }
      if (!definition.migrateState) {
        throw new Error(
          `${id} requires migrateState from data version ${record.dataVersion}`
        );
      }
      const migrated = definition.migrateState(
        cloneJson(record.state),
        record.dataVersion
      );
      if (!(isJsonValue(migrated) && definition.validateState(migrated))) {
        throw new Error(`${id} migrateState returned invalid JSON state`);
      }
      return cloneJson(migrated);
    },
    buildPresentation,
    CanvasSurface,
    ...(definition.surface?.openBehavior === 'detail'
      ? { DetailSurface: CanvasSurface }
      : {}),
    PreviewSurface: ({ context, presentation, state }) =>
      PublicPreviewSurface ? (
        <PublicPreviewSurface
          context={context}
          presentation={presentation}
          state={state as TState}
        />
      ) : (
        <div className="flex size-full flex-col justify-center gap-1 p-4">
          <div className="font-medium text-sm">{presentation.title}</div>
          {presentation.subtitle ? (
            <div className="text-neutral-500 text-xs">
              {presentation.subtitle}
            </div>
          ) : null}
        </div>
      ),
  };
}
