import { Loader2, Play } from 'lucide-react';
import { useRef, useState } from 'react';
import { resolveYouTubePlayerUrl } from '@/lib/rpc';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import * as m from '../../../../../paraglide/messages.js';
import {
  buildYouTubeEmbedUrl,
  type YouTubeVideo,
} from '../../../../../shared/youtube';

type PlaybackState =
  | { status: 'idle' | 'loading' | 'failed' }
  | { status: 'playing'; src: string };

export function YouTubePlayer({
  className,
  isFocused,
  title,
  video,
}: {
  className?: string;
  isFocused: boolean;
  title: string;
  video: YouTubeVideo;
}) {
  const coveredByFocusedView = useCanvasStore(
    (s) => !isFocused && Boolean(s.focusedNode || s.focusedFolder)
  );
  const [playback, setPlayback] = useState<PlaybackState>({
    status: 'idle',
  });
  const [imageError, setImageError] = useState(false);
  const attemptRef = useRef(0);

  // Stop background audio when a focused view covers the canvas player.
  if (coveredByFocusedView && playback.status !== 'idle') {
    attemptRef.current += 1;
    setPlayback({ status: 'idle' });
  }

  const startPlayback = async () => {
    const attempt = ++attemptRef.current;
    setPlayback({ status: 'loading' });
    try {
      const localUrl = await resolveYouTubePlayerUrl(video);
      const isHttpPage =
        window.location.protocol === 'http:' ||
        window.location.protocol === 'https:';
      const src =
        localUrl ??
        (isHttpPage
          ? buildYouTubeEmbedUrl(video, window.location.origin)
          : null);
      if (attemptRef.current === attempt) {
        setPlayback(src ? { status: 'playing', src } : { status: 'failed' });
      }
    } catch {
      if (attemptRef.current === attempt) {
        setPlayback({ status: 'failed' });
      }
    }
  };

  return (
    <div
      className={cn(
        'nodrag nopan nowheel relative min-h-[200px] w-full shrink-0 overflow-hidden bg-black',
        className
      )}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {playback.status === 'playing' && !coveredByFocusedView ? (
        <iframe
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
          referrerPolicy="strict-origin-when-cross-origin"
          src={playback.src}
          title={m.link_youtube_player_title({ title })}
        />
      ) : (
        <button
          aria-label={m.link_play_youtube({ title })}
          className="absolute inset-0 flex size-full cursor-pointer flex-col items-center justify-center gap-3 text-white focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-4px] disabled:cursor-wait"
          disabled={playback.status === 'loading' || coveredByFocusedView}
          onClick={(event) => {
            event.stopPropagation();
            startPlayback().catch(() => undefined);
          }}
          type="button"
        >
          {imageError ? null : (
            <img
              alt=""
              className="absolute inset-0 size-full object-cover opacity-75"
              draggable={false}
              loading="lazy"
              onError={() => setImageError(true)}
              src={`https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`}
            />
          )}
          <span className="relative grid h-12 w-16 place-items-center rounded-2xl bg-red-600 shadow-lg">
            {playback.status === 'loading' ? (
              <Loader2 className="animate-spin" size={24} />
            ) : (
              <Play className="ml-1 fill-current" size={24} />
            )}
          </span>
          {playback.status === 'failed' ? (
            <span className="relative max-w-[90%] rounded-lg bg-black/80 px-3 py-2 text-center text-xs">
              {m.link_youtube_player_unavailable()}
            </span>
          ) : null}
        </button>
      )}
    </div>
  );
}
