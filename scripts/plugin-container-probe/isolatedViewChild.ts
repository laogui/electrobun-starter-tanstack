import { BrowserWindow, BuildConfig, Utils } from 'electrobun/bun';

const CHILD_TIMEOUT_MS = 15_000;
const CEF_CHILD_TIMEOUT_MS = 30_000;

interface IsolatedViewPageConfig {
  fileUrl: string;
  networkUrl: string;
  renderer: 'native' | 'cef';
  reportUrl: string;
}

interface IsolatedViewPageReport {
  bridgeDetails: {
    bun: string;
    cefQuery: string;
    chromeBun: string;
    event: string;
    eventHandler: string;
    internal: string;
    rawBun: string;
    rpc: string;
    userAgent: string;
    windowBun: string;
    windowEvent: string;
    windowInternal: string;
  };
  canaryChannels: string[];
  canarySent: boolean;
  fileUrl: boolean;
  network: boolean;
  opener: boolean;
  parentWindow: boolean;
  renderer: 'native' | 'cef';
  storage: boolean;
}

/**
 * This function is serialized into the child WebView. It only reports
 * browser-visible capabilities to the child process; the child process
 * forwards the report to the parent probe over a one-shot local endpoint.
 */
async function isolatedViewPage(config: IsolatedViewPageConfig) {
  interface BridgeTarget {
    postMessage?: (message: unknown) => void;
  }
  const pageWindow = window as unknown as {
    bunBridge?: BridgeTarget;
    cefQuery?: unknown;
    chrome?: { webview?: { hostObjects?: Record<string, BridgeTarget> } };
    eventBridge?: BridgeTarget;
    internalBridge?: BridgeTarget;
    webkit?: { messageHandlers?: Record<string, BridgeTarget> };
    __electrobun?: unknown;
    __electrobunBunBridge?: BridgeTarget;
    __electrobunEventBridge?: BridgeTarget;
  };
  const handlers = pageWindow.webkit?.messageHandlers;
  const hostObjects = pageWindow.chrome?.webview?.hostObjects;
  const results: IsolatedViewPageReport = {
    bridgeDetails: {
      rpc: typeof pageWindow.__electrobun,
      bun: typeof pageWindow.__electrobunBunBridge,
      event: typeof pageWindow.__electrobunEventBridge,
      rawBun: typeof handlers?.bunBridge?.postMessage,
      internal: typeof handlers?.internalBridge?.postMessage,
      eventHandler: typeof handlers?.eventBridge?.postMessage,
      windowBun: typeof pageWindow.bunBridge?.postMessage,
      windowInternal: typeof pageWindow.internalBridge?.postMessage,
      windowEvent: typeof pageWindow.eventBridge?.postMessage,
      chromeBun: typeof hostObjects?.bunBridge?.postMessage,
      cefQuery: typeof pageWindow.cefQuery,
      userAgent: navigator.userAgent,
    },
    canaryChannels: [],
    canarySent: false,
    fileUrl: false,
    network: false,
    opener: window.opener !== null,
    parentWindow: window.parent !== window,
    renderer: config.renderer,
    storage: false,
  };

  const payload = JSON.stringify({
    type: 'request',
    id: 98_766,
    method: 'containerCanary',
    params: {},
  });
  const channels: [string, BridgeTarget | undefined][] = [
    ['webkit.bunBridge', handlers?.bunBridge],
    ['__electrobunBunBridge', pageWindow.__electrobunBunBridge],
    ['window.bunBridge', pageWindow.bunBridge],
    ['chrome.bunBridge', hostObjects?.bunBridge],
  ];
  for (const [name, target] of channels) {
    try {
      if (typeof target?.postMessage === 'function') {
        target.postMessage(payload);
        results.canaryChannels.push(name);
      }
    } catch {
      results.canaryChannels.push(`${name}:threw`);
    }
  }
  results.canarySent = results.canaryChannels.some(
    (name) => !name.endsWith(':threw')
  );
  try {
    await fetch(config.networkUrl);
    results.network = true;
  } catch {
    results.network = false;
  }
  try {
    results.fileUrl = (await (await fetch(config.fileUrl)).text()).includes(
      'probe-only-file'
    );
  } catch {
    results.fileUrl = false;
  }
  try {
    localStorage.setItem('isolated-view-probe', 'value');
    results.storage = true;
  } catch {
    results.storage = false;
  }

  await fetch(config.reportUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(results),
  });
}

