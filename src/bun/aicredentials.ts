import { join } from 'node:path';

import { AI_PROVIDERS, type AIProvider } from '../shared/ai/providerConfig';
import { getAppDataRoot } from './appPaths';
import { atomicWrite } from './atomicWrite';
import { readJsonOrEmpty } from './persistence/corruptFile';

/**
 * The LLM API key lives OUTSIDE the workspace so it never lands in
 * `<workspace>/.ghostboard/settings.json` (which users may commit to git).
 * Stored at `~/.ghostboard/{channel}/ai-credentials.json` alongside `userprefs.json`.
 */
export interface AICredentials {
  apiKey?: string;
  providers?: Partial<Record<AIProvider, string>>;
}

const AI_CREDENTIALS_FILENAME = 'ai-credentials.json';

function getAICredentialsPath(): string {
  return join(getAppDataRoot(), AI_CREDENTIALS_FILENAME);
}

function parseAICredentials(value: unknown): AICredentials {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ai-credentials.json is not a JSON object.');
  }
  const parsed = value as Partial<AICredentials>;
  const providers: Partial<Record<AIProvider, string>> = {};
  for (const provider of AI_PROVIDERS) {
    const key = parsed.providers?.[provider];
    if (typeof key === 'string' && key.trim()) {
      providers[provider] = key.trim();
    }
  }
  return {
    providers,
    apiKey:
      typeof parsed.apiKey === 'string' && parsed.apiKey.length
        ? parsed.apiKey
        : undefined,
  };
}

/**
 * Read ai-credentials.json for a read-modify-write. Missing => empty. A
 * damaged file is first copied aside (owner-only) and then treated as empty.
 * Any other read error (EACCES, EIO, ...) is rethrown so the caller never
 * replaces a file it could not read, which would wipe every other key.
 */
async function readAICredentialsStrict(): Promise<AICredentials> {
  const read = await readJsonOrEmpty(
    getAICredentialsPath(),
    parseAICredentials,
    { corruptCopyMode: 0o600 }
  );
  if (read.kind === 'ok') {
    return read.value;
  }
  if (read.kind === 'corrupt') {
    console.warn(
      `[aicredentials] ai-credentials.json is corrupt (${read.error.message}); preserved at ${read.backupPath}`
    );
  }
  return {};
}

/**
 * Read ai-credentials.json. Returns an empty object when missing or
 * unreadable (read-only callers degrade to "no key"); writes use the strict
 * reader instead.
 */
export async function loadAICredentials(): Promise<AICredentials> {
  try {
    return await readAICredentialsStrict();
  } catch (error) {
    console.warn('[aicredentials] Failed to read credentials:', error);
    return {};
  }
}

/**
 * Merge one key change into the stored credentials. A legacy (provider-less)
 * `apiKey` and the per-provider keys are independent: changing one must never
 * drop the other. Passing null or an empty string removes only that key.
 */
export function mergeAICredentials(
  existing: AICredentials,
  apiKey: string | null,
  provider?: AIProvider
): AICredentials {
  const trimmed = apiKey?.trim() ?? '';
  const providers: Partial<Record<AIProvider, string>> = {
    ...existing.providers,
  };
  let legacyKey = existing.apiKey;
  if (provider) {
    if (trimmed) {
      providers[provider] = trimmed;
    } else {
      delete providers[provider];
    }
  } else {
    legacyKey = trimmed || undefined;
  }
  const merged: AICredentials = {};
  if (legacyKey) {
    merged.apiKey = legacyKey;
  }
  if (Object.keys(providers).length > 0) {
    merged.providers = providers;
  }
  return merged;
}

/**
 * Atomic write of the API key (creates the parent dir if missing). The file
 * is created with mode 0600 so the secret is never briefly world-readable.
 */
async function writeAIApiKey(
  apiKey: string | null,
  provider?: AIProvider
): Promise<void> {
  const existing = await readAICredentialsStrict();
  const credentials = mergeAICredentials(existing, apiKey, provider);
  await atomicWrite(
    getAICredentialsPath(),
    JSON.stringify(credentials, null, 2),
    { mode: 0o600 }
  );
}

// Serialize read-modify-write operations so simultaneous provider saves cannot lose keys.
let credentialWrites: Promise<void> = Promise.resolve();
export function saveAIApiKey(
  apiKey: string | null,
  provider?: AIProvider
): Promise<void> {
  const write = credentialWrites.then(() => writeAIApiKey(apiKey, provider));
  credentialWrites = write.catch(() => undefined);
  return write;
}

/**
 * Move the legacy provider-less `apiKey` onto `provider` (only when that
 * provider has no key yet) and drop the legacy field in the same write, so a
 * key the user later clears is not resurrected by the next startup migration.
 * Returns the key now stored for `provider`, if any.
 */
export function migrateLegacyAIApiKey(
  provider: AIProvider
): Promise<string | undefined> {
  const run = credentialWrites.then(async () => {
    const existing = await readAICredentialsStrict();
    if (!existing.apiKey) {
      return existing.providers?.[provider];
    }
    const providers = { ...existing.providers };
    if (!providers[provider]) {
      providers[provider] = existing.apiKey.trim();
    }
    const next: AICredentials = { providers };
    await atomicWrite(getAICredentialsPath(), JSON.stringify(next, null, 2), {
      mode: 0o600,
    });
    return providers[provider];
  });
  credentialWrites = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
