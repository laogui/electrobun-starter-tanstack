import type { ExtensionSchedulerService } from '../extensions/schedulerService';
import type { PluginFileStore } from '../plugins/files';
import type { PluginManagementService } from '../plugins/management';
import type { PluginStartupGuard } from '../plugins/safeMode';

/**
 * Per-workspace services created during bootstrap and closed over by the RPC
 * handler factories in `rpc/handlers/*`.
 */
export interface RpcContext {
  extensionScheduler: ExtensionSchedulerService;
  isDevChannel: boolean;
  pluginFiles: PluginFileStore;
  pluginManagement: PluginManagementService;
  pluginStartupGuard: PluginStartupGuard | undefined;
  wsPath: string;
}
