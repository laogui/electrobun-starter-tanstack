import { resolve } from 'node:path';

import {
  DEFAULT_EXTENSION_ENABLEMENT,
  type ExtensionEnablementFile,
  parseExtensionEnablement,
} from '../../shared/extensions/enablement';
import { isCanvasTypeId } from '../../shared/extensions/ids';
import { atomicWrite } from '../atomicWrite';

export function extensionEnablementPath(wsPath: string): string {
  return resolve(wsPath, '.ghostboard', 'extensions.json');
}

export async function loadExtensionEnablement(
  wsPath: string
): Promise<ExtensionEnablementFile> {
  const file = Bun.file(extensionEnablementPath(wsPath));
  if (!(await file.exists())) {
    return { ...DEFAULT_EXTENSION_ENABLEMENT };
  }
  try {
    return parseExtensionEnablement(await file.json());
  } catch {
    return { ...DEFAULT_EXTENSION_ENABLEMENT };
  }
}

export async function saveExtensionEnablement(
  wsPath: string,
  enablement: ExtensionEnablementFile
): Promise<void> {
  const normalized = parseExtensionEnablement(enablement);
  await atomicWrite(
    extensionEnablementPath(wsPath),
    JSON.stringify(normalized, null, 2)
  );
}

export async function setCanvasTypeEnabled(
  wsPath: string,
  canvasTypeId: string,
  enabled: boolean
): Promise<ExtensionEnablementFile> {
  if (!isCanvasTypeId(canvasTypeId)) {
    throw new Error('Invalid canvasTypeId.');
  }
  const current = await loadExtensionEnablement(wsPath);
  const disabled = new Set(current.disabledCanvasTypes);
  if (enabled) {
    disabled.delete(canvasTypeId);
  } else {
    disabled.add(canvasTypeId);
  }
  const next: ExtensionEnablementFile = {
    schema: current.schema,
    disabledCanvasTypes: [...disabled],
  };
  await saveExtensionEnablement(wsPath, next);
  return next;
}
