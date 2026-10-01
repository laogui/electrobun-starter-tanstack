const TIMEOUT_RE = /timeout|timed out/i;
const TOOLS_RE = /tool|function.call|schema/i;
const MODEL_RE = /model.*(not found|does not exist|invalid)/i;
const NETWORK_RE = /fetch|connect|network|ECONN|ENOTFOUND/i;
const ERROR_CODE_RE =
  /ghostboard-ai:(configuration|authentication|model|rate-limit|unsupported-tools|timeout|cancelled|network|unknown)/;
export const AI_PROVIDERS = [
  'openai',
  'anthropic',
  'ollama',
  'custom',
] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];
export interface AIProviderProfile {
  baseUrl: string;
  model: string;
}
export type AIProviderProfiles = Partial<Record<AIProvider, AIProviderProfile>>;
export interface AIConnectionSettings {
  aiBaseUrl: string;
  aiModel: string;
  aiProfiles?: AIProviderProfiles;
  aiProvider: AIProvider;
}
export const AI_PROVIDER_DEFAULTS: Record<AIProvider, AIProviderProfile> = {
  openai: { model: 'gpt-4.1-mini', baseUrl: '' },
  anthropic: { model: 'claude-sonnet-4-5', baseUrl: '' },
  ollama: { model: 'qwen3:8b', baseUrl: 'http://localhost:11434/v1' },
  custom: { model: '', baseUrl: '' },
};
export function isAIProvider(value: unknown): value is AIProvider {
  return AI_PROVIDERS.some((provider) => provider === value);
}
export function normalizeAIProfiles(value: unknown): AIProviderProfiles {
  const result: AIProviderProfiles = {};
  if (!value || typeof value !== 'object') {
    return result;
  }
  for (const provider of AI_PROVIDERS) {
    const profile = (value as Record<string, unknown>)[provider];
    if (!profile || typeof profile !== 'object') {
      continue;
    }
    const { model, baseUrl } = profile as Record<string, unknown>;
    if (typeof model === 'string' && typeof baseUrl === 'string') {
      result[provider] = { model, baseUrl };
    }
  }
  return result;
}
export function switchAIProvider(
  settings: AIConnectionSettings,
  provider: AIProvider
): AIConnectionSettings {
  const aiProfiles = {
    ...normalizeAIProfiles(settings.aiProfiles),
    [settings.aiProvider]: {
      model: settings.aiModel,
      baseUrl: settings.aiBaseUrl,
    },
  };
  const next = aiProfiles[provider] ?? AI_PROVIDER_DEFAULTS[provider];
  return {
    aiProvider: provider,
    aiModel: next.model,
    aiBaseUrl: next.baseUrl,
    aiProfiles,
  };
}
export type AIErrorCode =
  | 'configuration'
  | 'authentication'
  | 'model'
  | 'rate-limit'
  | 'unsupported-tools'
  | 'timeout'
  | 'cancelled'
  | 'network'
  | 'unknown';
export interface AITestResult {
  error?: AIErrorCode;
  success: boolean;
}

/** Only fixed codes cross the UI boundary; provider responses may contain secrets. */
export function classifyAIError(error: unknown): AIErrorCode {
  const value =
    error && typeof error === 'object'
      ? (error as {
          statusCode?: number;
          name?: string;
          message?: string;
          cause?: unknown;
        })
      : {};
  const message = value.message ?? String(error);
  if (value.name === 'TimeoutError' || TIMEOUT_RE.test(message)) {
    return 'timeout';
  }
  if (value.name === 'AbortError') {
    return 'cancelled';
  }
  if (value.statusCode === 401 || value.statusCode === 403) {
    return 'authentication';
  }
  if (value.statusCode === 429) {
    return 'rate-limit';
  }
  if (value.statusCode === 404) {
    return 'model';
  }
  if (TOOLS_RE.test(message)) {
    return 'unsupported-tools';
  }
  if (MODEL_RE.test(message)) {
    return 'model';
  }
  if (NETWORK_RE.test(message)) {
    return 'network';
  }
  if (value.cause) {
    return classifyAIError(value.cause);
  }
  return 'unknown';
}
export function readAIErrorCode(error: unknown): AIErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  const match = ERROR_CODE_RE.exec(message);
  return match ? (match[1] as AIErrorCode) : classifyAIError(error);
}
