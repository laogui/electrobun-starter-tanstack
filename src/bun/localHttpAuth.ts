import { randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * Who a local HTTP request authenticated as.
 *
 * - `renderer`: the main renderer (header bearer only). Every route.
 * - `media`: a read-only token that may travel in `?token=` because media
 *   elements and iframes cannot attach headers. Only `GET`/`HEAD` on
 *   `/attachment` and `/youtube`.
 */
export type LocalHttpPrincipal = { kind: 'media' } | { kind: 'renderer' };

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
export class LocalHttpCredentials {
  readonly rendererToken = randomUUID();
  readonly mediaToken = randomUUID();

  /**
   * Resolve the request's principal. Bearer headers may carry only the
   * renderer token; the query string may only carry the media token, and
   * only for safe methods.
   */
  authenticate(request: Request, url: URL): LocalHttpPrincipal | null {
    const header = request.headers.get('authorization');
    if (header?.startsWith(BEARER_PREFIX)) {
      const value = header.slice(BEARER_PREFIX.length);
      return sameSecret(value, this.rendererToken)
        ? { kind: 'renderer' }
        : null;
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
