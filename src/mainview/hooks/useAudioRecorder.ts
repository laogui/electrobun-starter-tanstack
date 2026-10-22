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
  /** Peak amplitudes [0,1] sampled during capture for the node waveform. */
  waveform?: number[];
}

/** Number of peak bars persisted onto the recording node. */
const WAVEFORM_PEAK_COUNT = 48;

/** Number of live amplitude samples kept for the scrolling waveform. */
const LIVE_SAMPLE_COUNT = 56;
/** How often (ms) a new live amplitude sample is captured. */
const LIVE_SAMPLE_INTERVAL_MS = 90;
/** ScriptProcessor buffer size — power of 2, balance latency vs. overhead. */
const PROCESSOR_BUFFER_SIZE = 4096;

export function isAudioRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    getAudioContextConstructor() !== null
  );
}

/** Legacy WebKit builds expose only the prefixed constructor. */
interface LegacyAudioWindow {
  AudioContext?: new () => AudioContext;
  webkitAudioContext?: new () => AudioContext;
}

function getAudioContextConstructor(): (new () => AudioContext) | null {
  const w: LegacyAudioWindow = window;
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Encode mono Float32 PCM samples as a 16-bit little-endian WAV blob.
 * Avoids MediaRecorder entirely — WKWebView's MediaRecorder is unreliable
 * (empty blobs / missing dataavailable / hang on decode).
 */
export function encodeWavFromFloat32(
  chunks: Float32Array[],
  sampleRate: number
): Blob {
  let totalSamples = 0;
  for (const chunk of chunks) {
    totalSamples += chunk.length;
  }
  const dataLength = totalSamples * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeString = (startOffset: number, value: string) => {
    let index = 0;
    for (const char of value) {
      view.setUint8(startOffset + index, char.charCodeAt(0));
      index += 1;
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (const chunk of chunks) {
    for (const raw of chunk) {
      const sample = Math.max(-1, Math.min(1, raw));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x80_00 : sample * 0x7f_ff,
        true
      );
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Downsample captured PCM into a small peak trail for the recording card.
 * Avoids re-decoding the WAV later (which has hung on WKWebView).
 */
export function peaksFromPcmChunks(
  chunks: Float32Array[],
  sampleCount = WAVEFORM_PEAK_COUNT
): number[] {
  if (sampleCount <= 0 || chunks.length === 0) {
    return [];
  }
  let totalSamples = 0;
  for (const chunk of chunks) {
    totalSamples += chunk.length;
  }
  if (totalSamples === 0) {
    return [];
  }
  const bucketSize = Math.max(1, Math.floor(totalSamples / sampleCount));
  const peaks = new Array<number>(sampleCount).fill(0);
  let maxPeak = 0;
  let sampleIndex = 0;
  let bucket = 0;
  let peak = 0;
  for (const chunk of chunks) {
    for (const raw of chunk) {
      const value = Math.abs(raw);
      if (value > peak) {
        peak = value;
      }
      sampleIndex += 1;
      if (sampleIndex % bucketSize === 0 && bucket < sampleCount) {
        peaks[bucket] = peak;
        if (peak > maxPeak) {
          maxPeak = peak;
        }
        peak = 0;
        bucket += 1;
      }
    }
  }
  // Remainder samples that never filled a full bucketSize: keep as the last bar
  // so the waveform still reflects the tail of the clip. When totalSamples is an
  // exact multiple of bucketSize, bucket === sampleCount and this is a no-op.
  if (bucket < sampleCount) {
    peaks[bucket] = peak;
    if (peak > maxPeak) {
      maxPeak = peak;
    }
  }
  if (maxPeak <= 0) {
    return peaks;
  }
  return peaks.map((value) => Math.min(1, value / maxPeak));
}

interface CaptureGraph {
  analyser: AnalyserNode;
  context: AudioContext;
  mute: GainNode;
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
}

/**
 * Microphone capture via Web Audio ScriptProcessor → WAV.
 *
 * MediaRecorder on Electrobun's WKWebView frequently yields empty blobs or
 * incomplete mp4 fragments. Capturing PCM and encoding WAV is deterministic
 * across WebKit builds and always produces a playable file.
 *
 * ScriptProcessor is deprecated, but remains the only reliable PCM tap that
 * works without an AudioWorklet module URL in a packaged WKWebView. Future:
 * migrate to AudioWorklet when Electrobun supports worklet module loading.
 */
export function useAudioRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [error, setError] = useState<RecorderError | null>(null);
  const [levels, setLevels] = useState<number[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const graphRef = useRef<CaptureGraph | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const startTimeRef = useRef(0);
  const sampleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
    const graph = graphRef.current;
    if (graph) {
      try {
        graph.processor.onaudioprocess = null;
        graph.processor.disconnect();
        graph.source.disconnect();
        graph.analyser.disconnect();
        graph.mute.disconnect();
      } catch {
        // ignore disconnect errors on half-torn graphs
      }
      graph.context.close().catch(() => undefined);
      graphRef.current = null;
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
    pcmChunksRef.current = [];
    cleanup();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
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

    const AudioCtor = getAudioContextConstructor();
    if (!AudioCtor) {
      cleanup();
      setStatus('error');
      setError('unsupported');
      return false;
    }

    try {
      const context = new AudioCtor();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      // See module doc: ScriptProcessor until AudioWorklet is packagable.
      const processor = context.createScriptProcessor(
        PROCESSOR_BUFFER_SIZE,
        1,
        1
      );
      const mute = context.createGain();
      mute.gain.value = 0;

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        // Copy — the underlying buffer is reused by the audio engine.
        pcmChunksRef.current.push(new Float32Array(input));
      };

      source.connect(analyser);
      source.connect(processor);
      // Must connect processor to the graph or onaudioprocess never fires.
      processor.connect(mute);
      mute.connect(context.destination);

      graphRef.current = { analyser, context, mute, processor, source };

      // WKWebView often starts AudioContext suspended until resume(). Wire the
      // graph first, then resume so onaudioprocess starts immediately.
      if (context.state === 'suspended') {
        await context.resume();
      }
      if (startTokenRef.current !== token) {
        cleanup();
        return false;
      }
    } catch {
      cleanup();
      setStatus('error');
      setError('start-failed');
      return false;
    }

    startTimeRef.current = Date.now();
    setStatus('recording');

    const buffer = graphRef.current
      ? new Uint8Array(graphRef.current.analyser.fftSize)
      : null;
    sampleTimerRef.current = setInterval(() => {
      let level = 0.05;
      const graph = graphRef.current;
      if (graph && buffer) {
        graph.analyser.getByteTimeDomainData(buffer);
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
    const graph = graphRef.current;
    if (!graph) {
      cleanup();
      setStatus('idle');
      return Promise.resolve(null);
    }

    setStatus('stopping');

    // Synchronously encode whatever PCM we have, then tear down.
    // No MediaRecorder onstop race — the blob is ready immediately.
    const sampleRate = graph.context.sampleRate || 44_100;
    const chunks = pcmChunksRef.current;
    const durationMs = Date.now() - startTimeRef.current;
    pcmChunksRef.current = [];

    cleanup();

    if (chunks.length === 0) {
      setStatus('idle');
      return Promise.resolve(null);
    }

    try {
      const blob = encodeWavFromFloat32(chunks, sampleRate);
      if (blob.size <= 44) {
        // Header-only WAV = no samples.
        setStatus('idle');
        return Promise.resolve(null);
      }
      const waveform = peaksFromPcmChunks(chunks);
      setStatus('idle');
      return Promise.resolve({
        blob,
        durationMs,
        mimeType: 'audio/wav',
        ...(waveform.length > 0 ? { waveform } : {}),
      });
    } catch {
      setStatus('idle');
      return Promise.resolve(null);
    }
  }, [cleanup]);

  const cancel = useCallback(() => {
    startTokenRef.current += 1;
    pcmChunksRef.current = [];
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
