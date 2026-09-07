import {
  HOST_API_VERSION,
  isLocalContributionId,
  isPluginId,
  isSemver,
  isThirdPartyPluginId,
} from './ids';

export const PLUGIN_MANIFEST_VERSION = 1;

export type PluginContributionKind =
  | 'command'
  | 'panel'
  | 'importer'
  | 'canvasType';

export interface PluginPermissionDeclaration {
  id: string;
  reason: string;
}

export interface PluginCommandContribution {
  handler: string;
  id: string;
  name: string;
  when?: string;
}

export interface PluginPanelContribution {
  entry: string;
  id: string;
  name: string;
  singleton?: boolean;
}

export interface PluginImporterContribution {
  handler: string;
  id: string;
  mimeTypes?: string[];
  name: string;
}

export interface PluginCanvasTypeContribution {
  dataVersion: number;
  entry?: string;
  id: string;
  name: string;
}

export interface PluginManifest {
  author?: string;
  contributes: {
    canvasTypes: PluginCanvasTypeContribution[];
    commands: PluginCommandContribution[];
    importers: PluginImporterContribution[];
    panels: PluginPanelContribution[];
  };
  description?: string;
  engines: { hostApi: string };
  id: string;
  manifestVersion: typeof PLUGIN_MANIFEST_VERSION;
  name: string;
  permissions: {
    optional: PluginPermissionDeclaration[];
    required: PluginPermissionDeclaration[];
  };
  version: string;
}

export type PluginManifestErrorCode =
  | 'invalid-json'
  | 'invalid-manifest'
  | 'incompatible-host-api'
  | 'reserved-plugin-id'
  | 'missing-contribution';

export interface PluginManifestError {
  code: PluginManifestErrorCode;
  message: string;
}

const HANDLER_RE = /^[A-Za-z0-9._/-]+#[A-Za-z_][A-Za-z0-9_]*$/;
const ENTRY_RE = /^[A-Za-z0-9._/-]+\.(html|js|mjs)$/;
const HOST_API_RANGE_RE = /^>=1\.\d+\.\d+ <2\.\d+\.\d+$/;
const PERMISSION_ID_RE = /^[a-z][a-z0-9.-]*$/;
const KNOWN_CONTRIBUTE_KEYS = new Set([
  'commands',
  'views',
  'panels',
  'importers',
  'canvasTypes',
  'menus',
  'events',
  'settings',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parsePermissionList(
  value: unknown
): PluginPermissionDeclaration[] | PluginManifestError {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return { code: 'invalid-manifest', message: 'permissions must be arrays' };
  }
  const parsed: PluginPermissionDeclaration[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return {
        code: 'invalid-manifest',
        message: 'permission entries must be objects',
      };
    }
    const id = asString(entry.id);
    const reason = asString(entry.reason);
    if (!(id && PERMISSION_ID_RE.test(id) && reason)) {
      return {
        code: 'invalid-manifest',
        message: 'permission id and reason are required',
      };
    }
    parsed.push({ id, reason });
  }
  return parsed;
}

function parseCommands(
  value: unknown
): PluginCommandContribution[] | PluginManifestError {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return { code: 'invalid-manifest', message: 'commands must be an array' };
  }
  const commands: PluginCommandContribution[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) {
      return { code: 'invalid-manifest', message: 'command must be an object' };
    }
    const id = asString(entry.id);
    const name = asString(entry.name);
    const handler = asString(entry.handler);
    const when = asString(entry.when);
    if (!(id && isLocalContributionId(id) && name && handler)) {
      return {
        code: 'invalid-manifest',
        message: 'command id, name, and handler are required',
      };
    }
    if (!HANDLER_RE.test(handler)) {
      return {
        code: 'invalid-manifest',
        message: `invalid command handler: ${handler}`,
      };
    }
    if (seen.has(id)) {
      return {
        code: 'invalid-manifest',
        message: `duplicate command id: ${id}`,
      };
    }
    seen.add(id);
    commands.push(when ? { id, name, handler, when } : { id, name, handler });
  }
  return commands;
}

