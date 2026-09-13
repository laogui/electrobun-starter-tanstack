import {
  GHOSTBOARD_VERSION,
  isPluginId,
  isSemver,
  isThirdPartyPluginId,
} from './ids';

export const PLUGIN_MANIFEST_VERSION = 2;
export const LEGACY_PLUGIN_MESSAGE = '旧契约，需重新安装 v2 版本';
export const PLUGIN_CAPABILITIES = ['network', 'files', 'clipboard'] as const;
export const PLUGIN_PUBLIC_KEY_PREFIX = 'ed25519-spki:';
const ED25519_SPKI_BASE64_RE = /^MCowBQYDK2VwAyEA[A-Za-z0-9+/]{43}=$/;
export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number];

export interface PluginManifest {
  author?: string;
  capabilities: PluginCapability[];
  description?: string;
  engines: { ghostboard: string };
  entrypoints: { app: string };
  id: string;
  manifestVersion: typeof PLUGIN_MANIFEST_VERSION;
  name: string;
  publicKey?: string;
  update?: { url: string };
  version: string;
}

export interface PluginManifestError {
  code:
    | 'invalid-json'
    | 'invalid-manifest'
    | 'incompatible-host-api'
    | 'reserved-plugin-id'
    | 'legacy-contract';
  message: string;
}

const NUMERIC_IDENTIFIER_RE = /^\d+$/;
const PACKAGE_PATH_RE = /^[A-Za-z0-9._/-]+$/;
const APP_ENTRY_RE = /\.(m?js)$/;
const RANGE_RE = /^>=(\d+\.\d+\.\d+) <(\d+\.\d+\.\d+)$/;
const MANIFEST_KEYS = new Set([
  'manifestVersion',
  'id',
  'name',
  'version',
  'author',
  'description',
  'engines',
  'entrypoints',
  'capabilities',
  'publicKey',
  'update',
]);

export function compareSemver(left: string, right: string): number {
  const [leftCore = '', leftPre] = left.split('-');
  const [rightCore = '', rightPre] = right.split('-');
  const a = leftCore.split('.').map(Number);
  const b = rightCore.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  if (leftPre === rightPre) {
    return 0;
  }
  if (leftPre === undefined) {
    return 1;
  }
  if (rightPre === undefined) {
    return -1;
  }
  const aa = leftPre.split('.');
  const bb = rightPre.split('.');
  for (let index = 0; index < Math.max(aa.length, bb.length); index++) {
    const x = aa[index];
    const y = bb[index];
    if (x === y) {
      continue;
    }
    if (x === undefined) {
      return -1;
    }
    if (y === undefined) {
      return 1;
    }
    const xn = NUMERIC_IDENTIFIER_RE.test(x);
    const yn = NUMERIC_IDENTIFIER_RE.test(y);
    if (xn && yn) {
      return Number(x) - Number(y);
    }
    if (xn !== yn) {
      return xn ? -1 : 1;
    }
    return x < y ? -1 : 1;
  }
  return 0;
}

export function isHostVersionRange(range: string): boolean {
  const match = RANGE_RE.exec(range);
  return !!(
    match?.[1] &&
    match[2] &&
    isSemver(match[1]) &&
    isSemver(match[2]) &&
    compareSemver(match[1], match[2]) < 0
  );
}

