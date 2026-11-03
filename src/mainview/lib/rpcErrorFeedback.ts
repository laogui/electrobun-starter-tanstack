import { isRpcValidationFailure } from '../../shared/rpcFailure';

export const RPC_MAX_WAIT_MS = 30 * 60_000;
const INTERACTIVE_REQUEST =
  /^(import|export|select|pick|choose|switchWorkspace)|^pluginPrepare.*(File|Directory)|^pluginFilesPick/;
const WRITE_REQUEST =
  /^(save|create|delete|restore|quarantine|resolve|pluginCommit|pluginRollback)/;
const AI_REQUEST = /^(ai|pluginPrepare)/;
export class RpcTimeoutError extends Error {
  readonly method: string;
  constructor(method: string) {
    super(`RPC ${method} timed out; its host operation may still complete.`);
    this.name = 'RpcTimeoutError';
    this.method = method;
  }
}
export function rpcRequestTimeoutMs(method: string): number {
  if (INTERACTIVE_REQUEST.test(method)) {
    return RPC_MAX_WAIT_MS;
  }
  if (WRITE_REQUEST.test(method) || method === 'loadCanvas') {
    return 90_000;
  }
  if (AI_REQUEST.test(method)) {
    return 180_000;
  }
  return 20_000;
}
/** Bound the caller's wait without pretending a timed-out host write was canceled. */
export function withRpcRequestTimeouts<T extends object>(
  requests: T,
  report: (method: string) => void,
  timeoutFor: (method: string) => number = rpcRequestTimeoutMs
): T {
  return new Proxy(requests, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== 'function' || typeof key !== 'string') {
        return value;
      }
      return async (...args: unknown[]) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            Promise.resolve().then(() => value.apply(target, args)),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                report(key);
                reject(new RpcTimeoutError(key));
              }, timeoutFor(key));
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      };
    },
  });
}
/** Keep the host's structured failure; report it once at the request boundary. */
export function withRpcErrorFeedback<T extends object>(
  requests: T,
  report: (method: string, detail: string) => void
): T {
  return new Proxy(requests, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') {
        return value;
      }
      return async (...args: unknown[]) => {
        const result: unknown = await value.apply(target, args);
        if (isRpcValidationFailure(result)) {
          report(result.method, result.message);
        }
        return result;
      };
    },
  });
}
