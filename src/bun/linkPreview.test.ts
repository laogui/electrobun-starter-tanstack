import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lookupMock = vi.hoisted(() => vi.fn());
vi.mock('node:dns/promises', () => ({ lookup: lookupMock }));

const { resolvePreviewAssetUrl, unfurlLink } = await import('./linkPreview');

const fetchMock = vi.fn();

function html(head: string): Response {
  return new Response(`<html><head>${head}</head><body></body></html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
    status: 200,
  });
}

function redirect(location: string): Response {
  return new Response(null, { headers: { location }, status: 302 });
}

beforeEach(() => {
  lookupMock.mockReset();
  lookupMock.mockImplementation(async (hostname: string) => {
    if (hostname === 'internal.example') {
      return [{ address: '10.0.0.7', family: 4 }];
    }
    if (hostname === 'metadata.example') {
      return [{ address: '169.254.169.254', family: 4 }];
    }
    return [{ address: '93.184.216.34', family: 4 }];
  });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('unfurlLink SSRF policy', () => {
  it('refuses a public-looking name that resolves to a private address', async () => {
    const result = await unfurlLink('https://internal.example/page');
    expect(result.status).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses literal private and loopback targets', async () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/',
      'http://localhost:8080/',
    ]) {
      expect((await unfurlLink(url)).status).toBe('failed');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-checks DNS on every redirect hop', async () => {
    fetchMock.mockResolvedValueOnce(
      redirect('https://metadata.example/latest/meta-data')
    );
    const result = await unfurlLink('https://public.example/start');
    expect(result.status).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
    expect(lookupMock).toHaveBeenCalledWith('metadata.example', { all: true });
  });

  it('follows a redirect between public hosts', async () => {
    fetchMock
      .mockResolvedValueOnce(redirect('https://www.public.example/final'))
      .mockResolvedValueOnce(html('<title>Final</title>'));
    const result = await unfurlLink('https://public.example/start');
    expect(result).toMatchObject({ status: 'ready', title: 'Final' });
  });
});

describe('preview asset URLs', () => {
  it('keeps https images and favicons and drops http ones', async () => {
    fetchMock.mockResolvedValueOnce(
      html(
        '<meta property="og:image" content="http://cdn.example/track.png">' +
          '<link rel="icon" href="/favicon.ico">'
      )
    );
    const result = await unfurlLink('https://public.example/');
    expect(result.status).toBe('ready');
    expect(result.imageUrl).toBeUndefined();
    expect(result.faviconUrl).toBe('https://public.example/favicon.ico');
  });

  it('drops non-https and private-host asset URLs', () => {
    const base = 'https://public.example/';
    expect(resolvePreviewAssetUrl('https://cdn.example/a.png', base)).toBe(
      'https://cdn.example/a.png'
    );
    expect(resolvePreviewAssetUrl('http://cdn.example/a.png', base)).toBe(
      undefined
    );
    expect(resolvePreviewAssetUrl('data:image/png;base64,AAAA', base)).toBe(
      undefined
    );
    expect(resolvePreviewAssetUrl('https://192.168.1.1/x.png', base)).toBe(
      undefined
    );
    expect(resolvePreviewAssetUrl('https://router.local/x.png', base)).toBe(
      undefined
    );
  });
});