export function hostVersionRangeIncludes(
  range: string,
  version: string
): boolean {
  const match = RANGE_RE.exec(range);
  return !!(
    isHostVersionRange(range) &&
    match?.[1] &&
    match[2] &&
    isSemver(version) &&
    compareSemver(match[1], version) <= 0 &&
    compareSemver(version, match[2]) < 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isSafePackagePath(value: string): boolean {
  return (
    PACKAGE_PATH_RE.test(value) &&
    value
      .split('/')
      .every(
        (segment) => segment.length > 0 && segment !== '.' && segment !== '..'
      )
  );
}

export function isPluginPublicKey(value: string): boolean {
  return (
    value.startsWith(PLUGIN_PUBLIC_KEY_PREFIX) &&
    ED25519_SPKI_BASE64_RE.test(value.slice(PLUGIN_PUBLIC_KEY_PREFIX.length))
  );
}

export function parsePluginManifest(
  input: unknown,
  options?: { allowBuiltin?: boolean }
): PluginManifest | PluginManifestError {
  let value: unknown = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch {
      return { code: 'invalid-json', message: 'manifest is not valid JSON' };
    }
  }
  const invalid = (message: string): PluginManifestError => ({
    code: 'invalid-manifest',
    message,
  });
  if (!isRecord(value)) {
    return invalid('manifest must be an object');
  }
  if (value.manifestVersion === 1) {
    return { code: 'legacy-contract', message: LEGACY_PLUGIN_MESSAGE };
  }
  if (value.manifestVersion !== PLUGIN_MANIFEST_VERSION) {
    return invalid('unsupported manifestVersion');
  }
  for (const key of Object.keys(value)) {
    if (!MANIFEST_KEYS.has(key)) {
      return invalid(`unsupported manifest field: ${key}`);
    }
  }
  const { id, name, version } = value;
  if (
    !(
      typeof id === 'string' &&
      isPluginId(id) &&
      typeof name === 'string' &&
      name.trim() &&
      typeof version === 'string' &&
      isSemver(version)
    )
  ) {
    return invalid('id, name, and semver version are required');
  }
  if (!(options?.allowBuiltin || isThirdPartyPluginId(id))) {
    return {
      code: 'reserved-plugin-id',
      message: 'ghostboard.* is reserved for built-in plugins',
    };
  }
  if (
    !(
      isRecord(value.engines) &&
      typeof value.engines.ghostboard === 'string' &&
      Object.keys(value.engines).length === 1
    )
  ) {
    return invalid('engines.ghostboard is required');
  }
  if (!hostVersionRangeIncludes(value.engines.ghostboard, GHOSTBOARD_VERSION)) {
    return {
      code: 'incompatible-host-api',
      message: `GhostBoard ${GHOSTBOARD_VERSION} is outside ${value.engines.ghostboard}`,
    };
  }
  if (
    !(
      isRecord(value.entrypoints) &&
      typeof value.entrypoints.app === 'string' &&
      isSafePackagePath(value.entrypoints.app) &&
      APP_ENTRY_RE.test(value.entrypoints.app) &&
      Object.keys(value.entrypoints).length === 1
    )
  ) {
    return invalid(
      'entrypoints.app must be a package-relative JavaScript file; backend entries are not supported'
    );
  }
  const capabilities = value.capabilities ?? [];
  if (
    !(
      Array.isArray(capabilities) &&
      capabilities.every(
        (item): item is PluginCapability =>
          typeof item === 'string' &&
          (PLUGIN_CAPABILITIES as readonly string[]).includes(item)
      )
    ) ||
    new Set(capabilities).size !== capabilities.length
  ) {
    return invalid(
      'capabilities must contain unique supported capability names'
    );
  }
  for (const key of ['author', 'description', 'publicKey']) {
    if (
      value[key] !== undefined &&
      (typeof value[key] !== 'string' || !value[key].trim())
    ) {
      return invalid(`${key} must be a non-empty string`);
    }
  }
  if (
    typeof value.publicKey === 'string' &&
    !isPluginPublicKey(value.publicKey)
  ) {
    return invalid(
      `publicKey must use ${PLUGIN_PUBLIC_KEY_PREFIX}<base64 SPKI DER>`
    );
  }
  let update: { url: string } | undefined;
  if (value.update !== undefined) {
    if (
      !(
        isRecord(value.update) &&
        typeof value.update.url === 'string' &&
        Object.keys(value.update).length === 1
      )
    ) {
      return invalid('update.url is required');
    }
    try {
      const url = new URL(value.update.url);
      if (url.protocol !== 'https:' || url.username || url.password) {
        return invalid('update.url must be HTTPS without credentials');
      }
      update = { url: url.toString() };
    } catch {
      return invalid('invalid update.url');
    }
  }
  return {
    manifestVersion: PLUGIN_MANIFEST_VERSION,
    id,
    name,
    version,
    engines: { ghostboard: value.engines.ghostboard },
    entrypoints: { app: value.entrypoints.app },
    capabilities,
    ...(typeof value.author === 'string' ? { author: value.author } : {}),
    ...(typeof value.description === 'string'
      ? { description: value.description }
      : {}),
    ...(typeof value.publicKey === 'string'
      ? { publicKey: value.publicKey }
      : {}),
    ...(update ? { update } : {}),
  };
}

export function isPluginManifestError(
  value: PluginManifest | PluginManifestError
): value is PluginManifestError {
  return 'code' in value;
}
