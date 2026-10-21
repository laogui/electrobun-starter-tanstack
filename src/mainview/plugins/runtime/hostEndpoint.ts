import { rpcGetLocalHttpEndpoint } from '@/lib/rpc';

interface ScopableTransport {
  getEndpoint?: () => Promise<{ baseUrl: string; token: string } | null>;
}

/**
 * Bind a host-service transport to one plugin's scoped token.
 *
 * The local server issues each plugin descriptor a `hostToken` that only
 * reaches that plugin's storage/content/files routes. Host services built for
 * the plugin send that token instead of the renderer token, so requests made
 * on a plugin's behalf cannot touch AI chat, attachments or another plugin's
 * data. Hosts that predate scoped tokens omit `hostToken`; the renderer
 * endpoint is then used unchanged so older harnesses keep working.
 *
 * `fallbackToRenderer` mirrors each service's existing default: storage and
 * content fall back to the renderer endpoint RPC, while a files transport
 * without `getEndpoint` deliberately stays on the RPC-only path.
 *
 * This is scoping, not isolation: plugins share the renderer realm, so a
 * malicious plugin can still wrap `fetch` or call the Electrobun bridge
 * directly (see PRD §2.14.0).
 */
export function scopeHostTransport<T extends ScopableTransport>(
  transport: T,
  hostToken: string | undefined,
  fallbackToRenderer: boolean
): T {
  const getEndpoint =
    transport.getEndpoint ??
    (fallbackToRenderer ? rpcGetLocalHttpEndpoint : undefined);
  if (!getEndpoint) {
    return transport;
  }
  return {
    ...transport,
    getEndpoint: async () => {
      const endpoint = await getEndpoint();
      if (!(endpoint && hostToken)) {
        return endpoint;
      }
      // Drop every renderer credential; only the scoped token leaves here.
      return {
        aiEnabled: false,
        baseUrl: endpoint.baseUrl,
        mediaToken: '',
        token: hostToken,
      };
    },
  };
}
