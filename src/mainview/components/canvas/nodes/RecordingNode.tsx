import { AlertTriangle, Loader2, Pause, Play } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
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
const DEFAULT_WAVEFORM_BARS = Array.from(
  { length: WAVEFORM_BAR_COUNT },
  (_, index) => ({ id: `default-waveform-${index}`, value: 0.18 })
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
 * Voice-memo style waveform. Bars left of the playhead read as "played"
 * (solid, accent-tinted); bars to the right are dimmed. A red playhead line
 * marks the current position. `progress` is a 0..1 fraction.
 */
function PlaybackWaveform({
  waveform,
  progress,
  isDark,
}: {
  waveform: number[] | undefined;
  progress: number;
  isDark: boolean;
}) {
  const bars =
    waveform && waveform.length > 0
      ? waveform.map((value, index) => ({
          id: `waveform-${index}`,
          value,
        }))
      : DEFAULT_WAVEFORM_BARS;
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <div className="relative flex h-full min-w-0 flex-1 items-center">
      <div className="flex h-full w-full items-center gap-[2px]">
        {bars.map(({ id, value }, index) => {
          const played = index / bars.length < clamped;
          return (
            <span
              className={cn(
                'block min-w-[2px] flex-1 rounded-full transition-colors',
                played
                  ? isDark
                    ? 'bg-neutral-100'
                    : 'bg-neutral-900'
                  : isDark
                    ? 'bg-neutral-100/25'
                    : 'bg-neutral-900/20'
              )}
              key={id}
              style={{
                height: `${Math.max(8, Math.round((0.18 + value * 0.82) * 100))}%`,
              }}
            />
          );
        })}
      </div>
      {clamped > 0 && clamped < 1 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 bottom-0 w-[2px] rounded-full bg-red-500"
          style={{ left: `${clamped * 100}%` }}
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
  const clock = isPlaying || currentTime > 0 ? currentTime : totalDuration;

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

  return (
    <div
      className="flex size-full flex-col gap-2 rounded-2xl px-5 py-4"
      style={colorToStyle(recording.color)}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            'truncate font-medium text-2xs uppercase tracking-wide',
            isDark ? 'text-neutral-300' : 'text-neutral-400'
          )}
          title={title}
        >
          {title}
        </span>
        <span
          className={cn(
            'shrink-0 font-medium text-2xs tabular-nums tracking-wide',
            isDark ? 'text-neutral-300' : 'text-neutral-400'
          )}
        >
          {formatClock(clock)}
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
            'nodrag grid size-9 shrink-0 place-items-center rounded-full transition-colors',
            recording.missing
              ? 'cursor-not-allowed opacity-50'
              : 'cursor-pointer',
            isDark
              ? 'bg-neutral-100 text-neutral-900 hover:bg-white'
              : 'bg-neutral-900 text-neutral-50 hover:bg-neutral-700'
          )}
          disabled={recording.missing || !streamSrc}
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          type="button"
        >
          {recording.missing ? (
            <AlertTriangle size={16} />
          ) : loading ? (
            <Loader2 className="animate-spin" size={16} />
          ) : isPlaying ? (
            <Pause fill="currentColor" size={15} />
          ) : (
            <Play className="ml-0.5" fill="currentColor" size={15} />
          )}
        </button>

        <PlaybackWaveform
          isDark={isDark}
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
              aria-label="Rename recording"
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
