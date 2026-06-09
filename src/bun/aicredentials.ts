import { existsSync, mkdirSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { Utils } from 'electrobun/bun';

/**
 * The LLM API key lives OUTSIDE the workspace so it never lands in
 * `<workspace>/.ghostboard/settings.json` (which users may commit to git).
 * Stored at `<userData>/ai-credentials.json` alongside `userprefs.json`.
 */
export interface AICredentials {
  apiKey?: string;
}

const AI_CREDENTIALS_FILENAME = 'ai-credentials.json';

function getAICredentialsPath(): string {
  return join(Utils.paths.userData, AI_CREDENTIALS_FILENAME);
}

/** Read ai-credentials.json. Returns an empty object when missing/unreadable. */
export async function loadAICredentials(): Promise<AICredentials> {
  const file = Bun.file(getAICredentialsPath());
  if (!(await file.exists())) {
    return {};
  }
  try {
    const parsed = (await file.json()) as Partial<AICredentials>;
    return {
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
export async function saveAIApiKey(apiKey: string | null): Promise<void> {
  const path = getAICredentialsPath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const credentials: AICredentials = apiKey ? { apiKey } : {};
  const tmp = `${path}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  await Bun.write(tmp, JSON.stringify(credentials, null, 2));
  await rename(tmp, path);
}
