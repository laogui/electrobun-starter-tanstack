import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { getAppChannel } from '../appPaths';
import { atomicWrite } from '../atomicWrite';
import { type PluginDirectoryMount, pluginModulePath } from '../pluginAssets';
import { loadPluginDirectory, PluginDirectoryError } from './loadDirectory';

declare const __GHOSTBOARD_ENABLE_PLUGIN_T0__: boolean | undefined;

/**
 * The T0 host grants arbitrary absolute-path reads/writes and unrestricted
 * fetch, so an environment variable alone must never turn it on in a shipped
 * app. It is available only in `dev` channel runs, or in non-stable builds
 * compiled with `GHOSTBOARD_ENABLE_PLUGIN_T0=1` (the T0 harness).
 */
export function isT0HostAllowed(
  channel: string,
  compiledIn = typeof __GHOSTBOARD_ENABLE_PLUGIN_T0__ === 'boolean' &&
    __GHOSTBOARD_ENABLE_PLUGIN_T0__
): boolean {
  if (channel === 'dev') {
    return true;
  }
  return compiledIn && channel === 'canary';
}

// Opt-in packaged-app experiment; no T0 services exist in a normal launch.
export function createT0Host(directory = process.env.GHOSTBOARD_PLUGIN_T0_DIR) {
  if (!directory) {
    return null;
  }
  if (!isT0HostAllowed(getAppChannel())) {
    console.warn(
      '[plugins] GHOSTBOARD_PLUGIN_T0_DIR ignored: the T0 host is not available in this build.'
    );
    return null;
  }
  if (!isAbsolute(directory)) {
    throw new Error('GHOSTBOARD_PLUGIN_T0_DIR must be absolute');
  }
  const mounts: PluginDirectoryMount[] = [
    { directory: join(directory, 'plain'), id: 't0.plain', version: '0.1.0' },
    { directory: join(directory, 'react'), id: 't0.react', version: '0.1.0' },
  ];
  return {
    mounts,
    diagnose(baseUrl: string, token: string) {
      return setTimeout(async () => {
        const { BrowserView } = await import('electrobun/bun');
        for (const view of BrowserView.getAll()) {
          view.executeJavascript(
            `fetch(${JSON.stringify(`${baseUrl}/plugin-t0/diagnostics`)},{method:'POST',headers:{'Authorization':${JSON.stringify(`Bearer ${token}`)},'Content-Type':'application/json'},body:JSON.stringify({page:location.href,readyState:document.readyState,errors:globalThis.__pluginT0Errors??[],body:document.body?.innerText?.slice(0,2000),electrobun:globalThis.__electrobunWebviewId})})`
          );
        }
      }, 10_000);
    },
    async handle(
      request: Request,
      token: string,
      headers: HeadersInit,
      assetToken: string
    ) {
      const url = new URL(request.url);
      if (!url.pathname.startsWith('/plugin-t0/')) {
        return null;
      }
      try {
        if (url.pathname === '/plugin-t0/config' && request.method === 'GET') {
          await Promise.all(
            mounts.map((mount) => loadPluginDirectory(mount.directory))
          );
          return Response.json(
            {
              entries: mounts.map(
                (mount) =>
                  `${url.origin}${pluginModulePath(assetToken, mount)}app.js`
              ),
              filePath: join(directory, 'roundtrip.txt'),
              networkUrl: 'https://example.com/',
            },
            { headers }
          );
        }
        if (request.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers });
        }
        const value = await request.json();
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error('Expected a JSON object');
        }
        const body = value as Record<string, unknown>;
        if (url.pathname === '/plugin-t0/diagnostics') {
          await writeFile(
            join(directory, 'diagnostics.json'),
            `${JSON.stringify(body, null, 2).replaceAll(token, '<redacted>')}\n`
          );
          return Response.json({ saved: true }, { headers });
        }
        if (url.pathname === '/plugin-t0/net') {
          if (
            typeof body.url !== 'string' ||
            !['http:', 'https:'].includes(new URL(body.url).protocol)
          ) {
            throw new Error('Expected an HTTP(S) URL');
          }
          const response = await fetch(body.url, {
            signal: AbortSignal.timeout(15_000),
          });
          return Response.json(
            {
              status: response.status,
              text: await response.text(),
              url: response.url,
            },
            { headers }
          );
        }
        if (
          url.pathname === '/plugin-t0/files/read' ||
          url.pathname === '/plugin-t0/files/write'
        ) {
          if (typeof body.path !== 'string' || !isAbsolute(body.path)) {
            throw new Error('Expected an absolute file path');
          }
          if (url.pathname.endsWith('/read')) {
            return Response.json(
              { text: await readFile(body.path, 'utf8') },
              { headers }
            );
          }
          if (typeof body.text !== 'string') {
            throw new Error('Expected text');
          }
          await writeFile(body.path, body.text);
          return Response.json(
            { bytes: Buffer.byteLength(body.text) },
            { headers }
          );
        }
        if (url.pathname === '/plugin-t0/cleanup') {
          const { PluginManagementService } = await import('./management');
          const workspace = join(directory, 'app-data', 'workspace');
          const service = new PluginManagementService(workspace);
          const legacy = (await service.list()).find(
            (entry) => entry.pluginId === 't0.legacy'
          );
          const legacyDirectory = join(
            workspace,
            '.ghostboard',
            'plugins',
            'packages',
            't0.legacy',
            '0.1.0',
            'a'.repeat(64)
          );
          let rejected = false;
          try {
            await loadPluginDirectory(legacyDirectory);
          } catch (error) {
            rejected =
              error instanceof PluginDirectoryError &&
              error.code === 'legacy-contract';
          }
          return Response.json(
            {
              rejected,
              listed: legacy?.status === 'legacy' && !legacy.enabled,
              message: legacy?.validationError,
              dataPreserved:
                (await readFile(
                  join(legacyDirectory, 'user-data.json'),
                  'utf8'
                )) === '{"keep":true}\n',
              canvasPreserved:
                (await readFile(
                  join(workspace, 'legacy-canvas-content.json'),
                  'utf8'
                )) === '{"plugin":"t0.legacy","keep":true}\n',
            },
            { headers }
          );
        }
        if (url.pathname === '/plugin-t0/report') {
          const report = {
            ...body,
            host: {
              platform: process.platform,
              arch: process.arch,
              bun: Bun.version,
              execPath: process.execPath,
            },
          };
          await atomicWrite(
            join(directory, 'result.json'),
            `${JSON.stringify(report, null, 2)}\n`
          );
          return Response.json({ saved: true }, { headers });
        }
        return new Response('Not found', { status: 404, headers });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : String(error) },
          { status: 400, headers }
        );
      }
    },
  };
}
