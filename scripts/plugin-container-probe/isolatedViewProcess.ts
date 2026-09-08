import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';

export interface IsolatedViewProcessEvidence {
  childParentPid?: number;
  childPid?: number;
  exitCode?: number;
  launcher: string;
  launcherPid?: number;
  parentPid: number;
  reason?: string;
  renderer: 'native' | 'cef';
  report?: unknown;
  status: 'completed' | 'failed' | 'timeout' | 'unavailable';
  stderr?: string;
  stdout?: string;
}

interface ChildMarker {
  childPid?: number;
  parentPid?: number;
  result?: unknown;
}

const CHILD_MARKER = /^ISOLATED_VIEW_CHILD_RESULT\s+(\{.*\})$/mu;
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Launch the probe's own Electrobun launcher in a fresh OS process.
 *
 * Running the same launcher with a child-only environment keeps this helper
 * usable in the packaged canary without introducing a second app bundle. The
 * helper intentionally reports "unavailable" for a plain Bun/Node invocation:
 * a source script cannot create an Electrobun BrowserWindow in another process
 * just by spawning the runtime binary.
 */
export async function runIsolatedViewProcess(input: {
  fileUrl: string;
  networkUrl: string;
  parentReportUrl: string;
  renderer?: 'native' | 'cef';
  timeoutMs?: number;
}): Promise<IsolatedViewProcessEvidence> {
  const parentPid = process.pid;
  const configuredLauncher =
    process.env.GHOSTBOARD_PLUGIN_PROBE_LAUNCHER?.trim();
  let launcher = configuredLauncher || process.argv0;
  const launcherName = basename(launcher).toLowerCase();
  if (
    !configuredLauncher &&
    (launcherName === 'bun' ||
      launcherName.startsWith('bun-') ||
      launcherName === 'node' ||
      launcherName.startsWith('node-'))
  ) {
    const adjacentLauncher = join(process.cwd(), 'launcher');
    if (existsSync(adjacentLauncher)) {
      launcher = adjacentLauncher;
    }
  }
  const resolvedLauncherName = basename(launcher).toLowerCase();
  const renderer = input.renderer ?? 'native';
  const result: IsolatedViewProcessEvidence = {
    launcher,
    parentPid,
    renderer,
    status: 'unavailable',
  };

  if (
    !launcher ||
    resolvedLauncherName === 'bun' ||
    resolvedLauncherName.startsWith('bun-') ||
    resolvedLauncherName === 'node' ||
    resolvedLauncherName.startsWith('node-')
  ) {
    result.reason =
      'requires a packaged Electrobun launcher; source-runtime execution cannot create the child window';
    return result;
  }

  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );
  Object.assign(environment, {
    GHOSTBOARD_PLUGIN_FILE_URL: input.fileUrl,
    GHOSTBOARD_PLUGIN_NETWORK_URL: input.networkUrl,
    GHOSTBOARD_PLUGIN_PARENT_REPORT_URL: input.parentReportUrl,
    GHOSTBOARD_PLUGIN_VIEW_CHILD: '1',
    GHOSTBOARD_PLUGIN_VIEW_RENDERER: renderer,
  });

  let child: Bun.Subprocess;
  try {
    child = Bun.spawn([launcher], {
      env: environment,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'inherit',
    });
  } catch (error) {
    result.status = 'failed';
    result.reason = `failed to launch isolated view process: ${String(error)}`;
    return result;
  }

  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  result.launcherPid = child.pid;
  const timeoutMs =
    input.timeoutMs ?? (renderer === 'cef' ? 40_000 : DEFAULT_TIMEOUT_MS);
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const exitCode = await Promise.race([
    child.exited,
    new Promise<null>((resolve) => {
      timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        resolve(null);
      }, timeoutMs);
    }),
  ]);
  clearTimeout(timeout);

  // Wait for the pipe readers after termination so the diagnostic marker is
  // not lost when a child closes its window during cleanup.
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  result.stdout = stdout.trim().slice(-4000);
  result.stderr = stderr.trim().slice(-4000);
  if (timedOut || exitCode === null) {
    result.status = 'timeout';
    result.reason = `isolated view process exceeded ${timeoutMs}ms`;
    return result;
  }
  result.exitCode = exitCode;

  const markerMatch = CHILD_MARKER.exec(stdout);
  let marker: ChildMarker | undefined;
  if (markerMatch?.[1]) {
    try {
      marker = JSON.parse(markerMatch[1]) as ChildMarker;
    } catch {
      result.reason = 'child emitted an invalid result marker';
    }
  }
  result.childPid = marker?.childPid;
  result.childParentPid = marker?.parentPid;
  result.report = marker?.result;
  if (!marker || typeof marker.childPid !== 'number') {
    result.status = 'failed';
    result.reason ??= 'child did not report its process identity';
    return result;
  }
  if (marker.parentPid !== child.pid || marker.childPid === parentPid) {
    result.status = 'failed';
    result.reason =
      'child process identity did not match the launcher process boundary';
    return result;
  }
  if (exitCode !== 0 || !marker.result || typeof marker.result !== 'object') {
    result.status = 'failed';
    result.reason ??= `child exited with code ${exitCode}`;
    return result;
  }
  // "completed" only means that a distinct process created the view and
  // reported its observations. The caller must still evaluate bridge,
  // network, file and lifecycle fields before accepting a container.
  result.status = 'completed';
  return result;
}
