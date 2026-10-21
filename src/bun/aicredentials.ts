import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { AI_PROVIDERS, type AIProvider } from '../shared/ai/providerConfig';
import { getAppDataRoot } from './appPaths';
import { atomicWrite } from './atomicWrite';

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

/** Read ai-credentials.json. Returns an empty object when missing/unreadable. */
export async function loadAICredentials(): Promise<AICredentials> {
  let text: string;
  try {
    text = await readFile(getAICredentialsPath(), 'utf8');
  } catch {
    return {};
  }
  try {
    const parsed = JSON.parse(text) as Partial<AICredentials>;
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
  } catch {
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
  const existing = await loadAICredentials();
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
    const existing = await loadAICredentials();
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
