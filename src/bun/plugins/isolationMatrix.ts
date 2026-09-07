export type IsolationEvidence = 'verified' | 'host-proxy-only' | 'unverified';

export interface PluginIsolationMatrix {
  extraBrowserView: IsolationEvidence;
  hostDom: IsolationEvidence;
  localFiles: IsolationEvidence;
  logicWorkerTerminate: IsolationEvidence;
  nativeBridge: IsolationEvidence;
  network: IsolationEvidence;
  notes: string;
  otherPlugins: IsolationEvidence;
  platform: NodeJS.Platform;
  rendererBundleCEF: false;
  sandboxIframe: IsolationEvidence;
}

export function pluginIsolationMatrix(
  platform: NodeJS.Platform = process.platform
): PluginIsolationMatrix {
  return {
    platform,
    rendererBundleCEF: false,
    logicWorkerTerminate: 'verified',
    sandboxIframe: 'host-proxy-only',
    extraBrowserView: 'unverified',
    hostDom: 'host-proxy-only',
    nativeBridge: 'host-proxy-only',
    localFiles: 'host-proxy-only',
    network: 'host-proxy-only',
    otherPlugins: 'host-proxy-only',
    notes:
      platform === 'darwin'
        ? 'Logic isolation is a Bun worker that tests can terminate. The app ships a single BrowserWindow with bundleCEF false, so iframe/WebView DOM isolation is host-proxy plus renderer sandbox attributes, not a measured extra CEF process. Linux and Windows use the same config and remain unverified on those hosts.'
        : 'Logic worker terminate is verified in this test runtime. Iframe and extra BrowserView isolation are unverified on this platform; Electrobun bundleCEF is false.',
  };
}
