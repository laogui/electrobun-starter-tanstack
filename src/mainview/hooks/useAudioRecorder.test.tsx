// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAudioRecorder } from '@/hooks/useAudioRecorder';

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = vi.fn(() => true);

  mimeType = 'audio/mp4';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn(() => {
    this.state = 'recording';
  });
  state: RecordingState = 'inactive';
  stop = vi.fn(() => {
    this.state = 'inactive';
    this.onstop?.();
  });

  constructor() {
    FakeMediaRecorder.instances.push(this);
  }
}

describe('useAudioRecorder', () => {
  beforeEach(() => {
    FakeMediaRecorder.instances = [];
    FakeMediaRecorder.isTypeSupported.mockClear();
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
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
    expect(FakeMediaRecorder.instances).toHaveLength(0);
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
});
