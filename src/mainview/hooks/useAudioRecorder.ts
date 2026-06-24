import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderStatus =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'stopping'
  | 'error';

export type RecorderError =
  | 'microphone-unavailable'
  | 'permission-denied'
  | 'start-failed'
  | 'unsupported';

export interface RecordingResult {
  blob: Blob;
  durationMs: number;
  mimeType: string;
}

/** Number of live amplitude samples kept for the scrolling waveform. */
const LIVE_SAMPLE_COUNT = 56;
/** How often (ms) a new live amplitude sample is captured. */
const LIVE_SAMPLE_INTERVAL_MS = 90;

/**
 * Candidate MediaRecorder MIME types in preference order. WebKit (Electrobun's
 * macOS WKWebView) records `audio/mp4` (AAC); Chromium/WebKit-GTK prefer
 * `audio/webm`. The empty string lets the browser pick its default.
 */
const PREFERRED_MIME_TYPES = [
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  '',
];

function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    return '';
  }
  for (const type of PREFERRED_MIME_TYPES) {
    if (type === '' || MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

export function isAudioRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
}

interface AudioContextRefs {
  analyser: AnalyserNode;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
}

/**
 * Microphone capture state machine built on MediaRecorder. Exposes a live
 * amplitude trail (`levels`) and elapsed time for the recording UI, and
 * resolves the captured audio Blob on `stop()`.
 */
export function useAudioRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [error, setError] = useState<RecorderError | null>(null);
  const [levels, setLevels] = useState<number[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContextRefs | null>(null);
  const startTimeRef = useRef(0);
  const sampleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopResolveRef = useRef<
    ((result: RecordingResult | null) => void) | null
  >(null);
  const startTokenRef = useRef(0);

  const cleanup = useCallback(() => {
    if (sampleTimerRef.current) {
      clearInterval(sampleTimerRef.current);
      sampleTimerRef.current = null;
    }
    if (clockTimerRef.current) {
      clearInterval(clockTimerRef.current);
      clockTimerRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.source.disconnect();
        audioCtxRef.current.context.close().catch(() => undefined);
      } catch {
        // Some runtimes do not implement close(); ignore.
      }
      audioCtxRef.current = null;
    }
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    const token = startTokenRef.current + 1;
    startTokenRef.current = token;
    if (!isAudioRecordingSupported()) {
      setStatus('error');
      setError('unsupported');
      return false;
    }
    setStatus('requesting');
    setError(null);
    setLevels([]);
    setElapsedMs(0);
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if (startTokenRef.current !== token) {
        return false;
      }
      setStatus('error');
      setError(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'permission-denied'
          : 'microphone-unavailable'
      );
      return false;
    }
    if (startTokenRef.current !== token) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      return false;
    }
    streamRef.current = stream;

    const mimeType = pickSupportedMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch {
      cleanup();
      setStatus('error');
      setError('start-failed');
      return false;
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      const resolvedMime = recorder.mimeType || mimeType || 'audio/mp4';
      const blob = new Blob(chunksRef.current, { type: resolvedMime });
      const result: RecordingResult = {
        blob,
        durationMs: Date.now() - startTimeRef.current,
        mimeType: resolvedMime,
      };
      cleanup();
      setStatus('idle');
      stopResolveRef.current?.(blob.size > 0 ? result : null);
      stopResolveRef.current = null;
    };

    // Live amplitude metering via an AnalyserNode.
    try {
      const AudioCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtor) {
        const context = new AudioCtor();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        audioCtxRef.current = { analyser, context, source };
      }
    } catch {
      audioCtxRef.current = null;
    }

    startTimeRef.current = Date.now();
    recorder.start();
    setStatus('recording');

    const buffer = audioCtxRef.current
      ? new Uint8Array(audioCtxRef.current.analyser.fftSize)
      : null;
    sampleTimerRef.current = setInterval(() => {
      let level = 0.05;
      const ctx = audioCtxRef.current;
      if (ctx && buffer) {
        ctx.analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (const sample of buffer) {
          const centered = (sample - 128) / 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / buffer.length);
        level = Math.min(1, Math.max(0.05, rms * 2.4));
      }
      setLevels((prev) => {
        const next = [...prev, level];
        return next.length > LIVE_SAMPLE_COUNT
          ? next.slice(next.length - LIVE_SAMPLE_COUNT)
          : next;
      });
    }, LIVE_SAMPLE_INTERVAL_MS);

    clockTimerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 200);

    return true;
  }, [cleanup]);

  const stop = useCallback((): Promise<RecordingResult | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cleanup();
      setStatus('idle');
      return Promise.resolve(null);
    }
    setStatus('stopping');
    return new Promise((resolve) => {
      stopResolveRef.current = resolve;
      try {
        recorder.stop();
      } catch {
        cleanup();
        setStatus('idle');
        resolve(null);
      }
    });
  }, [cleanup]);

  const cancel = useCallback(() => {
    startTokenRef.current += 1;
    const recorder = recorderRef.current;
    stopResolveRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
    cleanup();
    setStatus('idle');
    setLevels([]);
    setElapsedMs(0);
  }, [cleanup]);

  useEffect(
    () => () => {
      startTokenRef.current += 1;
      cleanup();
    },
    [cleanup]
  );

  return { status, error, levels, elapsedMs, start, stop, cancel };
}
