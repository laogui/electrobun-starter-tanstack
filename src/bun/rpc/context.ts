import type { ExtensionSchedulerService } from '../extensions/schedulerService';

/**
 * Per-workspace services created during bootstrap and closed over by the RPC
 * handler factories in `rpc/handlers/*`.
 */
export interface RpcContext {
  extensionScheduler: ExtensionSchedulerService;
  isDevChannel: boolean;
  wsPath: string;
}
