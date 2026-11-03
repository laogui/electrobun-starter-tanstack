import { randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * Who a local HTTP request authenticated as.
 *
 * - `renderer`: the main renderer (header bearer only). Every route.
 * - `media`: a read-only token that may travel in `?token=` because media
 *   elements and iframes cannot attach headers. Only `GET`/`HEAD` on
 *   `/attachment` and `/youtube`.
 * - `plugin`: a per-plugin host-service token. Only the plugin data routes
 *   (`/plugins/storage`, `/plugins/content`, `/plugins/files/*`), and only for
 *   the plugin id it was issued to.
 */
export type LocalHttpPrincipal =
  | { kind: 'media' }
  | { kind: 'plugin'; pluginId: string }
  | { kind: 'renderer' };

/** The slice of the credentials the plugin host controller needs. */
export interface PluginHostCredentials {
  /** Path segment for static plugin module URLs. Grants nothing else. */
  readonly assetToken: string;
  /** Stable scoped host-service token for a plugin for this launch. */
  pluginToken(pluginId: string): string;
  revokeAllPlugins(): void;
  revokePlugin(pluginId: string): void;
}

function sameSecret(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

const BEARER_PREFIX = 'Bearer ';

/**
 * Per-launch secrets for the 127.0.0.1 server. Each secret is a random UUID
 * minted in memory at startup; none is persisted.
 */
export class LocalHttpCredentials implements PluginHostCredentials {
  readonly rendererToken = randomUUID();
  readonly mediaToken = randomUUID();
  readonly assetToken = randomUUID();
  private readonly pluginsByToken = new Map<string, string>();
  private readonly tokensByPlugin = new Map<string, string>();

  pluginToken(pluginId: string): string {
    const existing = this.tokensByPlugin.get(pluginId);
    if (existing) {
      return existing;
    }
    const token = randomUUID();
    this.tokensByPlugin.set(pluginId, token);
    this.pluginsByToken.set(token, pluginId);
    return token;
  }

  revokePlugin(pluginId: string): void {
    const token = this.tokensByPlugin.get(pluginId);
    if (token) {
      this.tokensByPlugin.delete(pluginId);
      this.pluginsByToken.delete(token);
    }
  }

  resolvePluginToken(token: string): string | null {
    return this.pluginsByToken.get(token) ?? null;
  }

  revokeAllPlugins(): void {
    this.tokensByPlugin.clear();
    this.pluginsByToken.clear();
  }

  /**
   * Resolve the request's principal. Bearer headers may carry the renderer
   * or a plugin token; the query string may only carry the media token, and
   * only for safe methods.
   */
  authenticate(request: Request, url: URL): LocalHttpPrincipal | null {
    const header = request.headers.get('authorization');
    if (header?.startsWith(BEARER_PREFIX)) {
      const value = header.slice(BEARER_PREFIX.length);
      if (sameSecret(value, this.rendererToken)) {
        return { kind: 'renderer' };
      }
      const pluginId = this.pluginsByToken.get(value);
      if (pluginId) {
        return { kind: 'plugin', pluginId };
      }
      return null;
    }
    const query = url.searchParams.get('token');
    if (
      query &&
      (request.method === 'GET' || request.method === 'HEAD') &&
      sameSecret(query, this.mediaToken)
    ) {
      return { kind: 'media' };
    }
    return null;
  }
}
