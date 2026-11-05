/**
 * Per-workspace services created during bootstrap and closed over by the RPC
 * handler factories in `rpc/handlers/*`.
 */
export interface RpcContext {
  isDevChannel: boolean;
  wsPath: string;
}
