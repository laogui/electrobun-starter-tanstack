import { Loader2, Mic, Square, X } from 'lucide-react';
import { useEffect, useEffectEvent, useRef } from 'react';
import {
  type RecorderError,
  type RecordingResult,
  useAudioRecorder,
} from '@/hooks/useAudioRecorder';
import { cn } from '@/lib/utils';

import * as m from '../../../paraglide/messages.js';

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}`;
}

function formatRecorderError(error: RecorderError): string {
  switch (error) {
    case 'permission-denied':
      return m.recording_recorder_error_permission_denied();
    case 'start-failed':
      return m.recording_recorder_error_start_failed();
    case 'unsupported':
      return m.recording_recorder_error_unsupported();
    case 'microphone-unavailable':
      return m.recording_recorder_error_microphone_unavailable();
  }
}

/**
 * Live capture waveform: drawn amplitude bars left-aligned, a red playhead
 * line at the most recent sample, and a dotted track filling the unrecorded
 * remainder — mirroring a hardware voice-recorder display.
 */
function LiveWaveform({ levels }: { levels: number[] }) {
  const visibleLevels = levels.map((value, index) => ({
    id: `live-level-${index}`,
    value,
  }));

  return (
    <div className="flex h-16 items-center gap-[3px]">
      {visibleLevels.map(({ id, value }) => (
        <span
          className="block w-[3px] rounded-full bg-neutral-900 dark:bg-neutral-100"
          key={id}
          style={{
            height: `${Math.max(6, Math.round((0.12 + value * 0.88) * 100))}%`,
          }}
        />
      ))}
      {levels.length > 0 ? (
        <span className="block h-full w-[2px] shrink-0 rounded-full bg-red-500" />
      ) : null}
      <span className="h-px flex-1 border-neutral-300 border-t border-dashed dark:border-neutral-600" />
    </div>
  );
}

interface RecordingRecorderProps {
  onCancel: () => void;
  onComplete: (result: RecordingResult) => void;
  recordingNumber: number;
}

/**
 * Centered overlay that captures a microphone recording. Auto-starts on mount
 * (the user already chose "Record" from the menu), shows a live waveform and
 * timer, and resolves the captured audio when the user presses stop.
 */
export function RecordingRecorder({
  onCancel,
  onComplete,
  recordingNumber,
}: RecordingRecorderProps) {
  const { status, error, levels, elapsedMs, start, stop, cancel } =
    useAudioRecorder();
  const startedRef = useRef(false);
  const defaultTitle = m.menu_new_recording();
  const title = `${defaultTitle} #${recordingNumber}`;
  const errorMessage = error ? formatRecorderError(error) : null;

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    start();
  }, [start]);

  const handleStop = async () => {
    const result = await stop();
    if (result) {
      onComplete(result);
    } else {
      onCancel();
    }
  };

  const handleCancel = () => {
    cancel();
    onCancel();
  };

  const handleEscapeKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      cancel();
      onCancel();
    }
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      handleEscapeKey(e);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const isBusy = status === 'requesting' || status === 'stopping';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <button
        aria-label={m.recording_recorder_cancel_aria()}
        className="absolute inset-0 cursor-default bg-black/30 backdrop-blur-sm"
        onClick={handleCancel}
        type="button"
      />
      <dialog
        aria-label={title}
        className="relative w-[440px] max-w-[90vw] rounded-3xl bg-white p-6 shadow-2xl dark:bg-neutral-800"
        open
      >
        <div className="flex items-center justify-between gap-3">
          <span className="truncate font-medium text-[11px] text-neutral-400 uppercase tracking-wide dark:text-neutral-500">
            {title}
          </span>
          <span className="shrink-0 font-medium text-[13px] text-neutral-500 tabular-nums dark:text-neutral-300">
            {formatClock(elapsedMs)}
          </span>
        </div>

        <div className="mt-3 min-h-16">
          {errorMessage ? (
            <div className="flex h-16 items-center gap-2 text-red-600 text-sm dark:text-red-400">
              <Mic size={16} />
              {errorMessage}
            </div>
          ) : (
            <LiveWaveform levels={levels} />
          )}
        </div>

        <div className="mt-5 flex items-center justify-center gap-4">
          {errorMessage ? (
            <button
              className="rounded-xl bg-neutral-900 px-5 py-2.5 font-semibold text-neutral-50 text-sm hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900"
              onClick={() => {
                startedRef.current = true;
                start();
              }}
              type="button"
            >
              {m.recording_recorder_retry()}
            </button>
          ) : (
            <button
              aria-label={m.recording_recorder_stop_save_aria()}
              className={cn(
                'grid size-14 place-items-center rounded-full bg-red-500 text-white shadow-lg transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60',
                status === 'recording' &&
                  'animate-[pulse_1.6s_ease-in-out_infinite]'
              )}
              disabled={isBusy}
              onClick={handleStop}
              type="button"
            >
              {isBusy ? (
                <Loader2 className="animate-spin" size={22} />
              ) : (
                <Square fill="currentColor" size={20} />
              )}
            </button>
          )}
          <button
            aria-label={m.recording_recorder_cancel_aria()}
            className="grid size-10 place-items-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600"
            onClick={handleCancel}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
      </dialog>
    </div>
  );
}
