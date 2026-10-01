import { existsSync, mkdirSync } from 'node:fs';
import { chmod, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { AI_PROVIDERS, type AIProvider } from '../shared/ai/providerConfig';
import { getAppDataRoot } from './appPaths';

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
  const file = Bun.file(getAICredentialsPath());
  if (!(await file.exists())) {
    return {};
  }
  try {
    const parsed = (await file.json()) as Partial<AICredentials>;
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
 * Atomic write of the API key (creates the parent dir if missing). Passing null
 * or an empty string removes any stored key.
 */
async function writeAIApiKey(
  apiKey: string | null,
  provider?: AIProvider
): Promise<void> {
  const path = getAICredentialsPath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const existing = await loadAICredentials();
  const providers = { ...existing.providers };
  if (provider) {
    if (apiKey?.trim()) {
      providers[provider] = apiKey.trim();
    } else {
      delete providers[provider];
    }
  }
  const credentials: AICredentials = provider
    ? { providers }
    : apiKey
      ? { apiKey: apiKey.trim() }
      : {};
  const tmp = `${path}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  await Bun.write(tmp, JSON.stringify(credentials, null, 2));
  await chmod(tmp, 0o600);
  await rename(tmp, path);
  await chmod(path, 0o600);
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
