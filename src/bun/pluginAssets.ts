import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const JAVASCRIPT_FILE = /\.(m?js)$/;

export interface PluginDirectoryMount {
  directory: string;
  id: string;
  version: string;
}

export function pluginModulePath(token: string, mount: PluginDirectoryMount) {
  return `/plugins/${encodeURIComponent(token)}/${encodeURIComponent(mount.id)}/${encodeURIComponent(mount.version)}/`;
}

export async function servePluginAsset(
  request: Request,
  token: string,
  mounts: readonly PluginDirectoryMount[],
  headers: HeadersInit
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/plugins/')) {
    return null;
  }
  const mount = mounts.find((entry) =>
    url.pathname.startsWith(pluginModulePath(token, entry))
  );
  if (!mount) {
    return new Response('Not found', { status: 404, headers });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers });
  }
  try {
    const path = decodeURIComponent(
      url.pathname.slice(pluginModulePath(token, mount).length)
    );
    if (
      !path ||
      path.includes('\\') ||
      path.includes('\0') ||
      path.split('/').some((part) => part === '.' || part === '..')
    ) {
      return new Response('Invalid module path', { status: 400, headers });
    }
    const directory = await realpath(mount.directory);
    const filePath = await realpath(resolve(directory, path));
    const child = relative(directory, filePath);
    if (
      !child ||
      isAbsolute(child) ||
      child === '..' ||
      child.startsWith(`..${sep}`) ||
      !(await stat(filePath)).isFile()
    ) {
      return new Response('Not found', { status: 404, headers });
    }
    const file = Bun.file(filePath);
    const responseHeaders = new Headers(headers);
    responseHeaders.set(
      'Content-Type',
      JAVASCRIPT_FILE.test(filePath)
        ? 'text/javascript; charset=utf-8'
        : file.type
    );
    responseHeaders.set('Cache-Control', 'no-store');
    responseHeaders.set('Referrer-Policy', 'no-referrer');
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    return new Response(request.method === 'HEAD' ? null : file, {
      headers: responseHeaders,
    });
  } catch {
    return new Response('Not found', { status: 404, headers });
  }
}
