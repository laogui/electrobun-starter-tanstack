import {
  createPublicKey,
  type KeyObject,
  verify as verifySignature,
} from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  isPluginPublicKey,
  PLUGIN_PUBLIC_KEY_PREFIX,
  type PluginManifest,
} from '../../shared/plugins/manifest';
import { readPluginContents } from './directoryContents';

export const PLUGIN_SIGNATURE_FILE = 'ghostboard-signature.json';
export const PLUGIN_SIGNATURE_SCHEMA = 'ghostboard-plugin-signature/v1';
export const PLUGIN_SIGNATURE_PAYLOAD_SCHEMA =
  'ghostboard-plugin-signature-payload/v1';
const SIGNATURE_MAX_BYTES = 16 * 1024;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;

export interface PluginSignatureEnvelope {
  algorithm: 'ed25519';
  schema: typeof PLUGIN_SIGNATURE_SCHEMA;
  signature: string;
  treeSha256: string;
}

export interface VerifiedPluginSignature {
  publicKey: string;
  treeSha256: string;
  updateUrl?: string;
}

export class PluginSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginSignatureError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function decodeCanonicalBase64(
  value: string,
  expectedBytes: number,
  label: string
): Buffer {
  if (!BASE64_RE.test(value)) {
    throw new PluginSignatureError(`${label} must be canonical base64`);
  }
  const decoded = Buffer.from(value, 'base64');
  if (
    decoded.byteLength !== expectedBytes ||
    decoded.toString('base64') !== value
  ) {
    throw new PluginSignatureError(`${label} must be canonical base64`);
  }
  return decoded;
}

export function parsePluginSignatureEnvelope(
  raw: string
): PluginSignatureEnvelope {
  if (Buffer.byteLength(raw) > SIGNATURE_MAX_BYTES) {
    throw new PluginSignatureError('plugin signature envelope is too large');
  }
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new PluginSignatureError('plugin signature envelope is not JSON');
  }
  if (!isRecord(value)) {
    throw new PluginSignatureError(
      'plugin signature envelope must be an object'
    );
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 4 ||
    keys[0] !== 'algorithm' ||
    keys[1] !== 'schema' ||
    keys[2] !== 'signature' ||
    keys[3] !== 'treeSha256'
  ) {
    throw new PluginSignatureError(
      'plugin signature envelope has unsupported fields'
    );
  }
  if (value.schema !== PLUGIN_SIGNATURE_SCHEMA) {
    throw new PluginSignatureError(
      `plugin signature schema must be ${PLUGIN_SIGNATURE_SCHEMA}`
    );
  }
  if (value.algorithm !== 'ed25519') {
    throw new PluginSignatureError(
      'plugin signature algorithm must be ed25519'
    );
  }
  if (
    typeof value.treeSha256 !== 'string' ||
    !SHA256_RE.test(value.treeSha256)
  ) {
    throw new PluginSignatureError(
      'plugin signature treeSha256 must be lowercase SHA-256'
    );
  }
  if (typeof value.signature !== 'string') {
    throw new PluginSignatureError('plugin signature is required');
  }
  decodeCanonicalBase64(value.signature, 64, 'plugin signature');
  return {
    schema: PLUGIN_SIGNATURE_SCHEMA,
    algorithm: 'ed25519',
    treeSha256: value.treeSha256,
    signature: value.signature,
  };
}

export function createPluginSignaturePayload(input: {
  pluginId: string;
  treeSha256: string;
  updateUrl?: string;
  version: string;
}): Uint8Array {
  return new TextEncoder().encode(
    `${JSON.stringify({
      schema: PLUGIN_SIGNATURE_PAYLOAD_SCHEMA,
      pluginId: input.pluginId,
      version: input.version,
      treeSha256: input.treeSha256,
      updateUrl: input.updateUrl ?? null,
    })}\n`
  );
}

function importPublicKey(publicKey: string): KeyObject {
  if (!isPluginPublicKey(publicKey)) {
    throw new PluginSignatureError(
      'manifest publicKey is not canonical Ed25519 SPKI'
    );
  }
  try {
    const der = decodeCanonicalBase64(
      publicKey.slice(PLUGIN_PUBLIC_KEY_PREFIX.length),
      44,
      'manifest publicKey'
    );
    const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ed25519') {
      throw new Error('not Ed25519');
    }
    return key;
  } catch (error) {
    if (error instanceof PluginSignatureError) {
      throw error;
    }
    throw new PluginSignatureError(
      'manifest publicKey is not a valid Ed25519 key'
    );
  }
}

export async function verifyPluginDirectorySignature(
  directory: string,
  manifest: PluginManifest
): Promise<VerifiedPluginSignature | undefined> {
  let raw: string | undefined;
  try {
    raw = await readFile(join(directory, PLUGIN_SIGNATURE_FILE), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new PluginSignatureError(
        'plugin signature envelope cannot be read'
      );
    }
  }
  if (!(raw || manifest.publicKey)) {
    return;
  }
  if (!raw) {
    throw new PluginSignatureError(
      `manifest publicKey requires ${PLUGIN_SIGNATURE_FILE}`
    );
  }
  if (!manifest.publicKey) {
    throw new PluginSignatureError(
      `${PLUGIN_SIGNATURE_FILE} requires manifest publicKey`
    );
  }
  const envelope = parsePluginSignatureEnvelope(raw);
  const treeSha256 = (
    await readPluginContents(directory, {
      excludePaths: new Set([PLUGIN_SIGNATURE_FILE]),
    })
  ).digest;
  if (treeSha256 !== envelope.treeSha256) {
    throw new PluginSignatureError(
      'plugin signature tree digest does not match package contents'
    );
  }
  const publicKey = importPublicKey(manifest.publicKey);
  const signature = decodeCanonicalBase64(
    envelope.signature,
    64,
    'plugin signature'
  );
  const payload = createPluginSignaturePayload({
    pluginId: manifest.id,
    version: manifest.version,
    treeSha256,
    ...(manifest.update ? { updateUrl: manifest.update.url } : {}),
  });
  if (!verifySignature(null, payload, publicKey, Uint8Array.from(signature))) {
    throw new PluginSignatureError('plugin signature verification failed');
  }
  return {
    publicKey: manifest.publicKey,
    treeSha256,
    ...(manifest.update ? { updateUrl: manifest.update.url } : {}),
  };
}
