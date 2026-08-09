// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RecordingContent } from './RecordingNode';

vi.mock('../../../../paraglide/messages.js', () => ({
  menu_new_recording: () => 'Localized Recording',
  recording_node_pause_aria: () => 'Localized pause recording',
  recording_node_play_aria: () => 'Localized play recording',
  recording_node_seek_aria: () => 'Localized seek recording',
}));

describe('RecordingContent', () => {
  it('uses the localized default title for untitled recordings', () => {
    render(
      <RecordingContent
        data={{
          color: '#ffffff',
          fileName: 'recording-5.m4a',
          mimeType: 'audio/mp4',
          recordingNumber: 5,
          title: '',
        }}
        streamSrc="http://127.0.0.1:4242/recording-5"
      />
    );

    expect(screen.getByText('Localized Recording #5')).toBeInTheDocument();
  });

  it('disables playback for missing recordings with a localized play label', () => {
    render(
      <RecordingContent
        data={{
          color: '#ffffff',
          fileName: 'missing.m4a',
          mimeType: 'audio/mp4',
          missing: true,
          recordingNumber: 2,
          title: '',
        }}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Localized play recording' })
    ).toBeDisabled();
  });

  it('exposes a seekable waveform when a stream is available', () => {
    render(
      <RecordingContent
        data={{
          color: '#ffffff',
          duration: 12,
          fileName: 'recording-1.wav',
          mimeType: 'audio/wav',
          recordingNumber: 1,
          title: 'Memo',
          waveform: [0.2, 0.8, 0.4],
        }}
        streamSrc="http://127.0.0.1:4242/recording-1"
      />
    );

    expect(
      screen.getByRole('slider', { name: 'Localized seek recording' })
    ).toBeInTheDocument();
    expect(screen.getByText('Memo')).toBeInTheDocument();
  });
});
