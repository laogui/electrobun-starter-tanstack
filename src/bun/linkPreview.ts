import {
  assertPublicTarget,
  isObviouslyNonPublicHost,
  OutboundTargetError,
} from './net/publicTarget';

/**
 * Lightweight link unfurling. Fetches a remote http(s) document, extracts
 * Open Graph / standard metadata, and returns a small payload that the
 * renderer can use to enrich a `link` node.
 *
 * Safety constraints:
 *   - Only http and https URLs are followed.
 *   - The server is given a short timeout to keep the UI responsive.
 *   - Every hop (including redirects, which are followed manually) is
 *     DNS-resolved and refused unless all addresses are public, to avoid
 *     SSRF against the user's machine / LAN / cloud metadata endpoints.
 *   - Returned image/favicon URLs are restricted to https on public hosts.
 *   - Reading stops at </head> (or after ~1 MiB) so we never buffer
 *     arbitrarily large pages into memory.
 */

const REQUEST_TIMEOUT_MS = 8000;
// Some sites (e.g. YouTube) emit a very large <head> and place their Open
// Graph tags hundreds of KiB into the document, so we read up to 1 MiB before
// giving up. Reading stops early once </head> is seen (see readBoundedText).
const MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 5;
// Present as a mainstream browser. Several sites serve a stripped-down page
// (without OG metadata) to unknown/bot user-agents.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export interface UnfurlResult {
  description?: string;
  faviconUrl?: string;
  imageUrl?: string;
  siteName?: string;
  status: 'ready' | 'failed';
  title?: string;
  url: string;
}

function parseSafeHttpUrl(value: string, base?: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(value, base);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  if (parsed.username || parsed.password) {
    return null;
  }
  if (isObviouslyNonPublicHost(parsed.hostname)) {
    return null;
  }
  return parsed;
}

/**
 * True when `url` passes the shared outbound policy: the hostname must
 * resolve only to public addresses (blocks DNS names pointing at 10/8,
 * 169.254.169.254, ::1, ...). Checked again on every redirect hop.
 */
async function isPublicTarget(url: URL): Promise<boolean> {
  try {
    await assertPublicTarget(url);
    return true;
  } catch (error) {
    if (error instanceof OutboundTargetError) {
      console.warn('[unfurlLink] Refused target:', error.message);
      return false;
    }
    throw error;
  }
}

const TITLE_TAG_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const LINK_ICON_TAG_RE =
  /<link[^>]+rel\s*=\s*["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*>/gi;
const REGEX_ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 10))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    );
}

function readAttribute(tag: string, attribute: string): string | undefined {
  const re = new RegExp(`${attribute}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const match = re.exec(tag);
  if (!match) {
    return;
  }
  return decodeHtmlEntities(match[2] ?? match[3] ?? '').trim() || undefined;
}

function pickMeta(html: string, names: string[]): string | undefined {
  const propertyPatterns = names.map(
    (name) =>
      new RegExp(
        `<meta[^>]*?(?:property|name)\\s*=\\s*["']${name.replace(
          REGEX_ESCAPE_RE,
          '\\$&'
        )}["'][^>]*>`,
        'i'
      )
  );
  for (const propertyRe of propertyPatterns) {
    const tag = html.match(propertyRe)?.[0];
    if (!tag) {
      continue;
    }
    const content = readAttribute(tag, 'content');
    if (content) {
      return content;
    }
  }
  return;
}

export interface ParsedMetadata {
  description?: string;
  faviconUrl?: string;
  imageUrl?: string;
  siteName?: string;
  title?: string;
}