function pageHTML(config: IsolatedViewPageConfig): string {
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; connect-src ${new URL(config.reportUrl).origin} ${new URL(config.networkUrl).origin}; style-src 'unsafe-inline'; img-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'">`;
  const source = isolatedViewPage
    .toString()
    .replaceAll('</', `<${String.fromCharCode(92)}/`);
  return `<!doctype html>${csp}<h1>Isolated plugin view process</h1><pre>Running…</pre><script>(${source})(${JSON.stringify(config).replaceAll('<', '\\u003c')}).catch(() => {});</script>`;
}

/**
 * Run the view candidate in a separate Electrobun launcher process.
 *
 * The child has no application RPC schema. Its only parent communication is
 * a one-shot HTTP report sent by a local server owned by this probe. This is
 * an experiment for process and lifecycle evidence, not a production loader.
 */
export async function runIsolatedViewChild(): Promise<void> {
  const reportUrl = process.env.GHOSTBOARD_PLUGIN_PARENT_REPORT_URL ?? '';
  const networkUrl = process.env.GHOSTBOARD_PLUGIN_NETWORK_URL ?? '';
  const fileUrl = process.env.GHOSTBOARD_PLUGIN_FILE_URL ?? '';
  const renderer =
    process.env.GHOSTBOARD_PLUGIN_VIEW_RENDERER === 'cef' ? 'cef' : 'native';
  const build = await BuildConfig.get();
  if (renderer === 'cef' && !build.availableRenderers.includes('cef')) {
    console.error(
      'ISOLATED_VIEW_CHILD_RESULT',
      JSON.stringify({
        error: 'cef renderer not packaged',
        pid: process.pid,
      })
    );
    Utils.quit();
    return;
  }
  if ([reportUrl, networkUrl, fileUrl].some((value) => !value)) {
    console.error(
      'ISOLATED_VIEW_CHILD_RESULT',
      JSON.stringify({
        error: 'missing child probe configuration',
        pid: process.pid,
      })
    );
    return;
  }

  let resolveReport: ((report: IsolatedViewPageReport) => void) | undefined;
  const report = new Promise<IsolatedViewPageReport>((resolve) => {
    resolveReport = resolve;
  });
  let childOrigin = '';
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === '/report' && request.method === 'POST') {
        try {
          const result = (await request.json()) as IsolatedViewPageReport;
          await fetch(reportUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              candidate:
                renderer === 'cef'
                  ? 'isolated-cef-view-process'
                  : 'isolated-view-process',
              childPid: process.pid,
              childParentPid: process.ppid,
              results: result,
            }),
          });
          resolveReport?.(result);
          return new Response('ok');
        } catch {
          return new Response('invalid report', { status: 400 });
        }
      }
      return new Response(
        pageHTML({
          fileUrl,
          networkUrl,
          renderer,
          reportUrl: `${childOrigin}/report`,
        }),
        {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      );
    },
  });
  childOrigin = server.url.origin;

  const window = new BrowserWindow({
    title: `GhostBoard P0: isolated-${renderer}-view-process`,
    sandbox: true,
    renderer,
    navigationRules: JSON.stringify(['^*', `${server.url.origin}/*`]),
    frame: { x: 240, y: 220, width: 640, height: 420 },
    url: server.url.origin,
  });
  let result: IsolatedViewPageReport | { error: string };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    result = await Promise.race([
      report,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('isolated view report timed out')),
          renderer === 'cef' ? CEF_CHILD_TIMEOUT_MS : CHILD_TIMEOUT_MS
        );
      }),
    ]);
  } catch (error) {
    result = { error: String(error) };
  } finally {
    clearTimeout(timer);
    window.close();
    server.stop(true);
  }

  console.log(
    'ISOLATED_VIEW_CHILD_RESULT',
    JSON.stringify({
      childPid: process.pid,
      parentPid: process.ppid,
      result,
    })
  );
  Utils.quit();
}
