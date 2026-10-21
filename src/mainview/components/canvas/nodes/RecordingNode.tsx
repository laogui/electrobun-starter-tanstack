import { AlertTriangle, Loader2, Mic, Pause, Play } from 'lucide-react';
import {
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { NodeTagChips } from '@/components/card/NodeTagChips';
import { useNodeTagEditing } from '@/components/card/useNodeTagEditing';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import type { RecordingNodeData } from '@/lib/contentTypes';
import { getRecordingDisplayTitle } from '@/lib/contentTypes';
import { EMPTY_CAPTIONS_TRACK_SRC } from '@/lib/mediaCaptions';
import { resolveAttachmentStreamUrl } from '@/lib/rpc';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../../paraglide/messages.js';
import { NodeHandles } from './_shared/NodeHandles';
import { ResizeHandle } from './_shared/ResizeHandle';

const WAVEFORM_BAR_COUNT = 48;
/** Soft organic fallback when capture didn't store peaks. */
const DEFAULT_WAVEFORM_BARS = Array.from(
  { length: WAVEFORM_BAR_COUNT },
  (_, index) => {
    const t = index / WAVEFORM_BAR_COUNT;
    const envelope = Math.sin(Math.PI * t);
    const ripple =
      0.35 + 0.25 * Math.sin(index * 0.85) + 0.15 * Math.sin(index * 1.7);
    return {
      id: `default-waveform-${index}`,
      value: Math.max(0.12, envelope * ripple),
    };
  }
);

export type RecordingRuntimeData = Partial<RecordingNodeData> & {
  isHidden?: boolean;
};

function resolveRecordingData(data: RecordingRuntimeData): RecordingNodeData {
  return {
    attachmentFile:
      typeof data.attachmentFile === 'string' ? data.attachmentFile : undefined,
    color: typeof data.color === 'string' ? data.color : '#FFFFFF',
    duration: typeof data.duration === 'number' ? data.duration : undefined,
    fileName: typeof data.fileName === 'string' ? data.fileName : '',
    mimeType: typeof data.mimeType === 'string' ? data.mimeType : 'audio/mp4',
    missing: data.missing === true,
    previewUrl:
      typeof data.previewUrl === 'string' ? data.previewUrl : undefined,
    recordingNumber:
      typeof data.recordingNumber === 'number' ? data.recordingNumber : 1,
    size: typeof data.size === 'number' ? data.size : undefined,
    title: typeof data.title === 'string' ? data.title : '',
    waveform: Array.isArray(data.waveform) ? data.waveform : undefined,
  };
}

function formatClock(seconds: number | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return '00:00';
  }
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}`;
}

/**
 * Voice-memo style waveform. Played region uses the product accent; the rest
 * stays soft. Click / keyboard seeks. `progress` is a 0..1 fraction.
 */
function PlaybackWaveform({
  waveform,
  progress,
  isDark,
  interactive,
  onSeek,
}: {
  waveform: number[] | undefined;
  progress: number;
  isDark: boolean;
  interactive: boolean;
  onSeek?: (fraction: number) => void;
}) {
  const bars =
    waveform && waveform.length > 0
      ? waveform.map((value, index) => ({
          id: `waveform-${index}`,
          value,
        }))
      : DEFAULT_WAVEFORM_BARS;
  const clamped = Math.min(1, Math.max(0, progress));
  const trackRef = useRef<HTMLDivElement>(null);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      if (!(interactive && onSeek && trackRef.current)) {
        return;
      }
      const rect = trackRef.current.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }
      onSeek(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)));
    },
    [interactive, onSeek]
  );

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    seekFromClientX(event.clientX);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!(interactive && onSeek)) {
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      const step = event.key === 'ArrowLeft' ? -0.05 : 0.05;
      onSeek(Math.min(1, Math.max(0, clamped + step)));
    }
  };

  return (
    <div
      {...(interactive
        ? {
            'aria-label': m.recording_node_seek_aria(),
            'aria-valuemax': 100,
            'aria-valuemin': 0,
            'aria-valuenow': Math.round(clamped * 100),
            onClick: handleClick,
            onKeyDown: handleKeyDown,
            role: 'slider' as const,
            tabIndex: 0,
          }
        : { 'aria-hidden': true as const })}
      className={cn(
        'relative flex h-10 min-w-0 flex-1 items-center outline-hidden',
        interactive &&
          'nodrag cursor-pointer rounded-lg focus-visible:ring-2 focus-visible:ring-accent/40'
      )}
      ref={trackRef}
    >
      <div className="flex h-full w-full items-center gap-px">
        {bars.map(({ id, value }, index) => {
          const played = index / bars.length <= clamped;
          return (
            <span
              className={cn(
                'block min-w-[2px] flex-1 rounded-full transition-[colors,height] duration-150',
                played
                  ? 'bg-accent'
                  : isDark
                    ? 'bg-white/20'
                    : 'bg-neutral-900/15'
              )}
              key={id}
              style={{
                height: `${Math.max(10, Math.round((0.14 + value * 0.86) * 100))}%`,
              }}
            />
          );
        })}
      </div>
      {clamped > 0.005 && clamped < 0.995 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_3px_color-mix(in_oklch,var(--color-accent)_22%,transparent)]"
          style={{ left: `calc(${clamped * 100}% - 1px)` }}
        />
      ) : null}
    </div>
  );
}

/**
 * Pure presentational recording card. No store / RPC coupling beyond the
 * media element so it can be reused in read-only previews. When `streamSrc`
 * is supplied the card becomes an interactive player.
 */
export const RecordingContent = ({
  data,
  streamSrc,
  loading = false,
}: {
  data: RecordingRuntimeData;
  streamSrc?: string | null;
  loading?: boolean;
}) => {
  const recording = resolveRecordingData(data);
  const isDark = isColorDark(recording.color);
  const title = getRecordingDisplayTitle(recording, m.menu_new_recording());

  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(recording.duration ?? 0);

  const totalDuration = mediaDuration || recording.duration || 0;
  const progress = totalDuration > 0 ? currentTime / totalDuration : 0;
  const showElapsed = isPlaying || currentTime > 0;
  const clockLabel = showElapsed
    ? `${formatClock(currentTime)} / ${formatClock(totalDuration)}`
    : formatClock(totalDuration);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) {
      return;
    }
    if (el.paused) {
      el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }, []);

  const seekToFraction = useCallback(
    (fraction: number) => {
      const el = audioRef.current;
      if (!(el && totalDuration > 0)) {
        return;
      }
      const next = fraction * totalDuration;
      el.currentTime = next;
      setCurrentTime(next);
    },
    [totalDuration]
  );

  const canPlay = Boolean(streamSrc) && !recording.missing && !loading;

  return (
    <div
      className="flex size-full flex-col gap-3 rounded-2xl px-4 py-3.5"
      style={colorToStyle(recording.color)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={cn(
              'grid size-6 shrink-0 place-items-center rounded-md',
              isDark
                ? 'bg-accent/25 text-accent-strong'
                : 'bg-accent-softer text-accent-strong'
            )}
          >
            <Mic size={13} strokeWidth={2.25} />
          </span>
          <span
            className={cn(
              'truncate font-medium text-[13px] leading-tight',
              isDark ? 'text-neutral-100' : 'text-neutral-800'
            )}
            title={title}
          >
            {title}
          </span>
        </div>
        <span
          className={cn(
            'shrink-0 font-medium text-[12px] tabular-nums tracking-tight',
            isDark ? 'text-neutral-400' : 'text-neutral-500'
          )}
        >
          {clockLabel}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 items-center gap-3">
        <button
          aria-label={
            isPlaying
              ? m.recording_node_pause_aria()
              : m.recording_node_play_aria()
          }
          className={cn(
            'nodrag grid size-11 shrink-0 place-items-center rounded-full transition-[transform,box-shadow,background-color] duration-200',
            recording.missing || !streamSrc
              ? 'cursor-not-allowed opacity-50'
              : 'cursor-pointer hover:scale-[1.04] active:scale-[0.97]',
            isPlaying
              ? 'bg-accent text-accent-foreground shadow-[0_6px_16px_-4px_color-mix(in_oklch,var(--color-accent)_55%,transparent)]'
              : isDark
                ? 'bg-white text-neutral-900 shadow-sm hover:bg-neutral-100'
                : 'bg-neutral-900 text-white shadow-sm hover:bg-neutral-800'
          )}
          disabled={!canPlay}
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          type="button"
        >
          {recording.missing ? (
            <AlertTriangle size={18} />
          ) : loading ? (
            <Loader2 className="animate-spin" size={18} />
          ) : isPlaying ? (
            <Pause fill="currentColor" size={17} />
          ) : (
            <Play className="ml-0.5" fill="currentColor" size={17} />
          )}
        </button>

        <PlaybackWaveform
          interactive={canPlay && totalDuration > 0}
          isDark={isDark}
          onSeek={seekToFraction}
          progress={progress}
          waveform={recording.waveform}
        />
      </div>

      {streamSrc ? (
        <audio
          aria-label={`${title} audio preview`}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) {
              setMediaDuration(d);
            }
          }}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          preload="metadata"
          ref={audioRef}
          src={streamSrc}
        >
          <track
            kind="captions"
            label="Captions unavailable"
            src={EMPTY_CAPTIONS_TRACK_SRC}
            srcLang="en"
          />
        </audio>
      ) : null}
    </div>
  );
};

const RecordingNode = ({
  id,
  data,
}: {
  id: string;
  data: RecordingRuntimeData;
}) => {
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const isRenaming = useCanvasStore((s) => s.renamingNodeId === id);
  const setRenamingNodeId = useCanvasStore((s) => s.setRenamingNodeId);
  const { tag, tagColor, tagColors, tags, dimmedByFilter, tagEditor } =
    useNodeTagEditing(id, data as unknown as Record<string, unknown>);
  const recording = resolveRecordingData(data);
  const isDark = isColorDark(recording.color);
  const title = getRecordingDisplayTitle(recording, m.menu_new_recording());

  const streamKey = [
    recording.previewUrl ?? '',
    recording.attachmentFile ?? '',
    recording.missing ? 'missing' : 'available',
  ].join(':');
  const shouldLoadStream = Boolean(
    !(recording.previewUrl || recording.missing) && recording.attachmentFile
  );
  const [streamState, setStreamState] = useState<{
    key: string;
    loading: boolean;
    src: string | null;
  }>(() => ({
    key: streamKey,
    loading: shouldLoadStream,
    src: recording.previewUrl ?? null,
  }));
  if (streamState.key !== streamKey) {
    setStreamState({
      key: streamKey,
      loading: shouldLoadStream,
      src: recording.previewUrl ?? null,
    });
  }
  const streamSrc =
    streamState.key === streamKey
      ? streamState.src
      : (recording.previewUrl ?? null);
  const loading = streamState.key === streamKey ? streamState.loading : false;

  const renameInputRef = useRef<HTMLInputElement>(null);
  const [renameDraft, setRenameDraft] = useState(title);

  useEffect(() => {
    if (recording.previewUrl) {
      return;
    }
    if (!recording.attachmentFile || recording.missing) {
      return;
    }
    let cancelled = false;
    resolveAttachmentStreamUrl(recording.attachmentFile)
      .then((url) => {
        if (!cancelled) {
          setStreamState((current) =>
            current.key === streamKey
              ? { ...current, loading: false, src: url ?? null }
              : current
          );
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setStreamState((current) =>
            current.key === streamKey ? { ...current, loading: false } : current
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    recording.attachmentFile,
    recording.missing,
    recording.previewUrl,
    streamKey,
  ]);

  useEffect(() => {
    if (!isRenaming) {
      return;
    }
    setRenameDraft(title);
    const frame = requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [isRenaming, title]);

  const commitRename = useCallback(() => {
    const next = renameDraft.trim();
    if (next && next !== recording.title) {
      saveSnapshot();
      updateNodeData(id, { title: next });
    }
    setRenamingNodeId(null);
  }, [
    renameDraft,
    recording.title,
    saveSnapshot,
    updateNodeData,
    id,
    setRenamingNodeId,
  ]);

  return (
    <div
      className={cn(
        'group/recording size-full transition-opacity',
        data.isHidden
          ? 'pointer-events-none opacity-0'
          : dimmedByFilter
            ? 'opacity-30'
            : 'opacity-100'
      )}
    >
      {tagEditor}
      <ResizeHandle
        hoverClassName="group-hover/recording:opacity-100"
        maxHeight={260}
        maxWidth={560}
        minHeight={120}
        minWidth={260}
        nodeId={id}
        onResizeStart={saveSnapshot}
      />

      <NodeHandles />

      <div className="node-visual relative size-full overflow-hidden rounded-2xl bg-neutral-50 shadow-card transition-shadow duration-200 hover:shadow-card-hover dark:bg-neutral-900">
        <RecordingContent data={data} loading={loading} streamSrc={streamSrc} />

        {isRenaming ? (
          <div
            className="absolute inset-x-4 top-3 z-10"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <input
              aria-label={m.a11y_rename_recording()}
              className="w-full rounded-lg border border-black/15 bg-white px-3 py-1.5 font-semibold text-neutral-900 text-sm shadow-md outline-hidden focus:border-accent dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-50"
              onBlur={commitRename}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitRename();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setRenamingNodeId(null);
                }
              }}
              ref={renameInputRef}
              type="text"
              value={renameDraft}
            />
          </div>
        ) : null}

        {tag || (tags && tags.length > 0) ? (
          <div className="pointer-events-none absolute right-3 bottom-2 left-3">
            <NodeTagChips
              isDark={isDark}
              tag={tag}
              tagColor={tagColor}
              tagColors={tagColors}
              tags={tags}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default memo(RecordingNode);
