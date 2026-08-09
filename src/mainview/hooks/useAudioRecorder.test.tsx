// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  encodeWavFromFloat32,
  useAudioRecorder,
} from '@/hooks/useAudioRecorder';

class FakeAnalyserNode {
  fftSize = 1024;
  connect = vi.fn();
  disconnect = vi.fn();
  getByteTimeDomainData = vi.fn((buffer: Uint8Array) => {
    buffer.fill(128);
  });
}

class FakeScriptProcessorNode {
  connect = vi.fn();
  disconnect = vi.fn();
  onaudioprocess:
    | ((event: {
        inputBuffer: { getChannelData: (channel: number) => Float32Array };
      }) => void)
    | null = null;
}

class FakeGainNode {
  connect = vi.fn();
  disconnect = vi.fn();
  gain = { value: 1 };
}

class FakeMediaStreamSource {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: AudioContextState = 'running';
  sampleRate = 48_000;
  destination = {} as AudioDestinationNode;
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  createAnalyser = vi.fn(() => new FakeAnalyserNode());
  createGain = vi.fn(() => new FakeGainNode());
  createMediaStreamSource = vi.fn(() => new FakeMediaStreamSource());
  createScriptProcessor = vi.fn(() => {
    const processor = new FakeScriptProcessorNode();
    this.lastProcessor = processor;
    return processor;
  });
  lastProcessor: FakeScriptProcessorNode | null = null;

  constructor() {
    FakeAudioContext.instances.push(this);
  }
}

describe('encodeWavFromFloat32', () => {
  it('writes a valid WAV header and sample payload', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1]);
    const blob = encodeWavFromFloat32([samples], 44_100);
    expect(blob.type).toBe('audio/wav');
    // 44-byte header + 4 samples * 2 bytes
    expect(blob.size).toBe(44 + 8);
  });
});

describe('useAudioRecorder', () => {
  beforeEach(() => {
    FakeAudioContext.instances = [];
    vi.stubGlobal('AudioContext', FakeAudioContext);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stops a microphone stream that resolves after recording was canceled', async () => {
    let resolveStream!: (stream: MediaStream) => void;
    const pendingStream = new Promise<MediaStream>((resolve) => {
      resolveStream = resolve;
    });
    const getUserMedia = vi.fn(() => pendingStream);
    const track = { stop: vi.fn() };
    const stream = {
      getTracks: () => [track],
    } as unknown as MediaStream;

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    const { result } = renderHook(() => useAudioRecorder());

    let startPromise!: Promise<boolean>;
    act(() => {
      startPromise = result.current.start();
    });

    expect(result.current.status).toBe('requesting');

    act(() => {
      result.current.cancel();
    });

    await act(async () => {
      resolveStream(stream);
      await startPromise;
    });

    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(result.current.status).toBe('idle');
  });

  it('captures PCM and returns a non-empty WAV blob on stop', async () => {
    const track = { stop: vi.fn() };
    const stream = {
      getTracks: () => [track],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    });

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('recording');
    expect(FakeAudioContext.instances).toHaveLength(1);
    const ctx = FakeAudioContext.instances[0]!;
    expect(ctx.createScriptProcessor).toHaveBeenCalled();
    const processor = ctx.lastProcessor!;
    expect(processor.onaudioprocess).toEqual(expect.any(Function));

    // Simulate a few audio callbacks with non-silent samples.
    act(() => {
      for (let i = 0; i < 3; i += 1) {
        processor.onaudioprocess?.({
          inputBuffer: {
            getChannelData: () => new Float32Array([0.1, -0.2, 0.3, 0]),
          },
        });
      }
    });

    let stopResult: Awaited<ReturnType<typeof result.current.stop>>;
    await act(async () => {
      stopResult = await result.current.stop();
    });

    expect(stopResult!.mimeType).toBe('audio/wav');
    expect(stopResult!.blob.size).toBeGreaterThan(44);
    expect(result.current.status).toBe('idle');
    expect(track.stop).toHaveBeenCalled();
  });

  it('returns null when stop is called with no captured PCM', async () => {
    const track = { stop: vi.fn() };
    const stream = {
      getTracks: () => [track],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    });

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.start();
    });

    let stopResult: Awaited<ReturnType<typeof result.current.stop>>;
    await act(async () => {
      stopResult = await result.current.stop();
    });

    expect(stopResult!).toBeNull();
    expect(result.current.status).toBe('idle');
  });

  it('returns a permission-denied error code when microphone access is blocked', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => {
          const error = new Error('denied');
          error.name = 'NotAllowedError';
          throw error;
        }),
      },
    });

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('permission-denied');
  });

  it('resumes a suspended AudioContext before capturing', async () => {
    const track = { stop: vi.fn() };
    const stream = {
      getTracks: () => [track],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    });

    // Start suspended — mirrors WKWebView autoplay policy.
    const Original = FakeAudioContext;
    vi.stubGlobal(
      'AudioContext',
      class SuspendedAudioContext extends Original {
        state: AudioContextState = 'suspended';
      }
    );

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.start();
    });

    const ctx = FakeAudioContext.instances[0]!;
    expect(ctx.resume).toHaveBeenCalled();
    expect(result.current.status).toBe('recording');
  });
});
