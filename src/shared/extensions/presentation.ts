/** Presentation is a host-derived plain-text projection. No HTML. */

export const PRESENTATION_PLAIN_TEXT_MAX = 32 * 1024;
const TITLE_MAX = 256;
const SUBTITLE_MAX = 256;
const ACCENT_COLOR_RE = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const TAG_RE = /<[^>]*>/g;

export interface ExtensionPresentation {
  accentColor?: string;
  accessibilityLabel?: string;
  plainText?: string;
  subtitle?: string;
  title: string;
}

export function stripMarkup(value: string): string {
  return value.replace(TAG_RE, '').replaceAll('&nbsp;', ' ').trim();
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

export function emptyPresentation(title = ''): ExtensionPresentation {
  return { title };
}

export function sanitizePresentation(input: unknown): ExtensionPresentation {
  const record =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const title = clip(
    stripMarkup(typeof record.title === 'string' ? record.title : ''),
    TITLE_MAX
  );

  const presentation: ExtensionPresentation = { title };

  if (typeof record.subtitle === 'string') {
    const subtitle = clip(stripMarkup(record.subtitle), SUBTITLE_MAX);
    if (subtitle) {
      presentation.subtitle = subtitle;
    }
  }

  if (typeof record.plainText === 'string') {
    const plainText = clip(
      stripMarkup(record.plainText),
      PRESENTATION_PLAIN_TEXT_MAX
    );
    if (plainText) {
      presentation.plainText = plainText;
    }
  }

  if (
    typeof record.accentColor === 'string' &&
    ACCENT_COLOR_RE.test(record.accentColor)
  ) {
    presentation.accentColor = record.accentColor;
  }

  if (typeof record.accessibilityLabel === 'string') {
    const accessibilityLabel = clip(
      stripMarkup(record.accessibilityLabel),
      TITLE_MAX
    );
    if (accessibilityLabel) {
      presentation.accessibilityLabel = accessibilityLabel;
    }
  }

  return presentation;
}
