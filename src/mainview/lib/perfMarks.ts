/**
 * Baseline timing marks for docs/quality/perf-baseline.md (remediation plan,
 * phase 0). Off by default; turn on with either
 *
 *   - `VITE_GB_PERF=1 bun run dev:hmr`, or
 *   - `localStorage.setItem('gb:perf', '1')` in the web inspector, then reload.
 *
 * Results are logged as `[perf] …` and kept on `window.__gbPerf` so a run can
 * be copied out with `copy(window.__gbPerf)`.
 *
 * Measured:
 *   - `cold-start`: navigation start → first canvas nodes painted.
 *   - `open-to-input`: open request → a new editable BlockNote surface in the
 *     DOM, painted. Selector-based on purpose so it keeps working when the
 *     full-screen view is replaced by the side panel.
 *   - `drag`: frames per second and the worst frame while a node is dragged.
 */

export interface PerfSample {
  at: number;
  detail?: Record<string, number | string>;
  ms: number;
  name: string;
}

declare global {
  interface Window {
    __gbPerf?: PerfSample[];
  }
}

const EDITABLE_SELECTOR = '.bn-editor[contenteditable="true"]';
const NODE_SELECTOR = '.react-flow__node';
const OPEN_TIMEOUT_MS = 5000;

function readFlag(): boolean {
  if (import.meta.env.VITE_GB_PERF === '1') {
    return true;
  }
  try {
    return globalThis.localStorage?.getItem('gb:perf') === '1';
  } catch {
    return false;
  }
}

const enabled = typeof window !== 'undefined' && readFlag();

export function perfEnabled(): boolean {
  return enabled;
}

function record(
  name: string,
  ms: number,
  detail?: Record<string, number | string>
): void {
  const sample: PerfSample = { name, ms: Math.round(ms), at: Date.now() };
  if (detail) {
    sample.detail = detail;
  }
  window.__gbPerf ??= [];
  window.__gbPerf.push(sample);
  console.info(`[perf] ${name} ${sample.ms}ms`, detail ?? '');
}

/** Resolve after the browser has painted the current DOM. */
function afterPaint(): Promise<number> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve(performance.now()));
    });
  });
}

function waitFor(
  selector: string,
  isNew: (el: Element) => boolean,
  timeoutMs: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const found = () =>
      Array.from(document.querySelectorAll(selector)).some(isNew);
    if (found()) {
      resolve(true);
      return;
    }
    const observer = new MutationObserver(() => {
      if (found()) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(true);
      }
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, timeoutMs);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['contenteditable'],
      childList: true,
      subtree: true,
    });
  });
}

let coldStartWatched = false;

function watchColdStart(): void {
  if (coldStartWatched) {
    return;
  }
  coldStartWatched = true;
  waitFor(NODE_SELECTOR, () => true, 60_000)
    .then(async (ok) => {
      if (!ok) {
        return;
      }
      const painted = await afterPaint();
      record('cold-start', painted, {
        nodes: document.querySelectorAll(NODE_SELECTOR).length,
      });
    })
    .catch(() => undefined);
}

let pendingOpen: number | null = null;

/**
 * Call where an open request starts (a double-click, Enter, a library or
 * search hit). Repeated calls while one is pending are ignored, so it is safe
 * to call from more than one layer of the same open.
 */
export function markOpenRequested(): void {
  if (!enabled || pendingOpen !== null) {
    return;
  }
  const start = performance.now();
  pendingOpen = start;
  const before = new Set(document.querySelectorAll(EDITABLE_SELECTOR));
  waitFor(EDITABLE_SELECTOR, (el) => !before.has(el), OPEN_TIMEOUT_MS)
    .then(async (ok) => {
      if (ok) {
        const painted = await afterPaint();
        record('open-to-input', painted - start);
      }
    })
    .catch(() => undefined)
    .finally(() => {
      pendingOpen = null;
    });
}

let dragWatched = false;

function watchDrag(): void {
  if (dragWatched) {
    return;
  }
  dragWatched = true;
  let raf = 0;
  let frames = 0;
  let start = 0;
  let last = 0;
  let worst = 0;
  let moved = false;

  const tick = (now: number) => {
    frames += 1;
    worst = Math.max(worst, now - last);
    last = now;
    raf = requestAnimationFrame(tick);
  };
  const onMove = () => {
    moved = true;
  };
  const stop = () => {
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', stop, true);
    window.removeEventListener('pointercancel', stop, true);
    cancelAnimationFrame(raf);
    const duration = performance.now() - start;
    // Ignore clicks and very short nudges; they say nothing about frame rate.
    if (!moved || duration < 300 || frames < 2) {
      return;
    }
    const selected = document.querySelectorAll(
      `${NODE_SELECTOR}.selected`
    ).length;
    record('drag', duration, {
      fps: Math.round((frames / duration) * 1000),
      worstFrameMs: Math.round(worst),
      nodes: document.querySelectorAll(NODE_SELECTOR).length,
      selected,
    });
  };

  window.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target as Element | null;
      if (event.button !== 0 || !target?.closest?.(NODE_SELECTOR)) {
        return;
      }
      frames = 0;
      worst = 0;
      moved = false;
      start = performance.now();
      last = start;
      raf = requestAnimationFrame(tick);
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', stop, true);
      window.addEventListener('pointercancel', stop, true);
    },
    true
  );
}

/** Start the passive watchers. No-op unless perf marks are enabled. */
export function startPerfMarks(): void {
  if (!enabled) {
    return;
  }
  watchColdStart();
  watchDrag();
}
