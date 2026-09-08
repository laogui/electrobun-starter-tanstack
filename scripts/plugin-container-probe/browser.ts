// Serialized into the trusted outer document by the isolated desktop probe.
// This is an experiment, not a public plugin loader or an SDK contract.
export async function browserProbe(config: {
  origin: string;
  reportToken: string;
  candidate: string;
  fileUrl: string;
  wsUrl: string;
  sessions: Array<{ nonce: string; sessionId: string }>;
}) {
  const results: Record<string, unknown> = {};
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
  const inspectBridges = () => {
    const handlers = pageWindow.webkit?.messageHandlers;
    const hostObjects = pageWindow.chrome?.webview?.hostObjects;
    return {
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
    };
  };
  const sendCanary = () => {
    const payload = JSON.stringify({
      type: 'request',
      id: 98_765,
      method: 'containerCanary',
      params: {},
    });
    const channels: [string, BridgeTarget | undefined][] = [
      ['webkit.bunBridge', pageWindow.webkit?.messageHandlers?.bunBridge],
      ['__electrobunBunBridge', pageWindow.__electrobunBunBridge],
      ['window.bunBridge', pageWindow.bunBridge],
      ['chrome.bunBridge', pageWindow.chrome?.webview?.hostObjects?.bunBridge],
    ];
    const sent: string[] = [];
    for (const [name, target] of channels) {
      try {
        if (typeof target?.postMessage === 'function') {
          target.postMessage(payload);
          sent.push(name);
        }
      } catch {
        sent.push(`${name}:threw`);
      }
    }
    return sent;
  };
  const probeResources = async () => {
    try {
      await fetch(`${config.origin}/forbidden/${config.candidate}-fetch`);
      results.network = true;
    } catch {
      results.network = false;
    }
    try {
      results.localFile = (await (await fetch(config.fileUrl)).text()).includes(
        'probe-only-file'
      );
    } catch {
      results.localFile = false;
    }
    try {
      localStorage.setItem(`probe-${config.candidate}`, 'value');
      results.storage = true;
    } catch {
      results.storage = false;
    }
    try {
      results.websocket = await new Promise<boolean>((resolve) => {
        const socket = new WebSocket(config.wsUrl);
        const timer = setTimeout(() => {
          socket.close();
          resolve(false);
        }, 2000);
        socket.addEventListener('open', () => {
          clearTimeout(timer);
          socket.close();
          resolve(true);
        });
        socket.addEventListener('error', () => {
          clearTimeout(timer);
          resolve(false);
        });
      });
    } catch {
      results.websocket = false;
    }
    try {
      const worker = new Worker(
        URL.createObjectURL(
          new Blob(['postMessage(1)'], { type: 'text/javascript' })
        )
      );
      results.worker = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          worker.terminate();
          resolve(false);
        }, 1000);
        worker.onmessage = () => {
          clearTimeout(timer);
          worker.terminate();
          resolve(true);
        };
        worker.onerror = () => {
          clearTimeout(timer);
          worker.terminate();
          resolve(false);
        };
      });
    } catch {
      results.worker = false;
    }
    try {
      const frame = document.createElement('iframe');
      frame.src = `${config.origin}/forbidden/${config.candidate}-nav`;
      document.body.append(frame);
      results.navigationIframe = await new Promise<string>((resolve) => {
        const timer = setTimeout(() => resolve('timeout'), 1500);
        frame.addEventListener('load', () => {
          clearTimeout(timer);
          resolve('loaded');
        });
        frame.addEventListener('error', () => {
          clearTimeout(timer);
          resolve('error');
        });
      });
    } catch {
      results.navigationIframe = 'threw';
    }
  };
  const report = async () => {
    document.querySelector('pre')!.textContent = JSON.stringify(
      results,
      null,
      2
    );
    await fetch(`${config.origin}/report/${config.reportToken}`, {
      method: 'POST',
      body: JSON.stringify({ candidate: config.candidate, results }),
    });
  };
  // The child receives only test URLs and a session handshake, never the report token.
  const childSource = (origin: string, fileUrl: string) => `
    async function check() {
      const result = {};
      try { result.parentDom = !!parent.document.getElementById('host-secret'); }
      catch { result.parentDom = false; }
      result.bridgeDetails = { rpc: typeof window.__electrobun, bun: typeof window.__electrobunBunBridge, rawBun: typeof window.webkit?.messageHandlers?.bunBridge?.postMessage, internal: typeof window.webkit?.messageHandlers?.internalBridge?.postMessage };
      result.nativeRpc = typeof window.__electrobun !== 'undefined' ||
        typeof window.__electrobunBunBridge !== 'undefined' ||
        !!window.webkit?.messageHandlers?.bunBridge;
      try { window.webkit?.messageHandlers?.bunBridge?.postMessage(JSON.stringify({ type: 'request', id: 98765, method: 'containerCanary', params: {} })); result.canarySent = true; }
      catch { result.canarySent = false; }
      try { await fetch(${JSON.stringify(`${origin}/forbidden/fetch`)}); result.network = true; }
      catch { result.network = false; }
      try { result.localFile = (await (await fetch(${JSON.stringify(fileUrl)})).text()).includes('probe-only-file'); }
      catch { result.localFile = false; }
      try { localStorage.setItem('probe', 'value'); result.storage = true; }
      catch { result.storage = false; }
      return result;
    }
    addEventListener('message', async (event) => {
      if (event.source !== parent || event.data?.type !== 'handshake') return;
      const { nonce, sessionId } = event.data;
      parent.postMessage({ type: 'response', nonce: 'forged', sessionId, result: {} }, '*');
      parent.postMessage({ type: 'response', nonce, sessionId, result: await check() }, '*');
    });
  `;

  const viewCandidates = new Set([
    'native-sandbox',
    'native-no-rpc',
    'cef-sandbox',
    'cef-no-rpc',
  ]);
  if (viewCandidates.has(config.candidate)) {
    results.bridgeDetails = inspectBridges();
    results.nativeRpc = typeof pageWindow.__electrobun !== 'undefined';
    if (config.candidate !== 'native-sandbox') {
      const channels = sendCanary();
      results.canaryChannels = channels;
      results.canarySent = channels.some((name) => !name.endsWith(':threw'));
      if (config.candidate.startsWith('cef')) {
        let floodSent = 0;
        for (let index = 0; index < 20; index++) {
          if (sendCanary().some((name) => !name.endsWith(':threw'))) {
            floodSent++;
          }
        }
        results.canaryFloodSent = floodSent;
      }
    }
    await probeResources();
    await report();
    return;
  }

  let active:
    | { frame: HTMLIFrameElement; nonce: string; sessionId: string }
    | undefined;
  let rejected = 0;
  let accepted = 0;
  let deliver: ((value: unknown) => void) | undefined;
  const receive = (event: MessageEvent) => {
    if (
      !active ||
      event.source !== active.frame.contentWindow ||
      event.data?.nonce !== active.nonce ||
      event.data?.sessionId !== active.sessionId
    ) {
      rejected++;
      return;
    }
    if (event.data.type === 'response') {
      accepted++;
      deliver?.(event.data.result);
    }
  };
  window.addEventListener('message', receive);
  const open = () =>
    new Promise<unknown>((resolve, reject) => {
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.style.cssText = 'width:100%;height:120px;border:1px solid #ccc';
      const session = config.sessions.shift();
      if (!session) {
        reject(new Error('missing host-issued session'));
        return;
      }
      const { nonce, sessionId } = session;
      active = { frame, nonce, sessionId };
      const timer = setTimeout(
        () => reject(new Error('panel handshake timed out')),
        5000
      );
      deliver = (result) => {
        clearTimeout(timer);
        resolve(result);
      };
      frame.onload = () =>
        frame.contentWindow?.postMessage(
          { type: 'handshake', nonce, sessionId },
          '*'
        );
      frame.srcdoc =
        "<!doctype html><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'\"><p>Sandbox panel / 沙箱面板</p><input placeholder=\"中文输入法待人工验收\"><script>" +
        childSource(config.origin, config.fileUrl) +
        '</script>';
      document.body.append(frame);
    });
  try {
    results.first = await open();
    const previous = active!;
    const oldSource = previous.frame.contentWindow;
    previous.frame.remove();
    active = undefined;
    results.second = await open();
    const before = accepted;
    // Synthetic old-source envelope: WebKit rejects detached WindowProxy in MessageEvent constructors.
    receive({
      source: oldSource,
      data: {
        type: 'response',
        nonce: previous.nonce,
        sessionId: previous.sessionId,
        result: {},
      },
    } as MessageEvent);
    results.staleSourceRejected = accepted === before;
    results.sessionChanged = active!.sessionId !== previous.sessionId;
    results.rejected = rejected;
    results.accepted = accepted;
    results.parentResponsive = true;
  } catch (error) {
    results.error = String(error);
  } finally {
    active?.frame.remove();
    active = undefined;
    window.removeEventListener('message', receive);
  }
  await report();
}
