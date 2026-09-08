// Serialized into the OS-level WKWebView helper. Experiment only: not a
// public plugin loader and not an Electrobun RPC schema.

export async function osWebViewPage(config: {
  candidate: string;
  fileUrl: string;
  origin: string;
  wsUrl: string;
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
  const knownHandlerNames = [
    'bunBridge',
    'internalBridge',
    'eventBridge',
    'electrobun',
    'ghostboard',
    'host',
  ];
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
      webkit: typeof pageWindow.webkit,
      messageHandlers: typeof handlers,
      userAgent: navigator.userAgent,
    };
  };
  const listHandlerNames = () => {
    const handlers = pageWindow.webkit?.messageHandlers;
    const names = new Set<string>();
    if (!handlers) {
      return [] as string[];
    }
    for (const name of Object.getOwnPropertyNames(handlers)) {
      names.add(name);
    }
    for (const name of knownHandlerNames) {
      try {
        if (handlers[name]) {
          names.add(name);
        }
      } catch {
        names.add(`${name}:threw`);
      }
    }
    return [...names];
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
  const publish = () => {
    (
      window as unknown as { __PROBE_RESULT_JSON__?: string }
    ).__PROBE_RESULT_JSON__ = JSON.stringify(results);
    const pre = document.querySelector('pre');
    if (pre) {
      pre.textContent = JSON.stringify(results, null, 2);
    }
  };

  results.bridgeDetails = inspectBridges();
  results.messageHandlerNames = listHandlerNames();
  const channels = sendCanary();
  results.canaryChannels = channels;
  results.canarySent = channels.some((name) => !name.endsWith(':threw'));

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
  try {
    const popup = window.open(
      `${config.origin}/forbidden/${config.candidate}-popup`
    );
    results.popup = Boolean(popup);
    popup?.close();
  } catch {
    results.popup = false;
  }
  publish();
}
