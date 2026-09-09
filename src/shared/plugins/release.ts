import { GHOSTBOARD_VERSION, isSemver, isThirdPartyPluginId } from './ids';
import {
  compareSemver,
  hostVersionRangeIncludes,
  isHostVersionRange,
  type PluginManifest,
} from './manifest';

export const PLUGIN_RELEASE_SCHEMA = 'ghostboard-plugin-release/v2';
export const PLUGIN_RELEASE_MAX_BYTES = 1024 * 1024;
export const PLUGIN_RELEASE_SHA256_RE = /^[a-f0-9]{64}$/;
const CHANNEL_RE = /^[a-z][a-z0-9-]{0,31}$/;
const NOTES_MAX_LENGTH = 8 * 1024;
const RELEASES_MAX = 50;

export type PluginReleaseErrorCode =
  | 'incompatible-host-version'
  | 'invalid-json'
  | 'invalid-release'
  | 'resource-limit'
  | 'unsupported-source';

export interface PluginReleaseError {
  code: PluginReleaseErrorCode;
  message: string;
}

export interface PluginReleaseRecord {
  ghostboard: string;
  notes?: string;
  sha256: string;
  url: string;
  version: string;
}

export interface PluginReleaseDocument {
  channel: string;
  pluginId: string;
  releases: PluginReleaseRecord[];
  schema: typeof PLUGIN_RELEASE_SCHEMA;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isPluginReleaseError(
  value: unknown
): value is PluginReleaseError {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    !('releases' in value)
  );
}

function invalid(message: string): PluginReleaseError {
  return { code: 'invalid-release', message };
}

function parseReleaseUrl(raw: string): string | PluginReleaseError {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return invalid('release url is invalid');
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return invalid('release url must not include userinfo');
  }
  if (parsed.protocol !== 'https:') {
    return invalid('release url must be https');
  }
  return parsed.toString();
}

function parseReleaseRecord(
  value: unknown
): PluginReleaseRecord | PluginReleaseError {
  if (!isRecord(value)) {
    return invalid('release entries must be objects');
  }
  const version = typeof value.version === 'string' ? value.version : '';
  const ghostboard =
    typeof value.ghostboard === 'string' ? value.ghostboard : '';
  const sha256 = typeof value.sha256 === 'string' ? value.sha256 : '';
  const url = typeof value.url === 'string' ? value.url : '';
  if (!isSemver(version)) {
    return invalid('release version must be semver');
  }
  if (!isHostVersionRange(ghostboard)) {
    return invalid('release ghostboard must be >=x.y.z <a.b.c');
  }
  if (!PLUGIN_RELEASE_SHA256_RE.test(sha256)) {
    return invalid('release sha256 must be 64 lowercase hex characters');
  }
  const parsedUrl = parseReleaseUrl(url);
  if (typeof parsedUrl !== 'string') {
    return parsedUrl;
  }
  const record: PluginReleaseRecord = {
    version,
    ghostboard,
    url: parsedUrl,
    sha256,
  };
  if (value.notes !== undefined) {
    if (
      typeof value.notes !== 'string' ||
      value.notes.length > NOTES_MAX_LENGTH
    ) {
      return invalid('release notes must be a short string');
    }
    record.notes = value.notes;
  }
  return record;
}

export function parsePluginReleaseDocument(
  raw: string
): PluginReleaseDocument | PluginReleaseError {
  if (raw.length > PLUGIN_RELEASE_MAX_BYTES) {
    return {
      code: 'resource-limit',
      message: `release document exceeds ${PLUGIN_RELEASE_MAX_BYTES} bytes`,
    };
  }
  const trimmed = raw.trim();
  if (trimmed.startsWith('<')) {
    return {
      code: 'unsupported-source',
      message: 'release document must be json, not html',
    };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return { code: 'invalid-json', message: 'release document is not json' };
  }
  if (!isRecord(value)) {
    return invalid('release document must be an object');
  }
  if (value.schema !== PLUGIN_RELEASE_SCHEMA) {
    return invalid(`schema must be ${PLUGIN_RELEASE_SCHEMA}`);
  }
  if (
    typeof value.pluginId !== 'string' ||
    !isThirdPartyPluginId(value.pluginId)
  ) {
    return invalid('pluginId must be a third-party plugin id');
  }
  if (typeof value.channel !== 'string' || !CHANNEL_RE.test(value.channel)) {
    return invalid('channel must be a lowercase identifier');
  }
  if (!Array.isArray(value.releases) || value.releases.length === 0) {
    return invalid('releases must be a non-empty array');
  }
  if (value.releases.length > RELEASES_MAX) {
    return {
      code: 'resource-limit',
      message: `release document exceeds ${RELEASES_MAX} releases`,
    };
  }
  const releases: PluginReleaseRecord[] = [];
  const seen = new Set<string>();
  for (const entry of value.releases) {
    const parsed = parseReleaseRecord(entry);
    if (isPluginReleaseError(parsed)) {
      return parsed;
    }
    if (seen.has(parsed.version)) {
      return invalid(`duplicate release version ${parsed.version}`);
    }
    seen.add(parsed.version);
    releases.push(parsed);
  }
  return {
    schema: PLUGIN_RELEASE_SCHEMA,
    pluginId: value.pluginId,
    channel: value.channel,
    releases,
  };
}

export function selectCompatibleRelease(
  document: PluginReleaseDocument,
  ghostboard = GHOSTBOARD_VERSION
): PluginReleaseRecord | PluginReleaseError {
  const compatible = document.releases.filter((release) =>
    hostVersionRangeIncludes(release.ghostboard, ghostboard)
  );
  if (compatible.length === 0) {
    return {
      code: 'incompatible-host-version',
      message: `no release supports ghostboard ${ghostboard}`,
    };
  }
  return compatible.reduce((latest, release) =>
    compareSemver(release.version, latest.version) > 0 ? release : latest
  );
}

export function releaseMatchesManifest(
  document: PluginReleaseDocument,
  manifest: PluginManifest,
  digest: string
): PluginReleaseError | undefined {
  if (document.pluginId !== manifest.id) {
    return invalid(
      `release pluginId ${document.pluginId} does not match manifest ${manifest.id}`
    );
  }
  const record = document.releases.find(
    (release) => release.version === manifest.version
  );
  if (!record) {
    return invalid(
      `release document has no entry for ${manifest.id}@${manifest.version}`
    );
  }
  if (record.sha256 !== digest) {
    return invalid('release sha256 does not match the package digest');
  }
  return;
}
