import { AlertTriangle, Hash } from 'lucide-react';
import type { ExtensionPresentation } from '../../shared/extensions/presentation';
import type { ExtensionAvailability } from '../../shared/extensions/protocol';

export function ExtensionFallback({
  availability,
  canvasTypeId,
  message,
  onEnable,
  presentation,
}: {
  availability:
    | ExtensionAvailability
    | 'crashed'
    | 'corrupted'
    | 'incompatible';
  canvasTypeId: string;
  message: string;
  onEnable?: () => void;
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
      <div className="text-neutral-500 text-xs">{message}</div>
      {availability === 'disabled' && onEnable ? (
        <button
          className="nodrag nopan mt-1 rounded-full border border-black/10 px-3 py-1 text-xs dark:border-white/15"
          onClick={onEnable}
          type="button"
        >
          Enable
        </button>
      ) : null}
    </div>
  );
}
