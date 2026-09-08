import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  ARTIFACTS,
  assembleSignedApp,
  bridgeFailed,
  compileHelper,
  pageHtml,
  ROOT,
  runHelper,
} from './osViewProbe';
import {
  osWebViewHangPage,
  osWebViewMemoryPage,
} from './osWebViewLifecyclePages';

const LIFECYCLE_BUNDLE_ID = 'com.ghostboard.plugin-probe.os-webview-lifecycle';
const ALLOCATE_BYTES = 64 * 1024 * 1024;
const STARTED_MARKER = /^OS_WEBVIEW_HELPER_STARTED\s+(\{.*\})$/m;
const HEARTBEAT_LINE = /^OS_WEBVIEW_HELPER_HEARTBEAT\s+(\d+)$/gm;
const HTTP_SCHEME = /^http/u;
const PS_COLUMNS = /\s+/u;

function serializePage(source: string, payload?: unknown): string {
  const body = source.replaceAll('</', `<${String.fromCharCode(92)}/`);
  const args =
    payload === undefined
      ? '()'
      : `(${JSON.stringify(payload).replaceAll('<', '\\u003c')})`;
  return `<!doctype html><meta charset="utf-8"><title>OS WebView lifecycle</title><pre>running…</pre><script>(${body})${args};</script>`;
}

function sampleHelperProcesses(helperPid: number): string {
  const result = Bun.spawnSync(['ps', '-axo', 'pid=,ppid=,rss=,comm='], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return result.stdout
    .toString()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) {
        return false;
      }
      const [pid, ppid] = line.split(PS_COLUMNS);
      return pid === String(helperPid) || ppid === String(helperPid);
    })
    .join('\n');
}

function leftoverHelpers(): string {
  const result = Bun.spawnSync(['pgrep', '-lf', 'OsWebViewHelper'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return result.stdout.toString().trim();
}

function recoverVerdict(
  page: Record<string, unknown> | null | undefined,
  networkHits: string[]
): { bridge: 'fail' | 'pass'; network: 'fail' | 'pass' } {
  const sawNetwork =
    networkHits.length > 0 ||
    page?.network === true ||
    page?.websocket === true;
  return {
    bridge: bridgeFailed(page) ? 'fail' : 'pass',
    network: sawNetwork ? 'fail' : 'pass',
  };
}

async function readStdoutUntil(
  stream: ReadableStream<Uint8Array>,
  predicate: (text: string) => boolean,
  timeoutMs: number
): Promise<{ matched: boolean; text: string }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    const chunk = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>((resolve) => {
        setTimeout(() => resolve({ done: true, value: undefined }), remaining);
      }),
    ]);
    if (chunk.value) {
      text += decoder.decode(chunk.value, { stream: true });
      if (predicate(text)) {
        return { matched: true, text };
      }
    }
    if (chunk.done && !chunk.value) {
      break;
    }
  }
  return { matched: predicate(text), text };
}

export async function runOsViewLifecycleProbe(): Promise<
  Record<string, unknown>
