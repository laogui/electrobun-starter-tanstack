const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const TIMESTAMP_RE = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i;
const SECONDS_RE = /^\d+$/;
const VIDEO_PATH_RE = /^\/(?:embed|shorts|live|v)\/([^/]+)\/?$/;
const SHORT_URL_PATH_RE = /^\/([^/]+)\/?$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
]);
const EMBED_HOSTS = new Set([
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

export interface YouTubeVideo {
  startSeconds: number;
  videoId: string;
}

export function isYouTubeVideoId(value: string): boolean {
  return VIDEO_ID_RE.test(value);
}

function parseStartSeconds(value: string | null): number {
  if (!value) {
    return 0;
  }
  if (SECONDS_RE.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : 0;
  }
  const match = TIMESTAMP_RE.exec(value);
  if (!match) {
    return 0;
  }
  const seconds =
    Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0);
  return Number.isSafeInteger(seconds) ? seconds : 0;
}

/** Parse only YouTube video URLs; arbitrary hosts and channel links stay links. */
export function parseYouTubeVideo(url: string): YouTubeVideo | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    return null;
  }

  const host = parsed.hostname;
  let videoId: string | undefined | null;
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    videoId = SHORT_URL_PATH_RE.exec(parsed.pathname)?.[1];
  } else if (YOUTUBE_HOSTS.has(host)) {
    videoId =
      parsed.pathname === '/watch'
        ? parsed.searchParams.get('v')
        : VIDEO_PATH_RE.exec(parsed.pathname)?.[1];
  } else if (EMBED_HOSTS.has(host) && parsed.pathname.startsWith('/embed/')) {
    videoId = VIDEO_PATH_RE.exec(parsed.pathname)?.[1];
  }
  if (!(videoId && isYouTubeVideoId(videoId))) {
    return null;
  }

  const hashParams = new URLSearchParams(parsed.hash.slice(1));
  return {
    videoId,
    startSeconds: parseStartSeconds(
      parsed.searchParams.get('t') ??
        parsed.searchParams.get('start') ??
        hashParams.get('t')
    ),
  };
}

export function buildYouTubeEmbedUrl(
  video: YouTubeVideo,
  origin: string
): string {
  const url = new URL(
    `https://www.youtube-nocookie.com/embed/${video.videoId}`
  );
  url.searchParams.set('autoplay', '1');
  url.searchParams.set('playsinline', '1');
  url.searchParams.set('origin', origin);
  if (video.startSeconds > 0) {
    url.searchParams.set('start', String(video.startSeconds));
  }
  return url.toString();
}
