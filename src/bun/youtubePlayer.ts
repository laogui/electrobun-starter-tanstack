import { buildYouTubeEmbedUrl, isYouTubeVideoId } from '../shared/youtube';

/** Give packaged views:// renderers an HTTP parent that sends a Referer. */
export function serveYouTubePlayer(req: Request, url: URL): Response {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }
  const videoId = url.searchParams.get('videoId') ?? '';
  const startSeconds = Number(url.searchParams.get('start') ?? '0');
  if (
    !(isYouTubeVideoId(videoId) && Number.isSafeInteger(startSeconds)) ||
    startSeconds < 0
  ) {
    return new Response('Invalid video', { status: 400 });
  }
  const embedUrl = buildYouTubeEmbedUrl(
    { videoId, startSeconds },
    url.origin
  ).replaceAll('&', '&amp;');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>YouTube</title>
  <style>html,body,iframe{margin:0;width:100%;height:100%;border:0;background:#000}iframe{display:block}</style>
</head>
<body>
  <iframe src="${embedUrl}" title="YouTube" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
</body>
</html>`;
  return new Response(req.method === 'HEAD' ? null : html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      // Send only the local origin to YouTube, never the launch token.
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; frame-src https://www.youtube-nocookie.com; base-uri 'none'; form-action 'none'",
    },
  });
}
