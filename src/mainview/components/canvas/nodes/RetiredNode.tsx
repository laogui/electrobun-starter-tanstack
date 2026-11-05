import { memo } from 'react';

import { ExtensionFallback } from '@/extensions/ExtensionFallback';

/**
 * Placeholder for node types that were removed from the product (legacy
 * widgets and recordings whose migration could not run). The canvas loader
 * converts these on load; this only renders what is left over, so the node
 * stays visible and deletable instead of falling back to React Flow's empty
 * default node.
 */
function RetiredNodeComponent({
  data,
  type,
}: {
  data?: Record<string, unknown>;
  type?: string;
}) {
  const title = typeof data?.title === 'string' ? data.title : '';
  return (
    <div className="size-full rounded-3xl bg-white dark:bg-neutral-900">
      <ExtensionFallback
        availability="unknown"
        canvasTypeId={type ?? 'unknown'}
        presentation={{ title }}
      />
    </div>
  );
}

export const RetiredNode = memo(RetiredNodeComponent);
RetiredNode.displayName = 'RetiredNode';
