import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';

import { rpcGetLocalHttpEndpoint } from '@/lib/rpc';

import { configureProbeTransport, definePlugin, probeRequest } from './sdk';

async function waitFor(check: () => boolean, label: string) {
  const deadline = Date.now() + 10_000;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out: ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

export async function runT0Probe() {
  const endpoint = await rpcGetLocalHttpEndpoint();
  if (!endpoint) {
    throw new Error('T0 requires the packaged Electrobun application');
  }
  configureProbeTransport(endpoint);
  const checks: Record<string, unknown> = {};
  const report: Record<string, unknown> = {
    stage: 'T0',
    startedAt: new Date().toISOString(),
    page: location.href,
    userAgent: navigator.userAgent,
    checks,
    passed: false,
  };
  const panel = document.createElement('aside');
  panel.id = 'plugin-t0-evidence';
  panel.style.cssText =
    'position:fixed;inset:60px 20px auto auto;width:400px;padding:20px;background:white;color:black;border:2px solid #5252dd;z-index:2147483647;font:14px monospace';
  document.body.append(panel);
  const title = document.createElement('h2');
  title.textContent = 'Trusted plugin T0: running';
  panel.append(title);
  const mount = document.createElement('div');
  panel.append(mount);
  let root: ReturnType<typeof createRoot> | undefined;
  try {
    const config = await probeRequest<{
      entries: [string, string];
      filePath: string;
      networkUrl: string;
    }>('config');
    if (!location.href.startsWith('views://mainview/')) {
      throw new Error('T0 must use views://mainview, not a Vite dev server');
    }
    checks.importMap = HTMLScriptElement.supports('importmap');
    const plain = await import(/* @vite-ignore */ config.entries[0]);
    if (
      plain.definePluginIdentity !== definePlugin ||
      plain.default.label !== 'relative-import-ok'
    ) {
      throw new Error('SDK singleton or relative module import failed');
    }
    checks.localHttpImport = true;
    checks.relativeImport = true;
    checks.sdkSingleton = true;
    checks.sameRealm = plain.documentIdentity === document;
    if (!checks.sameRealm) {
      throw new Error('Plugin did not execute in the host realm');
    }
    checks.plainCommand = plain.default.run();
    if (checks.plainCommand !== 'command-ran') {
      throw new Error('No-build JavaScript command failed');
    }
    const plugin = await import(/* @vite-ignore */ config.entries[1]);
    if (
      plugin.reactIdentity !== React.useState ||
      plugin.reactDomIdentity !== ReactDOM.flushSync ||
      plugin.createRootIdentity !== createRoot
    ) {
      throw new Error('React / ReactDOM instances do not match the host');
    }
    checks.reactSingleton = true;
    checks.reactDomSingleton = true;
    root = createRoot(mount);
    root.render(React.createElement(plugin.Panel));
    await waitFor(
      () => mount.querySelector('button')?.textContent === 'count:0',
      'initial hook render'
    );
    mount.querySelector('button')?.click();
    await waitFor(
      () => mount.querySelector('button')?.textContent === 'count:1',
      'useState update'
    );
    checks.useState = true;
    checks.independentRoot =
      document.querySelector('#root') !== mount &&
      !!document.querySelector('#root')?.childElementCount;
    root.unmount();
    root = undefined;
    if (mount.childElementCount !== 0 || !plugin.wasDisposed()) {
      throw new Error('Root unmount or effect cleanup failed');
    }
    checks.rootUnmount = true;
    checks.effectCleanup = true;
    const io = await plain.default.services(config.filePath, config.networkUrl);
    if (
      io.network.status !== 200 ||
      !io.network.text.includes('Example Domain')
    ) {
      throw new Error('Host HTTPS proxy did not return the expected response');
    }
    if (io.text !== 'GhostBoard T0 file roundtrip ✓') {
      throw new Error('Host file read/write roundtrip failed');
    }
    checks.netFetch = {
      status: io.network.status,
      url: io.network.url,
      bodyMatched: true,
    };
    checks.filesWrite = true;
    checks.filesRead = true;
    checks.hostStillMounted =
      !!document.querySelector('#root')?.childElementCount;
    if (!(checks.independentRoot && checks.hostStillMounted)) {
      throw new Error('Host root was not preserved');
    }
    const legacy = await probeRequest<{
      rejected: boolean;
      listed: boolean;
      message: string;
      dataPreserved: boolean;
      canvasPreserved: boolean;
    }>('cleanup', {});
    checks.legacyContract = legacy;
    if (
      !(
        legacy.rejected &&
        legacy.listed &&
        legacy.dataPreserved &&
        legacy.canvasPreserved
      ) ||
      legacy.message !== '旧契约，需重新安装 v2 版本'
    ) {
      throw new Error(
        'Legacy package rejection, notice, or data preservation failed'
      );
    }
    report.passed = true;
    title.textContent = 'Trusted plugin T0: PASS';
  } catch (error) {
    report.error = (
      error instanceof Error
        ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
        : String(error)
    ).replaceAll(endpoint.token, '<redacted>');
    title.textContent = 'Trusted plugin T0: FAIL';
  } finally {
    root?.unmount();
    report.finishedAt = new Date().toISOString();
    const summary = document.createElement('pre');
    summary.style.cssText =
      'white-space:pre-wrap;max-height:450px;overflow:auto';
    summary.textContent = JSON.stringify(report, null, 2);
    panel.append(summary);
    await probeRequest('report', report);
  }
}
