import { isCanvasTypeId } from './ids';

export const EXTENSION_ENABLEMENT_SCHEMA =
  'ghostboard-extension-enablement/v1' as const;

export interface ExtensionEnablementFile {
  disabledCanvasTypes: string[];
  schema: typeof EXTENSION_ENABLEMENT_SCHEMA;
}

export const DEFAULT_EXTENSION_ENABLEMENT: ExtensionEnablementFile = {
  schema: EXTENSION_ENABLEMENT_SCHEMA,
  disabledCanvasTypes: [],
};

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parseExtensionEnablement(
  input: unknown
): ExtensionEnablementFile {
  if (!isStringRecord(input)) {
    return { ...DEFAULT_EXTENSION_ENABLEMENT };
  }

  const raw = Array.isArray(input.disabledCanvasTypes)
    ? input.disabledCanvasTypes
    : [];
  const disabledCanvasTypes = [
    ...new Set(
      raw.filter(
        (id): id is string => typeof id === 'string' && isCanvasTypeId(id)
      )
    ),
  ];

  return {
    schema: EXTENSION_ENABLEMENT_SCHEMA,
    disabledCanvasTypes,
  };
}

export function isCanvasTypeEnabled(
  canvasTypeId: string,
  disabledCanvasTypes: readonly string[]
): boolean {
  return !disabledCanvasTypes.includes(canvasTypeId);
}
