import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { LoadedPluginDirectory } from './loadDirectory';
import { loadPluginFromZip, PLUGIN_ZIP_MAX_UNCOMPRESSED } from './zipInstall';

export const PLUGIN_DOWNLOAD_MAX_BYTES = PLUGIN_ZIP_MAX_UNCOMPRESSED;
export const PLUGIN_DOWNLOAD_MAX_REDIRECTS = 5;

export class PluginDownloadError extends Error {
  code:
    | 'download-failed'
    | 'forbidden-target'
    | 'invalid-url'
    | 'resource-limit'
    | 'unsupported-source';

  constructor(code: PluginDownloadError['code'], message: string) {
    super(message);
    this.name = 'PluginDownloadError';
    this.code = code;
  }
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const PRIVATE_V4_RE = /^(10\.|192\.168\.|127\.|169\.254\.)/;

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return LOOPBACK_HOSTS.has(host);
}

function isPrivateV4Host(hostname: string): boolean {
  if (PRIVATE_V4_RE.test(hostname)) {
    return true;
  }
  const parts = hostname.split('.');
  if (parts.length !== 4) {
    return false;
  }
  const first = Number(parts[0]);
  const second = Number(parts[1]);
  return first === 172 && second >= 16 && second <= 31;
}

export function parsePluginDownloadUrl(
  raw: string,
  options?: { allowLoopback?: boolean }
): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new PluginDownloadError(
      'invalid-url',
      'plugin download URL is invalid'
    );
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new PluginDownloadError(
      'forbidden-target',
      'plugin download URL must not include userinfo'
    );
  }
  const allowLoopback = options?.allowLoopback === true;
  const loopback = isLoopbackHost(parsed.hostname);
  if (parsed.protocol === 'https:') {
    if (loopback && !allowLoopback) {
      throw new PluginDownloadError(
        'forbidden-target',
        'loopback plugin downloads are not allowed'
      );
    }
    if (!loopback && isPrivateV4Host(parsed.hostname)) {
      throw new PluginDownloadError(
        'forbidden-target',
        'private-network plugin downloads are not allowed'
      );
    }
    return parsed;
  }
  if (parsed.protocol === 'http:' && allowLoopback && loopback) {
    return parsed;
  }
  throw new PluginDownloadError(
    'forbidden-target',
    'plugin downloads require https, or loopback http when explicitly allowed'
  );
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function isHtmlContentType(value: string | null): boolean {
  return (value ?? '').toLowerCase().includes('text/html');
}

function isJsonContentType(value: string | null): boolean {
  return (value ?? '').toLowerCase().includes('application/json');
}

export async function downloadPluginZip(
  rawUrl: string,
  options?: { allowLoopback?: boolean }
): Promise<Uint8Array> {
  let current = parsePluginDownloadUrl(rawUrl, options);
  for (let hop = 0; hop <= PLUGIN_DOWNLOAD_MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      headers: {
        accept: 'application/zip, application/octet-stream',
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new PluginDownloadError(
          'download-failed',
          'plugin download redirect is missing a location'
        );
      }
      const next = parsePluginDownloadUrl(
        new URL(location, current).toString(),
        options
      );
      if (current.protocol === 'https:' && next.protocol !== 'https:') {
        throw new PluginDownloadError(
          'forbidden-target',
          'plugin download must not redirect from https to http'
        );
      }
      current = next;
      continue;
    }
    if (!response.ok) {
      throw new PluginDownloadError(
        'download-failed',
        `plugin download failed with status ${response.status}`
      );
    }
    const contentType = response.headers.get('content-type');
    if (isHtmlContentType(contentType) || isJsonContentType(contentType)) {
      throw new PluginDownloadError(
        'unsupported-source',
        'plugin download must be a zip archive, not an html or json page'
      );
    }
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > PLUGIN_DOWNLOAD_MAX_BYTES) {
      throw new PluginDownloadError(
        'resource-limit',
        `plugin download exceeds ${PLUGIN_DOWNLOAD_MAX_BYTES} bytes`
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > PLUGIN_DOWNLOAD_MAX_BYTES) {
      throw new PluginDownloadError(
        'resource-limit',
        `plugin download exceeds ${PLUGIN_DOWNLOAD_MAX_BYTES} bytes`
      );
    }
    if (!looksLikeZip(bytes)) {
      throw new PluginDownloadError(
        'unsupported-source',
        'plugin download is not a zip archive'
      );
    }
    return bytes;
  }
  throw new PluginDownloadError(
    'resource-limit',
    `plugin download exceeded ${PLUGIN_DOWNLOAD_MAX_REDIRECTS} redirects`
  );
}

export async function loadPluginFromZipUrl(input: {
  allowLoopback?: boolean;
  destDir: string;
  url: string;
}): Promise<LoadedPluginDirectory> {
  const zipBytes = await downloadPluginZip(input.url, {
    allowLoopback: input.allowLoopback,
  });
  await mkdir(input.destDir, { recursive: true });
  return loadPluginFromZip(zipBytes, join(input.destDir, 'unpacked'));
}
