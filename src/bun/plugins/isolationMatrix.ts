export type IsolationEvidence = 'verified' | 'host-proxy-only' | 'unverified';

export interface PluginIsolationMatrix {
  extraBrowserView: IsolationEvidence;
  hostDom: IsolationEvidence;
  localFiles: IsolationEvidence;
  logicQuickJS: IsolationEvidence;
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
    // Configuration is not per-platform execution evidence. Verification is
    // recorded by an actual test run with its runtime and platform versions.
    logicQuickJS: 'unverified',
    sandboxIframe: 'unverified',
    extraBrowserView: 'unverified',
    hostDom: 'unverified',
    nativeBridge: 'host-proxy-only',
    localFiles: 'host-proxy-only',
    network: 'host-proxy-only',
    otherPlugins: 'host-proxy-only',
    notes:
      'Static capability inventory only. Command tests exercise termination in their test runtime; they do not establish Bun/Electrobun or cross-platform isolation. No real panel container has been verified. Host-proxy checks do not prove direct file, network, or native access is blocked. A separate probe app bundled CEF Chromium 147 on macOS and failed native-bridge and network canaries; GhostBoard itself remains bundleCEF: false. A separate macOS WKWebView helper with zero script message handlers had no bunBridge; App Sandbox without network.client killed WebContent; WKContentRuleList block-all passed loopback fetch/WebSocket canaries as host policy; the same helper recovered after an infinite JS loop and a 64MiB allocation by destroying the WKWebView, and the orchestrator recovered by SIGTERM plus a new process. It is not wired into GhostBoard. Command and panel packages were also loaded from an out-of-repo sample directory without host imports or invented instanceId; title-only applyBatch writes JSON sidecar notes and bumps revision; canvas selection can project those titles onto nodes and folder children, but no product-window RPC or public install exists. Record actual runtime, platform, and test results separately.',
  };
}