> {
  if (process.platform !== 'darwin') {
    return {
      date: new Date().toISOString(),
      platform: process.platform,
      status: 'unavailable',
      reason: 'lifecycle helper is implemented for macOS only',
    };
  }

  const work = await mkdtemp(
    join(tmpdir(), 'ghostboard-os-webview-lifecycle-')
  );
  const sentinel = join(work, 'sentinel.txt');
  await writeFile(sentinel, 'probe-only-file');
  const hits: string[] = [];
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

  const origin = server.url.origin;
  const wsUrl = `${origin.replace(HTTP_SCHEME, 'ws')}/ws`;
  const fileUrl = pathToFileURL(sentinel).href;
  const hangHtml = serializePage(osWebViewHangPage.toString());
  const memoryHtml = serializePage(osWebViewMemoryPage.toString(), {
    allocateBytes: ALLOCATE_BYTES,
  });
  const recoverHangHtml = pageHtml({
    candidate: 'os-webview-lifecycle-recover-hang',
    fileUrl,
    origin,
    wsUrl,
  });
  const recoverMemoryHtml = pageHtml({
    candidate: 'os-webview-lifecycle-recover-memory',
    fileUrl,
    origin,
    wsUrl,
  });
  const recoverKillHtml = pageHtml({
    candidate: 'os-webview-lifecycle-recover-kill',
    fileUrl,
    origin,
    wsUrl,
  });

  const binary = join(ARTIFACTS, 'OsWebViewHelper');
  await compileHelper(binary);
  const appPath = join(ARTIFACTS, 'os-webview-lifecycle.app');
  const signing = await assembleSignedApp({
    appPath,
    binary,
    bundleId: LIFECYCLE_BUNDLE_ID,
    entitlements: join(
      ROOT,
      'os-webview-helper',
      'sandbox-network.entitlements'
    ),
  });

  const evidence: Record<string, unknown> = {
    date: new Date().toISOString(),
    platform: process.platform,
    parentPid: process.pid,
    bun: Bun.version,
    allocateBytes: ALLOCATE_BYTES,
    codesign: signing.codesign,
    entitlementsDump: signing.entitlementsDump,
  };

  try {
    const lifecycleHitsAt = hits.length;
    const lifecycle = await runHelper({
      appPath,
      timeoutMs: 30_000,
      config: {
        candidate: 'os-webview-lifecycle',
        origin,
        fileUrl,
        wsUrl,
        html: recoverHangHtml,
        hangHtml,
        memoryHtml,
        recoverHtml: recoverMemoryHtml,
        timeoutMs: 25_000,
        hangMs: 1500,
        allocateBytes: ALLOCATE_BYTES,
        blockNetwork: true,
        mode: 'lifecycle',
      },
    });
    const lifecycleHits = hits.slice(lifecycleHitsAt);
    const payload = lifecycle.helper as Record<string, unknown> | null;
    const hang = (payload?.hang ?? {}) as Record<string, unknown>;
    const memory = (payload?.memory ?? {}) as Record<string, unknown>;
    const recoverHang = payload?.recoverAfterHang as
      | Record<string, unknown>
      | null
      | undefined;
    const recoverMemory = payload?.recoverAfterMemory as
      | Record<string, unknown>
      | null
      | undefined;
    const recoverHangHits = lifecycleHits.filter((hit) =>
      hit.includes('recover-hang')
    );
    const recoverMemoryHits = lifecycleHits.filter((hit) =>
      hit.includes('recover-memory')
    );
    const hangTicksGrew =
      Number(hang.ticksAfterHang ?? 0) - Number(hang.ticksAtStart ?? 0) >= 3;
    const hangJsStopped =
      hang.evaluateDuringHang === 'timeout' ||
      hang.evaluateDuringHang === 'terminated' ||
      hang.webContentTerminated === true;
    const recoverHangVerdict = recoverVerdict(recoverHang, recoverHangHits);
    const recoverMemoryVerdict = recoverVerdict(
      recoverMemory,
      recoverMemoryHits
    );
    const allocated = Number(
      (memory.page as { allocated?: number } | undefined)?.allocated ?? 0
    );
    const inHelper = {
      status: lifecycle.timedOut ? 'timeout' : payload ? 'completed' : 'failed',
      exitCode: lifecycle.exitCode,
      reason: lifecycle.timedOut
        ? 'lifecycle helper exceeded 30000ms'
        : undefined,
      stdout: lifecycle.stdout,
      stderr: lifecycle.stderr,
      helper: payload,
      networkHits: lifecycleHits,
      hangHeartbeatGrew: hangTicksGrew,
      hangJsDidNotReturn: hangJsStopped,
      recoverAfterHang: recoverHangVerdict,
      recoverAfterMemory: recoverMemoryVerdict,
      memoryAllocated: allocated >= ALLOCATE_BYTES / 2,
      overall:
        hangTicksGrew &&
        hangJsStopped &&
        recoverHangVerdict.bridge === 'pass' &&
        recoverHangVerdict.network === 'pass' &&
        recoverMemoryVerdict.bridge === 'pass' &&
        recoverMemoryVerdict.network === 'pass' &&
        allocated >= ALLOCATE_BYTES / 2
          ? 'pass'
          : 'fail',
    };

    const executable = join(appPath, 'Contents', 'MacOS', 'OsWebViewHelper');
    const hangChild = Bun.spawn([executable], {
      cwd: dirname(executable),
      stdin: Response.json({
        candidate: 'os-webview-lifecycle-hang',
        origin,
        fileUrl,
        wsUrl,
        html: hangHtml,
        hangHtml,
        timeoutMs: 20_000,
        blockNetwork: true,
        mode: 'hang',
      }),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const started = await readStdoutUntil(
      hangChild.stdout,
      (text) => STARTED_MARKER.test(text),
      8000
    );
    const pid = hangChild.pid;
    const beforeKill = pid === undefined ? '' : sampleHelperProcesses(pid);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    HEARTBEAT_LINE.lastIndex = 0;
    const heartbeats = [...started.text.matchAll(HEARTBEAT_LINE)].length;
    const killStarted = Date.now();
    hangChild.kill('SIGTERM');
    const killWait = await Promise.race([
      hangChild.exited,
      new Promise<null>((resolve) => {
        setTimeout(() => {
          hangChild.kill('SIGKILL');
          resolve(null);
        }, 2000);
      }),
    ]);
    const killMs = Date.now() - killStarted;
    const exitCode = killWait === null ? await hangChild.exited : killWait;
    const afterKill = pid === undefined ? '' : sampleHelperProcesses(pid);
    const leftover = leftoverHelpers();
    const stderr = await new Response(hangChild.stderr).text();
    const rebuildHitsAt = hits.length;
    const rebuild = await runHelper({
      appPath,
      timeoutMs: 20_000,
      config: {
        candidate: 'os-webview-lifecycle-recover-kill',
        origin,
        fileUrl,
        wsUrl,
        html: recoverKillHtml,
        timeoutMs: 10_000,
        blockNetwork: true,
        mode: 'probe',
      },
    });
    const rebuildHits = hits.slice(rebuildHitsAt);
    const rebuildVerdict = recoverVerdict(
      rebuild.helper?.pageResult,
      rebuildHits
    );
    const processKill = {
      started: started.matched,
      startedStdout: started.text.slice(-2000),
      helperPid: pid,
      heartbeatsBeforeKill: heartbeats,
      killMs,
      exitCode,
      beforeKill,
      afterKill,
      leftover,
      stderr: stderr.trim().slice(-2000),
      rebuild: {
        status: rebuild.timedOut
          ? 'timeout'
          : rebuild.helper
            ? 'completed'
            : 'failed',
        helper: rebuild.helper,
        networkHits: rebuildHits,
        verdict: rebuildVerdict,
      },
      overall:
        started.matched &&
        exitCode !== null &&
        leftover === '' &&
        rebuildVerdict.bridge === 'pass' &&
        rebuildVerdict.network === 'pass'
          ? 'pass'
          : 'fail',
    };

    evidence.inHelperRecycle = inHelper;
    evidence.processKill = processKill;
    evidence.overall =
      inHelper.overall === 'pass' && processKill.overall === 'pass'
        ? 'pass'
        : 'fail';
  } finally {
    server.stop(true);
  }

  return evidence;
}

if (import.meta.main) {
  const evidence = await runOsViewLifecycleProbe();
  const outputDir = join(
    ROOT,
    '../../docs/features/In Progress/plugin-container-evidence/2026-09-08'
  );
  await mkdir(outputDir, { recursive: true });
  const output = join(outputDir, 'os-webview-lifecycle.json');
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log('OS_WEBVIEW_LIFECYCLE_RESULT', output);
  console.log(JSON.stringify(evidence, null, 2));
}
