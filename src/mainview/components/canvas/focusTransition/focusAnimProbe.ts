/**
 * Dev-only frame probe for the focus open / close animation. Samples
 * requestAnimationFrame between start and stop and logs frame count, dropped
 * frames (gaps > 20ms) and the longest frame, prefixed `[focus-anim]`, so
 * transition variants can be compared objectively. A no-op in production.
 */

const DROPPED_FRAME_MS = 20;
/** Safety net: stop sampling if a stop call never arrives. */
const MAX_SAMPLE_MS = 3000;

export interface FrameStats {
  droppedFrames: number;
  durationMs: number;
  frames: number;
  longestFrameMs: number;
}

/** Pure reducer over rAF timestamps (exported for tests). */
export function summarizeFrames(timestamps: readonly number[]): FrameStats {
  let dropped = 0;
  let longest = 0;
  for (let index = 1; index < timestamps.length; index += 1) {
    const gap = (timestamps[index] ?? 0) - (timestamps[index - 1] ?? 0);
    if (gap > DROPPED_FRAME_MS) {
      dropped += 1;
    }
    if (gap > longest) {
      longest = gap;
    }
  }
  const first = timestamps[0] ?? 0;
  const last = timestamps.at(-1) ?? first;
  return {
    droppedFrames: dropped,
    durationMs: last - first,
    frames: Math.max(0, timestamps.length - 1),
    longestFrameMs: longest,
  };
}

const noop = () => undefined;

/**
 * Start sampling. Returns an idempotent stop function that logs the result.
 * `label` names the run (e.g. `open scaleMorph`).
 */
export function startFocusAnimProbe(label: string): () => void {
  if (
    !import.meta.env.DEV ||
    typeof globalThis.requestAnimationFrame !== 'function'
  ) {
    return noop;
  }
  const stamps: number[] = [];
  let frame = 0;
  let stopped = false;
  const startedAt = performance.now();
  const tick = (now: number) => {
    stamps.push(now);
    if (now - startedAt > MAX_SAMPLE_MS) {
      stop();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  function stop() {
    if (stopped) {
      return;
    }
    stopped = true;
    cancelAnimationFrame(frame);
    stamps.push(performance.now());
    const stats = summarizeFrames(stamps);
    console.info(
      `[focus-anim] ${label}: ${stats.frames} frames in ${Math.round(
        stats.durationMs
      )}ms, dropped(>${DROPPED_FRAME_MS}ms)=${stats.droppedFrames}, longest=${stats.longestFrameMs.toFixed(1)}ms`
    );
  }
  frame = requestAnimationFrame(tick);
  return stop;
}