function parsePanels(
  value: unknown
): PluginPanelContribution[] | PluginManifestError {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return { code: 'invalid-manifest', message: 'views must be an array' };
  }
  const panels: PluginPanelContribution[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) {
      return { code: 'invalid-manifest', message: 'view must be an object' };
    }
    const id = asString(entry.id);
    const name = asString(entry.name);
    const entryPath = asString(entry.entry);
    if (!(id && isLocalContributionId(id) && name && entryPath)) {
      return {
        code: 'invalid-manifest',
        message: 'view id, name, and entry are required',
      };
    }
    if (!ENTRY_RE.test(entryPath)) {
      return {
        code: 'invalid-manifest',
        message: `invalid view entry: ${entryPath}`,
      };
    }
    if (seen.has(id)) {
      return { code: 'invalid-manifest', message: `duplicate view id: ${id}` };
    }
    seen.add(id);
    const singleton = entry.singleton === true;
    panels.push(
      singleton
        ? { id, name, entry: entryPath, singleton: true }
        : { id, name, entry: entryPath }
    );
  }
  return panels;
}

function parseImporters(
  value: unknown
): PluginImporterContribution[] | PluginManifestError {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return { code: 'invalid-manifest', message: 'importers must be an array' };
  }
  const importers: PluginImporterContribution[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) {
      return {
        code: 'invalid-manifest',
        message: 'importer must be an object',
      };
    }
    const id = asString(entry.id);
    const name = asString(entry.name);
    const handler = asString(entry.handler);
    if (!(id && isLocalContributionId(id) && name && handler)) {
      return {
        code: 'invalid-manifest',
        message: 'importer id, name, and handler are required',
      };
    }
    if (!HANDLER_RE.test(handler)) {
      return {
        code: 'invalid-manifest',
        message: `invalid importer handler: ${handler}`,
      };
    }
    if (seen.has(id)) {
      return {
        code: 'invalid-manifest',
        message: `duplicate importer id: ${id}`,
      };
    }
    seen.add(id);
    const mimeTypes = Array.isArray(entry.mimeTypes)
      ? entry.mimeTypes.filter(
          (item): item is string => typeof item === 'string'
        )
      : undefined;
    importers.push(
      mimeTypes && mimeTypes.length > 0
        ? { id, name, handler, mimeTypes }
        : { id, name, handler }
    );
  }
  return importers;
}

function parseCanvasTypes(
  value: unknown
): PluginCanvasTypeContribution[] | PluginManifestError {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return {
      code: 'invalid-manifest',
      message: 'canvasTypes must be an array',
    };
  }
  const types: PluginCanvasTypeContribution[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) {
      return {
        code: 'invalid-manifest',
        message: 'canvas type must be an object',
      };
    }
    const id = asString(entry.id);
    const name = asString(entry.name);
    const dataVersion = entry.dataVersion;
    if (
      !(id && isLocalContributionId(id) && name) ||
      typeof dataVersion !== 'number' ||
      !Number.isInteger(dataVersion) ||
      dataVersion < 1
    ) {
      return {
        code: 'invalid-manifest',
        message: 'canvas type id, name, and dataVersion are required',
      };
    }
    if (seen.has(id)) {
      return {
        code: 'invalid-manifest',
        message: `duplicate canvas type id: ${id}`,
      };
    }
    seen.add(id);
    const entryPath = asString(entry.entry);
    types.push(
      entryPath
        ? { id, name, dataVersion, entry: entryPath }
        : { id, name, dataVersion }
    );
  }
  return types;
}

export function listContributionKinds(
  manifest: PluginManifest
): PluginContributionKind[] {
  const kinds: PluginContributionKind[] = [];
  if (manifest.contributes.commands.length > 0) {
    kinds.push('command');
  }
  if (manifest.contributes.panels.length > 0) {
    kinds.push('panel');
  }
  if (manifest.contributes.importers.length > 0) {
    kinds.push('importer');
  }
  if (manifest.contributes.canvasTypes.length > 0) {
    kinds.push('canvasType');
  }
  return kinds;
}

