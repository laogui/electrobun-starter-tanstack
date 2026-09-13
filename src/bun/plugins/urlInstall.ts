import { lookup } from 'node:dns/promises';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PLUGIN_RELEASE_MAX_BYTES } from '../../shared/plugins/release';
import { isIpLiteral, isPublicAddress } from '../net/outboundPolicy';
import type { LoadedPluginDirectory } from './loadDirectory';
import { loadPluginFromZip, PLUGIN_ZIP_MAX_UNCOMPRESSED } from './zipInstall';

export const PLUGIN_DOWNLOAD_MAX_BYTES = PLUGIN_ZIP_MAX_UNCOMPRESSED;
export const PLUGIN_DOWNLOAD_MAX_REDIRECTS = 5;
export const PLUGIN_DOWNLOAD_TIMEOUT_MS = 60_000;

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
const BRACKETS_RE = /^\[|\]$/g;

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(BRACKETS_RE, '');
  return LOOPBACK_HOSTS.has(host);
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
    if (
      !loopback &&
      isIpLiteral(parsed.hostname) &&
      !isPublicAddress(parsed.hostname)
    ) {
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

/**
 * Rejects a hop whose hostname resolves to anything non-public.
 *
 * There is a TOCTOU window between this lookup and the socket connect: Bun's
 * `fetch` has no `lookup` hook, and dialing the resolved IP directly would
 * break SNI and certificate validation. We accept the window rather than
 * weaken TLS.
 */
async function assertPublicTarget(
  url: URL,
  allowLoopback: boolean
): Promise<void> {
  if (allowLoopback && isLoopbackHost(url.hostname)) {
    return;
  }
  const hostname = url.hostname.replace(BRACKETS_RE, '');
  let addresses: string[];
  if (isIpLiteral(hostname)) {
    addresses = [hostname];
  } else {
    try {
      addresses = (await lookup(hostname, { all: true })).map(
        (entry) => entry.address
      );
    } catch {
      throw new PluginDownloadError(
        'download-failed',
        `plugin download host could not be resolved: ${hostname}`
      );
    }
  }
  if (addresses.length === 0) {
    throw new PluginDownloadError(
      'download-failed',
      `plugin download host could not be resolved: ${hostname}`
    );
  }
  for (const address of addresses) {
    if (!isPublicAddress(address)) {
      throw new PluginDownloadError(
        'forbidden-target',
        `plugin download host resolves to a non-public address: ${address}`
      );
    }
  }
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

/**
 * Reads the body a chunk at a time and aborts the moment it passes the byte
 * budget, so a server that omits or lies about `Content-Length` cannot make us
 * buffer an unbounded response.
 */
async function readBodyWithinBudget(
  response: Response,
  maxBytes: number
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new PluginDownloadError(
      'download-failed',
      'plugin download response had no body'
    );
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  let result = await reader.read();
  while (!result.done) {
    const chunk = result.value;
    if (chunk) {
      total += chunk.length;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new PluginDownloadError(
          'resource-limit',
          `plugin download exceeds ${maxBytes} bytes`
        );
      }
      chunks.push(chunk);
    }
    result = await reader.read();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

interface PluginResourceDownloadOptions {
  accept: string;
  allowLoopback?: boolean;
  maxBytes: number;
  validateContentType: (value: string | null) => void;
}

async function downloadPluginResource(
  rawUrl: string,
  options: PluginResourceDownloadOptions
): Promise<Uint8Array> {
  const allowLoopback = options.allowLoopback === true;
  let current = parsePluginDownloadUrl(rawUrl, options);
  for (let hop = 0; hop <= PLUGIN_DOWNLOAD_MAX_REDIRECTS; hop += 1) {
    await assertPublicTarget(current, allowLoopback);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(PLUGIN_DOWNLOAD_TIMEOUT_MS),
        headers: { accept: options.accept },
      });
    } catch (error) {
      if (error instanceof PluginDownloadError) {
        throw error;
      }
      throw new PluginDownloadError(
        'download-failed',
        `plugin download failed: ${(error as Error).message}`
      );
    }
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
    options.validateContentType(response.headers.get('content-type'));
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > options.maxBytes) {
      throw new PluginDownloadError(
        'resource-limit',
        `plugin download exceeds ${options.maxBytes} bytes`
      );
    }
    return await readBodyWithinBudget(response, options.maxBytes);
  }
  throw new PluginDownloadError(
    'resource-limit',
    `plugin download exceeded ${PLUGIN_DOWNLOAD_MAX_REDIRECTS} redirects`
  );
}

export async function downloadPluginZip(
  rawUrl: string,
  options?: { allowLoopback?: boolean }
): Promise<Uint8Array> {
  const bytes = await downloadPluginResource(rawUrl, {
    accept: 'application/zip, application/octet-stream',
    allowLoopback: options?.allowLoopback,
    maxBytes: PLUGIN_DOWNLOAD_MAX_BYTES,
    validateContentType: (contentType) => {
      if (isHtmlContentType(contentType) || isJsonContentType(contentType)) {
        throw new PluginDownloadError(
          'unsupported-source',
          'plugin download must be a zip archive, not an html or json page'
        );
      }
    },
  });
  if (!looksLikeZip(bytes)) {
    throw new PluginDownloadError(
      'unsupported-source',
      'plugin download is not a zip archive'
    );
  }
  return bytes;
}

export async function downloadPluginReleaseDocument(
  rawUrl: string,
  options?: { allowLoopback?: boolean }
): Promise<string> {
  const bytes = await downloadPluginResource(rawUrl, {
    accept: 'application/json',
    allowLoopback: options?.allowLoopback,
    maxBytes: PLUGIN_RELEASE_MAX_BYTES,
    validateContentType: (contentType) => {
      if (isHtmlContentType(contentType)) {
        throw new PluginDownloadError(
          'unsupported-source',
          'plugin release document must be json, not html'
        );
      }
    },
  });
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
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