export function parseHtmlMetadata(html: string): ParsedMetadata {
  const meta: ParsedMetadata = {};
  const titleTag = TITLE_TAG_RE.exec(html)?.[1];
  if (titleTag) {
    meta.title = decodeHtmlEntities(titleTag).trim() || undefined;
  }

  meta.title = pickMeta(html, ['og:title', 'twitter:title']) ?? meta.title;
  meta.description = pickMeta(html, [
    'og:description',
    'twitter:description',
    'description',
  ]);
  meta.siteName = pickMeta(html, ['og:site_name', 'application-name']);
  meta.imageUrl = pickMeta(html, ['og:image', 'twitter:image']);

  // Reset lastIndex because the regex is module-scoped and uses the `g` flag.
  LINK_ICON_TAG_RE.lastIndex = 0;
  const linkMatch = LINK_ICON_TAG_RE.exec(html);
  if (linkMatch) {
    meta.faviconUrl = readAttribute(linkMatch[0], 'href');
  }

  return meta;
}

/**
 * Resolve a page-supplied image/favicon URL for the renderer to load. Only
 * https to a non-local host survives: plain http and private hosts are
 * dropped so a preview cannot turn into a LAN probe or a cleartext tracker.
 */
export function resolvePreviewAssetUrl(
  value: string | undefined,
  base: string
): string | undefined {
  if (!value) {
    return;
  }
  let resolved: URL;
  try {
    resolved = new URL(value, base);
  } catch {
    return;
  }
  if (resolved.protocol !== 'https:') {
    return;
  }
  if (resolved.username || resolved.password) {
    return;
  }
  if (isObviouslyNonPublicHost(resolved.hostname)) {
    return;
  }
  return resolved.toString();
}

async function readBoundedText(
  response: Response,
  maxBytes: number
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return await response.text();
  }

  const decoder = new TextDecoder('utf-8', { fatal: false });
  let text = '';
  let total = 0;
  while (total < maxBytes) {
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    total += value.byteLength;
    text += decoder.decode(value, { stream: true });
    // Metadata lives in <head>; once it closes there is nothing left worth
    // parsing, so stop early instead of buffering the rest of the document.
    if (text.includes('</head>')) {
      break;
    }
  }
  text += decoder.decode();
  try {
    await reader.cancel();
  } catch {
    // Reader was already finished.
  }

  return text;
}

export async function unfurlLink(rawUrl: string): Promise<UnfurlResult> {
  let parsed = parseSafeHttpUrl(rawUrl);
  if (!parsed) {
    return { url: rawUrl, status: 'failed' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    for (
      let redirectCount = 0;
      redirectCount <= MAX_REDIRECTS;
      redirectCount += 1
    ) {
      if (!(await isPublicTarget(parsed))) {
        return { url: rawUrl, status: 'failed' };
      }
      const response = await fetch(parsed.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': USER_AGENT,
          accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          return { url: rawUrl, status: 'failed' };
        }
        const nextUrl = parseSafeHttpUrl(location, parsed.toString());
        if (!nextUrl) {
          return { url: rawUrl, status: 'failed' };
        }
        parsed = nextUrl;
        continue;
      }

      if (!response.ok) {
        return { url: rawUrl, status: 'failed' };
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType && !contentType.toLowerCase().includes('html')) {
        return { url: rawUrl, status: 'failed' };
      }
      const html = await readBoundedText(response, MAX_BYTES);
      const meta = parseHtmlMetadata(html);

      const imageUrl = resolvePreviewAssetUrl(meta.imageUrl, parsed.toString());
      const faviconUrl = resolvePreviewAssetUrl(
        meta.faviconUrl,
        parsed.toString()
      );
      const result = {
        url: rawUrl,
        status: 'ready' as const,
        ...(meta.title ? { title: meta.title } : {}),
        ...(meta.description ? { description: meta.description } : {}),
        ...(meta.siteName ? { siteName: meta.siteName } : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(faviconUrl ? { faviconUrl } : {}),
      };
      return result;
    }
    console.warn('[unfurlLink] Too many redirects for', rawUrl);
    return { url: rawUrl, status: 'failed' };
  } catch (error) {
    console.warn('[unfurlLink] Failed to unfurl', rawUrl, ':', error);
    return { url: rawUrl, status: 'failed' };
  } finally {
    clearTimeout(timer);
  }
}
