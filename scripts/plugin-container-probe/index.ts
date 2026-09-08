import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserView, BrowserWindow, BuildConfig, Utils } from 'electrobun/bun';
import manifestInput from '../../fixtures/plugins/probe-panel/ghostboard.plugin.json';
import {
  isPluginManifestError,
  parsePluginManifest,
} from '../../src/shared/plugins/manifest';
import {
  createPluginSession,
  createViewContext,
} from '../../src/shared/plugins/session';
import { browserProbe } from './browser';
import { runIsolatedViewChild } from './isolatedViewChild';
import { runIsolatedViewProcess } from './isolatedViewProcess';
import { runBundledQuickJSProbe } from './quickjsBundledProbe';

if (process.env.GHOSTBOARD_PLUGIN_VIEW_CHILD === '1') {
  await runIsolatedViewChild();
  Utils.quit();
} else {
  const directory = await mkdtemp(join(tmpdir(), 'ghostboard-plugin-probe-'));
  const sentinel = join(directory, 'sentinel.txt');
  await writeFile(sentinel, 'probe-only-file');
  const reports: unknown[] = [];
  const hits: string[] = [];
  const canaryCalls: string[] = [];
  const pages = new Map<string, string>();
  const token = crypto.randomUUID();
  const manifest = parsePluginManifest(manifestInput);
  if (isPluginManifestError(manifest)) {
    throw new Error(manifest.message);
  }
  const quickjs = await runBundledQuickJSProbe();
  let finishReport: (() => void) | undefined;
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request, bunServer) {
      const url = new URL(request.url);
      const page = pages.get(url.pathname);
      if (page) {
        return new Response(page, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      if (url.pathname === '/ws') {
        hits.push('/ws-upgrade');
        if (bunServer.upgrade(request)) {
          return;
        }
        return new Response('upgrade failed', { status: 400 });
      }
      if (url.pathname.startsWith('/forbidden/')) {
        hits.push(url.pathname);
        return new Response('probe-only-network', {
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }
      if (url.pathname === `/report/${token}` && request.method === 'POST') {
        reports.push(await request.json());
        finishReport?.();
        return new Response('ok', {
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }
      return new Response('not found', { status: 404 });
    },
    websocket: {
      open(ws) {
        hits.push('/ws-open');
        ws.send('probe-only-ws');
      },
      message() {},
    },
  });

  try {
    const build = await BuildConfig.get();
    const candidates: Array<{
      id: string;
      renderer: 'native' | 'cef';
      registerRpc: boolean;
    }> = [
      { id: 'native-sandbox', renderer: 'native', registerRpc: true },
      { id: 'native-no-rpc', renderer: 'native', registerRpc: false },
      { id: 'iframe-csp', renderer: 'native', registerRpc: true },
    ];
    const cefAvailable = build.availableRenderers.includes('cef');
    if (cefAvailable) {
      candidates.push(
        { id: 'cef-sandbox', renderer: 'cef', registerRpc: true },
        { id: 'cef-no-rpc', renderer: 'cef', registerRpc: false }
      );
    } else {
      reports.push({
        candidate: 'cef-sandbox',
        error: 'cef renderer not packaged; bundleCEF did not expose cef',
      });
    }
    const wsUrl = `${server.url.origin.replace(/^http/u, 'ws')}/ws`;
    for (const candidate of candidates) {
      const config = {
        origin: server.url.origin,
        candidate: candidate.id,
        reportToken: token,
        fileUrl: pathToFileURL(sentinel).href,
        wsUrl,
        sessions: Array.from(
          { length: 2 },
          () =>
            createPluginSession({
              manifest,
              workspaceId: 'ws_container_probe',
              context: createViewContext(),
            }).identity
        ),
      };
      const csp =
        candidate.id === 'iframe-csp'
          ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; connect-src ${server.url.origin}; frame-src 'self'; style-src 'unsafe-inline'">`
          : '';
      const completion = new Promise<void>((resolve) => {
        finishReport = resolve;
      });
      pages.set(
        `/page/${candidate.id}`,
        `<!doctype html>${csp}<h1>P0 container experiment</h1><p id="host-secret">Test host document</p><pre>Running ${candidate.id}…</pre><script>(${browserProbe.toString().replaceAll('</', `<${String.fromCharCode(92)}/`)})(${JSON.stringify(config).replaceAll('<', '\\u003c')});</script>`
      );
      const canaryRpc = BrowserView.defineRPC({
        handlers: {
          requests: {
            containerCanary: () => {
              canaryCalls.push(candidate.id);
              return 'probe-only-canary';
            },
          },
          messages: {},
        },
      });
      let win: InstanceType<typeof BrowserWindow> | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        win = new BrowserWindow({
          ...(candidate.registerRpc ? { rpc: canaryRpc } : {}),
          title: `GhostBoard P0: ${candidate.id}`,
          sandbox: true,
          renderer: candidate.renderer,
          navigationRules: JSON.stringify([
            '^*',
            `${server.url.origin}/page/*`,
          ]),
          frame: { x: 200, y: 180, width: 640, height: 500 },
          url: `${server.url.origin}/page/${candidate.id}`,
        });
        await Promise.race([
          completion,
          new Promise<void>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`${candidate.id} report timeout`)),
              candidate.renderer === 'cef' ? 30_000 : 15_000
            );
          }),
        ]);
      } catch (error) {
        reports.push({ candidate: candidate.id, error: String(error) });
      } finally {
        clearTimeout(timer);
        finishReport = undefined;
        win?.close();
      }
    }
    const isolatedView = await runIsolatedViewProcess({
      fileUrl: pathToFileURL(sentinel).href,
      networkUrl: `${server.url.origin}/forbidden/isolated-view-process`,
      parentReportUrl: `${server.url.origin}/report/${token}`,
      renderer: 'native',
    });
    const isolatedCefView = cefAvailable
      ? await runIsolatedViewProcess({
          fileUrl: pathToFileURL(sentinel).href,
          networkUrl: `${server.url.origin}/forbidden/isolated-cef-view-process`,
          parentReportUrl: `${server.url.origin}/report/${token}`,
          renderer: 'cef',
        })
      : {
          launcher: 'unlaunched',
          parentPid: process.pid,
          reason: 'cef renderer not packaged',
          renderer: 'cef' as const,
          status: 'unavailable' as const,
        };
    const evidence = {
      date: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      parentPid: process.pid,
      bun: Bun.version,
      electrobun: '1.18.1',
      availableRenderers: build.availableRenderers,
      reports,
      networkHits: hits,
      canaryCalls,
      quickjs,
      isolatedView,
      isolatedCefView,
    };
    const output = join(directory, 'results.json');
    await writeFile(output, JSON.stringify(evidence, null, 2));
    console.log('PLUGIN_PROBE_RESULT', output, JSON.stringify(evidence));
  } finally {
    server.stop(true);
    Utils.quit();
  }
}
