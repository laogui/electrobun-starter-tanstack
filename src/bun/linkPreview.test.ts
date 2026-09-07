import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isPrivateOrLocalHost,
  parseHtmlMetadata,
  unfurlLink,
} from './linkPreview';

describe('isPrivateOrLocalHost', () => {
  it('flags loopback hostnames', () => {
    expect(isPrivateOrLocalHost('localhost')).toBe(true);
    expect(isPrivateOrLocalHost('LOCALHOST')).toBe(true);
    expect(isPrivateOrLocalHost('foo.localhost')).toBe(true);
    expect(isPrivateOrLocalHost('printer.local')).toBe(true);
  });

  it('flags loopback and private IPv4 ranges', () => {
    expect(isPrivateOrLocalHost('127.0.0.1')).toBe(true);
    expect(isPrivateOrLocalHost('10.0.0.5')).toBe(true);
    expect(isPrivateOrLocalHost('192.168.1.1')).toBe(true);
    expect(isPrivateOrLocalHost('172.16.0.1')).toBe(true);
    expect(isPrivateOrLocalHost('169.254.10.10')).toBe(true);
    expect(isPrivateOrLocalHost('0.0.0.0')).toBe(true);
  });

  it('allows public IPv4 addresses', () => {
    expect(isPrivateOrLocalHost('8.8.8.8')).toBe(false);
    expect(isPrivateOrLocalHost('142.250.190.78')).toBe(false);
  });

  it('flags loopback and unique-local IPv6 addresses', () => {
    expect(isPrivateOrLocalHost('::1')).toBe(true);
    expect(isPrivateOrLocalHost('[::1]')).toBe(true);
    expect(isPrivateOrLocalHost('fc00::1')).toBe(true);
    expect(isPrivateOrLocalHost('fd12:3456::1')).toBe(true);
    expect(isPrivateOrLocalHost('fe80::1')).toBe(true);
    expect(isPrivateOrLocalHost('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrLocalHost('[::ffff:7f00:1]')).toBe(true);
  });

  it('does not treat public hostnames as IPv6 literals', () => {
    expect(isPrivateOrLocalHost('fdroid.org')).toBe(false);
    expect(isPrivateOrLocalHost('fc.example.com')).toBe(false);
  });
});

describe('parseHtmlMetadata', () => {
  it('extracts the document title and meta description', () => {
    const html = `
      <html>
        <head>
          <title>Example</title>
          <meta name="description" content="A neat thing." />
        </head>
      </html>`;
    expect(parseHtmlMetadata(html)).toMatchObject({
      title: 'Example',
      description: 'A neat thing.',
    });
  });

  it('prefers Open Graph metadata when present', () => {
    const html = `
      <html>
        <head>
          <title>Fallback</title>
          <meta property="og:title" content="OG Title" />
          <meta property="og:site_name" content="Example" />
          <meta property="og:image" content="https://cdn.example.com/cover.png" />
          <link rel="icon" href="/favicon.ico" />
        </head>
      </html>`;
    expect(parseHtmlMetadata(html)).toMatchObject({
      title: 'OG Title',
      siteName: 'Example',
      imageUrl: 'https://cdn.example.com/cover.png',
      faviconUrl: '/favicon.ico',
    });
  });

  it('decodes HTML entities in titles', () => {
    const html = '<head><title>Caf&eacute; &amp; Co</title></head>';
    // The decoder handles a small set of named entities. &eacute; is preserved
    // because it is not in the small allowlist; what we care about is that &amp; works.
    expect(parseHtmlMetadata(html).title).toContain('& Co');
  });
});

describe('unfurlLink', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('rejects non-http(s) protocols without making a network call', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await unfurlLink('javascript:alert(1)');
    expect(result.status).toBe('failed');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects private/local hostnames without making a network call', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await unfurlLink('http://192.168.1.1/admin');
    expect(result.status).toBe('failed');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects bracketed IPv6 loopback hosts without making a network call', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await unfurlLink('http://[::1]/admin');
    expect(result.status).toBe('failed');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects redirects to private/local hosts', async () => {
    const response = Response.json('http://127.0.0.1/admin', { status: 302 });
    const fetchSpy = vi.fn(async () => response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await unfurlLink('https://example.com/redirect');
    expect(result.status).toBe('failed');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns parsed metadata for a successful fetch', async () => {
    const html = `<!doctype html>
      <html>
        <head>
          <title>Example Domain</title>
          <meta name="description" content="An example page." />
          <meta property="og:image" content="/cover.png" />
          <link rel="icon" href="/favicon.ico" />
        </head>
      </html>`;
    const response = new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
    globalThis.fetch = vi.fn(async () => response) as unknown as typeof fetch;

    const result = await unfurlLink('https://example.com/');
    expect(result).toMatchObject({
      status: 'ready',
      url: 'https://example.com/',
      title: 'Example Domain',
      description: 'An example page.',
      imageUrl: 'https://example.com/cover.png',
      faviconUrl: 'https://example.com/favicon.ico',
    });
  });

  it('extracts og metadata located deep inside a large head', async () => {
    // Mimic sites (e.g. YouTube) that emit a very large <head> and place their
    // Open Graph tags hundreds of KiB into the document.
    const filler = `<meta name="x" content="${'a'.repeat(700 * 1024)}" />`;
    const html = `<!doctype html><html><head>${filler}<meta property="og:title" content="Deep Title" /><meta property="og:description" content="Deep description." /><meta property="og:image" content="https://cdn.example.com/deep.png" /></head><body>ignored</body></html>`;
    const response = new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
    globalThis.fetch = vi.fn(async () => response) as unknown as typeof fetch;

    const result = await unfurlLink('https://example.com/');
    expect(result).toMatchObject({
      status: 'ready',
      title: 'Deep Title',
      description: 'Deep description.',
      imageUrl: 'https://cdn.example.com/deep.png',
    });
  });

  it('stops reading the body once the head closes', async () => {
    const encoder = new TextEncoder();
    let chunkIndex = 0;
    let readPastHead = false;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          chunkIndex += 1;
          if (chunkIndex === 1) {
            controller.enqueue(
              encoder.encode(
                '<!doctype html><html><head><title>Early Stop</title></head>'
              )
            );
            return;
          }
          // Reading should have stopped after the first chunk closed the head.
          readPastHead = true;
          controller.enqueue(encoder.encode('<body>more</body>'));
          controller.close();
        },
      },
      // Disable prefetch so `pull` is only invoked when our reader asks for the
      // next chunk; otherwise the stream proactively buffers a second chunk.
      { highWaterMark: 0 }
    );
    const response = new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
    globalThis.fetch = vi.fn(async () => response) as unknown as typeof fetch;

    const result = await unfurlLink('https://example.com/');
    expect(result).toMatchObject({ status: 'ready', title: 'Early Stop' });
    expect(readPastHead).toBe(false);
  });

  it('returns failed when the response is not html', async () => {
    const response = new Response('hello', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
    globalThis.fetch = vi.fn(async () => response) as unknown as typeof fetch;

    const result = await unfurlLink('https://example.com/data.txt');
    expect(result.status).toBe('failed');
  });

  it('returns failed when the response is not OK', async () => {
    const response = new Response('not found', {
      status: 404,
      headers: { 'content-type': 'text/html' },
    });
    globalThis.fetch = vi.fn(async () => response) as unknown as typeof fetch;

    const result = await unfurlLink('https://example.com/missing');
    expect(result.status).toBe('failed');
  });

  it('returns failed when the network request rejects', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('network unavailable');
    }) as unknown as typeof fetch;

    const result = await unfurlLink('https://offline.invalid/evidence');
    expect(result).toMatchObject({
      status: 'failed',
      url: 'https://offline.invalid/evidence',
    });
  });
});