export function parsePluginManifest(
  input: unknown,
  options?: { allowBuiltin?: boolean }
): PluginManifest | PluginManifestError {
  const value =
    typeof input === 'string'
      ? (() => {
          try {
            return JSON.parse(input) as unknown;
          } catch {
            return null;
          }
        })()
      : input;
  if (value === null && typeof input === 'string') {
    return { code: 'invalid-json', message: 'manifest is not valid JSON' };
  }
  if (!isRecord(value)) {
    return { code: 'invalid-manifest', message: 'manifest must be an object' };
  }
  if (value.manifestVersion !== PLUGIN_MANIFEST_VERSION) {
    return {
      code: 'invalid-manifest',
      message: 'unsupported manifestVersion',
    };
  }
  const id = asString(value.id);
  const name = asString(value.name);
  const version = asString(value.version);
  if (!(id && isPluginId(id) && name && version && isSemver(version))) {
    return {
      code: 'invalid-manifest',
      message: 'id, name, and semver version are required',
    };
  }
  if (!(options?.allowBuiltin || isThirdPartyPluginId(id))) {
    return {
      code: 'reserved-plugin-id',
      message: 'ghostboard.* is reserved for built-in plugins',
    };
  }
  if (!isRecord(value.engines) || typeof value.engines.hostApi !== 'string') {
    return {
      code: 'invalid-manifest',
      message: 'engines.hostApi is required',
    };
  }
  if (!HOST_API_RANGE_RE.test(value.engines.hostApi)) {
    return {
      code: 'incompatible-host-api',
      message: `unsupported hostApi range: ${value.engines.hostApi}`,
    };
  }
  if (!value.engines.hostApi.includes(HOST_API_VERSION.split('.')[0] ?? '1')) {
    return {
      code: 'incompatible-host-api',
      message: `hostApi ${HOST_API_VERSION} is outside ${value.engines.hostApi}`,
    };
  }

  const permissionBlock = isRecord(value.permissions) ? value.permissions : {};
  const required = parsePermissionList(permissionBlock.required);
  if ('code' in required) {
    return required;
  }
  const optional = parsePermissionList(permissionBlock.optional);
  if ('code' in optional) {
    return optional;
  }

  if (!isRecord(value.contributes)) {
    return {
      code: 'missing-contribution',
      message: 'at least one contribution is required',
    };
  }
  for (const key of Object.keys(value.contributes)) {
    if (!KNOWN_CONTRIBUTE_KEYS.has(key)) {
      return {
        code: 'invalid-manifest',
        message: `unknown contribution kind: ${key}`,
      };
    }
  }

  const commands = parseCommands(value.contributes.commands);
  if ('code' in commands) {
    return commands;
  }
  const panels = parsePanels(
    value.contributes.views ?? value.contributes.panels
  );
  if ('code' in panels) {
    return panels;
  }
  const importers = parseImporters(value.contributes.importers);
  if ('code' in importers) {
    return importers;
  }
  const canvasTypes = parseCanvasTypes(value.contributes.canvasTypes);
  if ('code' in canvasTypes) {
    return canvasTypes;
  }
  if (
    commands.length + panels.length + importers.length + canvasTypes.length ===
    0
  ) {
    return {
      code: 'missing-contribution',
      message: 'at least one contribution is required',
    };
  }

  const manifest: PluginManifest = {
    manifestVersion: PLUGIN_MANIFEST_VERSION,
    id,
    name,
    version,
    engines: { hostApi: value.engines.hostApi },
    permissions: { required, optional },
    contributes: { commands, panels, importers, canvasTypes },
  };
  const description = asString(value.description);
  if (description) {
    manifest.description = description;
  }
  const author = asString(value.author);
  if (author) {
    manifest.author = author;
  }
  return manifest;
}

export function isPluginManifestError(
  value: PluginManifest | PluginManifestError
): value is PluginManifestError {
  return 'code' in value;
}
