import { AlertTriangle, Hash } from 'lucide-react';
import * as m from '../../paraglide/messages.js';
import type { ExtensionPresentation } from '../../shared/extensions/presentation';
import type { ExtensionAvailability } from '../../shared/extensions/protocol';

type FallbackAvailability =
  | ExtensionAvailability
  | 'crashed'
  | 'corrupted'
  | 'incompatible';

/** Single source for the fallback copy shown by canvas, detail and node hosts. */
export function extensionFallbackMessage(
  availability: FallbackAvailability
): string {
  switch (availability) {
    case 'corrupted':
      return m.extension_fallback_corrupted();
    case 'incompatible':
      return m.extension_fallback_incompatible();
    default:
      return m.extension_fallback_unavailable();
  }
}

export function ExtensionFallback({
  availability,
  canvasTypeId,
  message,
  presentation,
}: {
  availability: FallbackAvailability;
  canvasTypeId: string;
  /** Defaults to {@link extensionFallbackMessage} for the availability. */
  message?: string;
  presentation?: ExtensionPresentation;
}) {
  const title = presentation?.title || canvasTypeId;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-3xl border border-black/10 border-dashed p-5 text-center dark:border-white/15">
      {availability === 'unknown' ? (
        <Hash className="opacity-50" size={18} />
      ) : (
        <AlertTriangle className="opacity-50" size={18} />
      )}
      <div className="font-medium text-sm">{title}</div>
      <div className="text-neutral-500 text-xs">
        {message ?? extensionFallbackMessage(availability)}
      </div>
    </div>
  );
}
