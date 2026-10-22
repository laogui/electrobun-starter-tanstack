import type { BrowserWindow } from 'electrobun/bun';
import type { AIProvider } from '../shared/ai/providerConfig';
import type { DiagnosticsService } from './diagnostics';
import type { LocalHttpServerHandle } from './localHttpServer';
import type { MainRpc } from './rpc/types';

/**
 * Process-wide mutable state shared by the bootstrap (`index.ts`) and the RPC
 * handler modules. Previously these were module-level `let`s in index.ts.
 */
export interface AppState {
  // LLM API keys loaded from ~/.ghostboard/{channel}/ai-credentials.json (never in settings.json)
  cachedAIKeys: Partial<Record<AIProvider, string>>;
  diagnostics: DiagnosticsService | null;
  legacyEnvProvider: AIProvider;
  // Local HTTP endpoint bridging the BlockNote editor to the LLM provider.
  // Streaming responses cannot travel over RPC, so it runs on 127.0.0.1.
  localHttpServer: LocalHttpServerHandle | null;
  // Reference to main window RPC — set in main(), used by settings to push updates
  mainRpc: MainRpc | null;
  mainWindow: BrowserWindow | null;
}

export const appState: AppState = {
  cachedAIKeys: {},
  diagnostics: null,
  legacyEnvProvider: 'openai',
  localHttpServer: null,
  mainRpc: null,
  mainWindow: null,
};
