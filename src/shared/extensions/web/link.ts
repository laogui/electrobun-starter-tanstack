import { type ExtensionPresentation, emptyPresentation } from '../presentation';

export interface LinkState {
  color: string;
  description?: string;
  faviconUrl?: string;
  imageUrl?: string;
  siteName?: string;
  title: string;
  unfurlError?: string;
  unfurlStatus?: 'idle' | 'loading' | 'ready' | 'failed';
  url: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function createLinkInitialState(): LinkState {
  return { url: '', title: '', color: '#FFFFFF' };
}

export function isLinkState(value: unknown): value is LinkState {
  return isRecord(value) && typeof value.url === 'string';
}

export function normalizeLinkState(value: unknown): LinkState {
  const defaults = createLinkInitialState();
  if (!isLinkState(value)) {
    return defaults;
  }
  return {
    url: value.url,
    title: typeof value.title === 'string' ? value.title : '',
    color: typeof value.color === 'string' ? value.color : defaults.color,
    ...(typeof value.description === 'string'
      ? { description: value.description }
      : {}),
    ...(typeof value.faviconUrl === 'string'
      ? { faviconUrl: value.faviconUrl }
      : {}),
    ...(typeof value.imageUrl === 'string' ? { imageUrl: value.imageUrl } : {}),
    ...(typeof value.siteName === 'string' ? { siteName: value.siteName } : {}),
    ...(typeof value.unfurlError === 'string'
      ? { unfurlError: value.unfurlError }
      : {}),
    ...(value.unfurlStatus === 'idle' ||
    value.unfurlStatus === 'loading' ||
    value.unfurlStatus === 'ready' ||
    value.unfurlStatus === 'failed'
      ? { unfurlStatus: value.unfurlStatus }
      : {}),
  };
}

export function buildLinkPresentation(state: LinkState): ExtensionPresentation {
  const title =
    state.title.trim() || state.siteName?.trim() || state.url || 'Link';
  return {
    ...emptyPresentation(title),
    subtitle: state.url || undefined,
    plainText: [title, state.url, state.description ?? '']
      .filter(Boolean)
      .join('\n'),
    accessibilityLabel: title,
  };
}

export function linkStateFromNodeData(
  data: Record<string, unknown>
): LinkState {
  return normalizeLinkState(data);
}
