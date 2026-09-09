import { chmod, copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { osWebViewPage } from './osWebViewPage';

export const ROOT = dirname(fileURLToPath(import.meta.url));
const HELPER_SOURCE = join(ROOT, 'os-webview-helper', 'main.swift');
export const ARTIFACTS = join(ROOT, 'artifacts', 'os-webview-helper');
export const RESULT_MARKER = /^OS_WEBVIEW_HELPER_RESULT\s+(\{.*\})$/mu;
const HELPER_TIMEOUT_MS = 20_000;
const ELECTROBUN_LIBRARY =
  /electrobun|libNativeWrapper|Chromium Embedded Framework/i;
const HTTP_SCHEME = /^http/u;

type CandidateId =
  | 'os-webview-unsandboxed'
  | 'os-webview-sandbox-network'
  | 'os-webview-sandbox-network-resource'
  | 'os-webview-sandbox-no-network'
  | 'os-webview-sandbox-no-network-jit'
  | 'os-webview-sandbox-blocklist'
  | 'os-webview-sandbox-blocklist-resource';

interface CandidateSpec {
  blockNetwork?: boolean;
  bundleId: string;
  entitlements: string;
  expectNetworkBlocked: boolean;
  expectSandbox: boolean;
  hardenedRuntime?: boolean;
  id: CandidateId;
  resourceScheme?: boolean;
}

export interface HelperPayload {
  candidate?: string;
  contentRuleCompiled?: boolean;
  deniedNavigations?: string[];
  home?: string;
  loadError?: string | null;
  macos?: string;
  pageResult?: Record<string, unknown> | null;
  parentPid?: number;
  pid?: number;
  reason?: string;
  registeredMessageHandlers?: string[];
  sandboxContainerId?: string | null;
  tmp?: string;
}

interface CandidateEvidence {
  appPath: string;
  codesign: string;
  entitlementsDump: string;
  exitCode: number | null;
  helper: HelperPayload | null;
  id: CandidateId;
  linkedLibraries: string[];
  networkHits: string[];
  reason?: string;
  sandboxApplied: boolean;
  status: 'completed' | 'failed' | 'timeout' | 'unavailable';
  stderr: string;
  stdout: string;
  stunPackets: number;
  verdict: {
    bridge: 'fail' | 'pass';
    network: 'fail' | 'inconclusive' | 'pass';
    overall: 'fail' | 'inconclusive' | 'pass';
    resources: 'fail' | 'n/a' | 'pass';
    sandbox: 'fail' | 'n/a' | 'pass';
  };
}

const CANDIDATES: CandidateSpec[] = [
  {
    id: 'os-webview-unsandboxed',
    bundleId: 'com.ghostboard.plugin-probe.os-webview',
    entitlements: join(ROOT, 'os-webview-helper', 'unsandboxed.entitlements'),
    expectSandbox: false,
    expectNetworkBlocked: false,
  },
  {
    id: 'os-webview-sandbox-network',
    bundleId: 'com.ghostboard.plugin-probe.os-webview-sandbox-network',
    entitlements: join(
      ROOT,
      'os-webview-helper',
      'sandbox-network.entitlements'
    ),
    expectSandbox: true,
    expectNetworkBlocked: false,
  },
  {
    id: 'os-webview-sandbox-network-resource',
    bundleId: 'com.ghostboard.plugin-probe.os-webview-sandbox-network-resource',
    entitlements: join(
      ROOT,
      'os-webview-helper',
      'sandbox-network.entitlements'
    ),
    expectSandbox: true,
    expectNetworkBlocked: false,
    resourceScheme: true,
  },
  {
    id: 'os-webview-sandbox-no-network',
    bundleId: 'com.ghostboard.plugin-probe.os-webview-sandbox-no-network',
    entitlements: join(
      ROOT,
      'os-webview-helper',
      'sandbox-no-network.entitlements'
    ),
    expectSandbox: true,
    expectNetworkBlocked: true,
  },
  {
    id: 'os-webview-sandbox-no-network-jit',
    bundleId: 'com.ghostboard.plugin-probe.os-webview-sandbox-no-network-jit',
    entitlements: join(
      ROOT,
      'os-webview-helper',
      'sandbox-no-network-jit.entitlements'
    ),
    expectSandbox: true,
    expectNetworkBlocked: true,
    hardenedRuntime: false,
  },
  {
    id: 'os-webview-sandbox-blocklist',
    bundleId: 'com.ghostboard.plugin-probe.os-webview-sandbox-blocklist',
    entitlements: join(
      ROOT,
      'os-webview-helper',
      'sandbox-network.entitlements'
    ),
    expectSandbox: true,
    expectNetworkBlocked: true,
    blockNetwork: true,
  },
  {
    id: 'os-webview-sandbox-blocklist-resource',
    bundleId:
      'com.ghostboard.plugin-probe.os-webview-sandbox-blocklist-resource',
    entitlements: join(
      ROOT,
      'os-webview-helper',
      'sandbox-network.entitlements'
    ),
    expectSandbox: true,
    expectNetworkBlocked: true,
    blockNetwork: true,
    resourceScheme: true,
  },
];

function infoPlist(bundleId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>OsWebViewHelper</string>
  <key>CFBundleIdentifier</key>
  <string>${bundleId}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>GhostBoardOsWebViewHelper</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.0.1</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
  </dict>
</dict>
</plist>
`;
}

export function pageHtml(config: {
  candidate: string;
  fileUrl: string;
  origin: string;
  stunUrl?: string;
  wsUrl: string;
}): string {
  const source = osWebViewPage
    .toString()
    .replaceAll('</', `<${String.fromCharCode(92)}/`);
  const payload = JSON.stringify(config).replaceAll('<', '\\u003c');
  return `<!doctype html><meta charset="utf-8"><title>OS WebView probe</title><h1>OS-level WKWebView probe</h1><pre>running…</pre><script>(${source})(${payload});</script>`;
}

function resourcePageConfig(config: {
  candidate: string;
  fileUrl: string;
  origin: string;
  stunUrl?: string;
  wsUrl: string;
}): {
  entry: string;
  index: string;
  module: string;
  style: string;
} {
  const source = osWebViewPage
    .toString()
    .replaceAll('</', `<${String.fromCharCode(92)}/`);
  const payload = JSON.stringify(config).replaceAll('<', '\\u003c');
  return {
    index: `<!doctype html><meta charset="utf-8"><title>Plugin resource probe</title><link rel="stylesheet" href="./resource.css"><div id="resource-scheme-probe">resource probe</div><pre>running…</pre><script>window.__OS_PROBE_CONFIG__=${payload};</script><script type="module" src="./entry.js"></script>`,
    entry: `import { marker } from './nested/resource-module.js'; window.__RESOURCE_MODULE_MARKER__ = marker; ${source}; osWebViewPage(window.__OS_PROBE_CONFIG__);`,
    module: `export const marker = 'relative-module-loaded';`,
    style: '#resource-scheme-probe { --ghostboard-resource-style: loaded; }',
  };
}

async function runCommand(
  argv: string[],
  options?: { cwd?: string; timeoutMs?: number }
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const child = Bun.spawn(argv, {
    cwd: options?.cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
  });
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const exitCode = await Promise.race([
    child.exited,
    new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        resolve(null);
      }, options?.timeoutMs ?? 60_000);
    }),
  ]);
  clearTimeout(timer);
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (timedOut || exitCode === null) {
    return { exitCode: 124, stdout, stderr: `${stderr}\ntimed out`.trim() };
  }
  return { exitCode, stdout, stderr };
}

export async function compileHelper(binary: string): Promise<void> {
  await mkdir(dirname(binary), { recursive: true });
  const result = await runCommand(
    [
      'swiftc',
      '-parse-as-library',
      '-O',
      '-target',
      'arm64-apple-macosx13.0',
      '-o',
      binary,
      HELPER_SOURCE,
      '-framework',
      'AppKit',
      '-framework',
      'WebKit',
    ],
    { timeoutMs: 120_000 }
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `swiftc failed (${result.exitCode}): ${result.stderr || result.stdout}`
    );
  }
}

export async function assembleSignedApp(input: {
  appPath: string;
  binary: string;
  bundleId: string;
  entitlements: string;
  hardenedRuntime?: boolean;
}): Promise<{ codesign: string; entitlementsDump: string }> {
  const contents = join(input.appPath, 'Contents');
  const macos = join(contents, 'MacOS');
  const executable = join(macos, 'OsWebViewHelper');
  await mkdir(macos, { recursive: true });
  await mkdir(join(contents, 'Resources'), { recursive: true });
  await copyFile(input.binary, executable);
  await chmod(executable, 0o755);
  await writeFile(join(contents, 'Info.plist'), infoPlist(input.bundleId));
  const signArgs = [
    'codesign',
    '--force',
    '--sign',
    '-',
    '--entitlements',
    input.entitlements,
    '--identifier',
    input.bundleId,
    '--timestamp=none',
  ];
  if (input.hardenedRuntime !== false) {
    signArgs.push('--options', 'runtime');
  }
  const signBinary = await runCommand([...signArgs, executable]);
  if (signBinary.exitCode !== 0) {
    throw new Error(`codesign binary failed: ${signBinary.stderr}`);
  }
  const signApp = await runCommand([...signArgs, input.appPath]);
  if (signApp.exitCode !== 0) {
    throw new Error(`codesign app failed: ${signApp.stderr}`);
  }
  const verify = await runCommand([
    'codesign',
    '--verify',
    '--verbose',
    input.appPath,
  ]);
  const entitlements = await runCommand([
    'codesign',
    '-d',
    '--entitlements',
    '-',
    input.appPath,
  ]);
  return {
    codesign: `${verify.stderr}\n${verify.stdout}`.trim(),
    entitlementsDump: `${entitlements.stderr}\n${entitlements.stdout}`.trim(),
  };
}

async function linkedLibraries(binary: string): Promise<string[]> {
  const result = await runCommand(['otool', '-L', binary]);
  return result.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseHelperPayload(stdout: string): HelperPayload | null {
  const match = RESULT_MARKER.exec(stdout);
  if (!match?.[1]) {
    return null;
  }
  try {
    return JSON.parse(match[1]) as HelperPayload;
  } catch {
    return null;
  }
}

export function bridgeFailed(
  page: Record<string, unknown> | null | undefined
): boolean {
  const details = (page?.bridgeDetails ?? {}) as Record<string, unknown>;
  const names = Array.isArray(page?.messageHandlerNames)
    ? (page.messageHandlerNames as string[])
    : [];
  const channels = Array.isArray(page?.canaryChannels)
    ? (page.canaryChannels as string[])
    : [];
  const injected =
    details.rawBun === 'function' ||
    details.internal === 'function' ||
    details.eventHandler === 'function' ||
    details.bun === 'object' ||
    details.event === 'object' ||
    details.windowBun === 'function' ||
    details.chromeBun === 'function' ||
    details.rpc === 'object';
  const named = names.some(
    (name) =>
      name === 'bunBridge' ||
      name === 'internalBridge' ||
      name === 'eventBridge' ||
      name.includes('electrobun')
  );
  return Boolean(page?.canarySent) || injected || named || channels.length > 0;
}

function relativeResourcesLoaded(
  page: Record<string, unknown> | null | undefined
): boolean {
  return (
    page?.protocol === 'ghostboard-plugin:' &&
    page.relativeModule === true &&
    page.relativeStyle === true
  );
}

function sandboxApplied(helper: HelperPayload | null): boolean {
  if (!helper) {
    return false;
  }
  if (
    typeof helper.sandboxContainerId === 'string' &&
    helper.sandboxContainerId.length > 0
  ) {
    return true;
  }
  return (
    typeof helper.home === 'string' &&
    helper.home.includes('/Library/Containers/')
  );
}

function verdictFor(
  spec: CandidateSpec,
  helper: HelperPayload | null,
  networkHits: string[],
  stunPackets: number,
  status: CandidateEvidence['status']
): CandidateEvidence['verdict'] {
  if (status !== 'completed' || !helper?.pageResult) {
    return {
      bridge: 'fail',
      network: 'fail',
      resources: spec.resourceScheme ? 'fail' : 'n/a',
      sandbox: spec.expectSandbox ? 'fail' : 'n/a',
      overall: 'inconclusive',
    };
  }
  const page = helper.pageResult;
  const bridge = bridgeFailed(page) ? 'fail' : 'pass';
  const sawNetwork =
    networkHits.length > 0 ||
    page.network === true ||
    page.websocket === true ||
    stunPackets > 0;
  // A loopback STUN sink sees actual WebRTC UDP packets. When it receives
  // none, exposed WebRTC remains inconclusive instead of becoming a pass.
  const network = sawNetwork
    ? 'fail'
    : page.webrtcAvailable === true
      ? 'inconclusive'
      : 'pass';
  const resources = spec.resourceScheme
    ? relativeResourcesLoaded(page)
      ? 'pass'
      : 'fail'
    : 'n/a';
  const sandbox = spec.expectSandbox
    ? sandboxApplied(helper)
      ? 'pass'
      : 'fail'
    : 'n/a';
  // Unsandboxed / sandbox-with-network runs are controls. They fail the
  // container gate when they can reach loopback; if they cannot, the canary
  // itself is inconclusive rather than a network-isolation pass.
  let overall: CandidateEvidence['verdict']['overall'] = 'fail';
  if (spec.expectNetworkBlocked) {
    if (network === 'inconclusive') {
      overall = 'inconclusive';
    } else {
      overall =
        bridge === 'pass' &&
        network === 'pass' &&
        resources !== 'fail' &&
        sandbox === 'pass'
          ? 'pass'
          : 'fail';
    }
  } else if (!sawNetwork) {
    overall = 'inconclusive';
  }
  return { bridge, network, resources, sandbox, overall };
}

export async function runHelper(input: {
  appPath: string;
  config: Record<string, unknown>;
  timeoutMs: number;
}): Promise<{
  exitCode: number | null;
  helper: HelperPayload | null;
  stderr: string;
  stdout: string;
  timedOut: boolean;
}> {
  const executable = join(
    input.appPath,
    'Contents',
    'MacOS',
    'OsWebViewHelper'
  );
  const child = Bun.spawn([executable], {
    cwd: dirname(executable),
    stdin: Response.json(input.config),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const exitCode = await Promise.race([
    child.exited,
    new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 1000);
        resolve(null);
      }, input.timeoutMs);
    }),
  ]);
  clearTimeout(timer);
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return {
    exitCode,
    helper: parseHelperPayload(stdout),
    stderr: stderr.trim().slice(-4000),
    stdout: stdout.trim().slice(-4000),
    timedOut,
  };
}

export async function runOsViewProbe(): Promise<{
  bun: string;
  candidates: CandidateEvidence[];
  date: string;
  electrobunLinked: boolean;
  parentPid: number;
  platform: NodeJS.Platform;
  swiftc: string;
}> {
  if (process.platform !== 'darwin') {
    return {
      date: new Date().toISOString(),
      platform: process.platform,
      parentPid: process.pid,
      bun: Bun.version,
      swiftc: 'unavailable',
      electrobunLinked: false,
      candidates: CANDIDATES.map((spec) => ({
        id: spec.id,
        appPath: '',
        status: 'unavailable',
        reason: 'OS-level WKWebView helper is implemented for macOS only',
        exitCode: null,
        stdout: '',
        stderr: '',
        codesign: '',
        entitlementsDump: '',
        linkedLibraries: [],
        networkHits: [],
        stunPackets: 0,
        helper: null,
        sandboxApplied: false,
        verdict: {
          bridge: 'fail',
          network: 'fail',
          resources: spec.resourceScheme ? 'fail' : 'n/a',
          sandbox: spec.expectSandbox ? 'fail' : 'n/a',
          overall: 'inconclusive',
        },
      })),
    };
  }

  const directory = await mkdtemp(join(tmpdir(), 'ghostboard-os-webview-'));
  const sentinel = join(directory, 'sentinel.txt');
  await writeFile(sentinel, 'probe-only-file');
  const hits: string[] = [];
  const stunPackets: null[] = [];
  const stunServer = await Bun.udpSocket({
    hostname: '127.0.0.1',
    port: 0,
    socket: {
      data() {
        // Receipt is enough: the sink does not reply, inspect packet bytes, or
        // retain source addresses. It only proves a direct UDP egress attempt.
        stunPackets.push(null);
      },
    },
  });
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request, bunServer) {
      const url = new URL(request.url);
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

  const binary = join(ARTIFACTS, 'OsWebViewHelper');
  const swiftc = await runCommand(['swiftc', '-version']);
  await compileHelper(binary);
  const libraries = await linkedLibraries(binary);
  const electrobunLinked = libraries.some((line) =>
    ELECTROBUN_LIBRARY.test(line)
  );
  const origin = server.url.origin;
  const stunUrl = `stun:127.0.0.1:${stunServer.port}`;
  const wsUrl = `${origin.replace(HTTP_SCHEME, 'ws')}/ws`;
  const fileUrl = pathToFileURL(sentinel).href;
  const candidates: CandidateEvidence[] = [];

  try {
    for (const spec of CANDIDATES) {
      const appPath = join(ARTIFACTS, `${spec.id}.app`);
      const signing = await assembleSignedApp({
        appPath,
        binary,
        bundleId: spec.bundleId,
        entitlements: spec.entitlements,
        hardenedRuntime: spec.hardenedRuntime,
      });
      const hitMark = hits.length;
      const stunMark = stunPackets.length;
      const html = pageHtml({
        candidate: spec.id,
        fileUrl,
        origin,
        stunUrl,
        wsUrl,
      });
      const resources = spec.resourceScheme
        ? resourcePageConfig({
            candidate: spec.id,
            fileUrl,
            origin,
            stunUrl,
            wsUrl,
          })
        : undefined;
      const run = await runHelper({
        appPath,
        timeoutMs: HELPER_TIMEOUT_MS,
        config: {
          candidate: spec.id,
          origin,
          fileUrl,
          stunUrl,
          wsUrl,
          html,
          timeoutMs: 10_000,
          blockNetwork: Boolean(spec.blockNetwork),
          mode: spec.resourceScheme ? 'resource' : 'probe',
          resourceEntryJs: resources?.entry,
          resourceIndexHtml: resources?.index,
          resourceModuleJs: resources?.module,
          resourceStyleCss: resources?.style,
        },
      });
      const networkHits = hits.slice(hitMark);
      const candidateStunPackets = stunPackets.length - stunMark;
      let status: CandidateEvidence['status'] = 'completed';
      let reason: string | undefined;
      if (run.timedOut) {
        status = 'timeout';
        reason = `helper exceeded ${HELPER_TIMEOUT_MS}ms`;
      } else if (!run.helper?.pageResult) {
        status = 'failed';
        reason =
          run.helper?.loadError ||
          run.helper?.reason ||
          'helper did not report page results';
      } else if (spec.expectSandbox && !sandboxApplied(run.helper)) {
        status = 'failed';
        reason =
          'sandbox entitlement did not apply; APP_SANDBOX_CONTAINER_ID missing';
      }
      const evidence: CandidateEvidence = {
        id: spec.id,
        appPath,
        status,
        reason,
        exitCode: run.exitCode,
        stdout: run.stdout,
        stderr: run.stderr,
        codesign: signing.codesign,
        entitlementsDump: signing.entitlementsDump,
        linkedLibraries: libraries,
        networkHits,
        stunPackets: candidateStunPackets,
        helper: run.helper,
        sandboxApplied: sandboxApplied(run.helper),
        verdict: verdictFor(
          spec,
          run.helper,
          networkHits,
          candidateStunPackets,
          status
        ),
      };
      if (candidateStunPackets > 0) {
        evidence.reason = [
          evidence.reason,
          spec.blockNetwork
            ? 'loopback UDP STUN sink received a WebRTC packet despite URL content rules'
            : 'loopback UDP STUN sink received a WebRTC packet',
        ]
          .filter(Boolean)
          .join('; ');
      }
      if (evidence.verdict.network === 'inconclusive') {
        evidence.reason = [
          evidence.reason,
          'WebRTC API is exposed; the URL content rule has not proven direct WebRTC traffic is denied',
        ]
          .filter(Boolean)
          .join('; ');
      }
      if (spec.resourceScheme && evidence.verdict.resources !== 'pass') {
        evidence.reason = [
          evidence.reason,
          'custom-scheme relative module/style canary did not complete',
        ]
          .filter(Boolean)
          .join('; ');
      }
      candidates.push(evidence);
    }
    const networkControl = candidates.find(
      (candidate) => candidate.id === 'os-webview-sandbox-network'
    );
    const controlReachedLoopback =
      networkControl?.status === 'completed' &&
      networkControl.verdict.network === 'fail';
    for (const candidate of candidates) {
      const spec = CANDIDATES.find((item) => item.id === candidate.id);
      if (
        spec?.expectNetworkBlocked &&
        candidate.verdict.overall === 'pass' &&
        !controlReachedLoopback
      ) {
        candidate.verdict.overall = 'inconclusive';
        candidate.reason = [
          candidate.reason,
          'sandbox-network control did not demonstrate loopback reachability',
        ]
          .filter(Boolean)
          .join('; ');
      }
    }
  } finally {
    server.stop(true);
    stunServer.close();
  }

  return {
    date: new Date().toISOString(),
    platform: process.platform,
    parentPid: process.pid,
    bun: Bun.version,
    swiftc: swiftc.stdout.trim() || swiftc.stderr.trim(),
    electrobunLinked,
    candidates,
  };
}

if (import.meta.main) {
  const evidence = await runOsViewProbe();
  const outputDir = join(
    ROOT,
    '../../docs/features/Archive/plugin-container-evidence/2026-09-08'
  );
  await mkdir(outputDir, { recursive: true });
  const output = join(outputDir, 'os-webview.json');
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log('OS_WEBVIEW_PROBE_RESULT', output);
  console.log(JSON.stringify(evidence, null, 2));
}
