// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecordingRecorder } from './RecordingRecorder';

const recorderMocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  start: vi.fn(async () => true),
  stop: vi.fn(async () => null),
  state: {
    elapsedMs: 0,
    error: 'permission-denied' as null | string,
    levels: [] as number[],
    status: 'error',
  },
}));

vi.mock('@/hooks/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    cancel: recorderMocks.cancel,
    elapsedMs: recorderMocks.state.elapsedMs,
    error: recorderMocks.state.error,
    levels: recorderMocks.state.levels,
    start: recorderMocks.start,
    status: recorderMocks.state.status,
    stop: recorderMocks.stop,
  }),
}));

vi.mock('../../../paraglide/messages.js', () => ({
  menu_new_recording: () => 'Localized Recording',
  recording_recorder_cancel_aria: () => 'Localized cancel recording',
  recording_recorder_error_microphone_unavailable: () =>
    'Localized microphone unavailable',
  recording_recorder_error_permission_denied: () =>
    'Localized microphone denied',
  recording_recorder_error_start_failed: () => 'Localized start failed',
  recording_recorder_error_unsupported: () => 'Localized unsupported',
  recording_recorder_retry: () => 'Localized retry',
  recording_recorder_stop_save_aria: () => 'Localized stop and save',
}));

describe('RecordingRecorder', () => {
  beforeEach(() => {
    recorderMocks.cancel.mockClear();
    recorderMocks.start.mockClear();
    recorderMocks.stop.mockClear();
    recorderMocks.state = {
      elapsedMs: 0,
      error: 'permission-denied',
      levels: [],
      status: 'error',
    };
  });

  it('renders localized error and cancel/retry labels', () => {
    render(
      <RecordingRecorder
        onCancel={vi.fn()}
        onComplete={vi.fn()}
        recordingNumber={3}
      />
    );

    expect(
      screen.getByRole('dialog', { name: 'Localized Recording #3' })
    ).toBeInTheDocument();
    expect(screen.getByText('Localized microphone denied')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Localized retry' })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', {
        name: 'Localized cancel recording',
      })
    ).toHaveLength(2);
  });

  it('renders a localized stop-and-save label while recording', () => {
    recorderMocks.state = {
      elapsedMs: 1000,
      error: null,
      levels: [0.25],
      status: 'recording',
    };

    render(
      <RecordingRecorder
        onCancel={vi.fn()}
        onComplete={vi.fn()}
        recordingNumber={4}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Localized stop and save' })
    ).toBeInTheDocument();
  });
});
