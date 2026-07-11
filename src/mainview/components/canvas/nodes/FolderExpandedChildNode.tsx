import { useReducedMotion } from 'motion/react';
import * as motion from 'motion/react-m';
import { memo } from 'react';

import { FolderChildPreview } from '@/components/canvas/FolderChildPreview';
import type { FolderExpandedChildData } from '@/lib/folderExpansion';
import { cn } from '@/lib/utils';

const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

function getShapeClass(type: string): string {
  if (type === 'sticky') {
    return 'rounded-sm';
  }
  if (type === 'recording') {
    return 'rounded-2xl';
  }
  return 'rounded-3xl';
}

export interface FolderExpandedChildVisualProps {
  data: FolderExpandedChildData;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
}

/**
 * The visible shared element is rendered by FolderNode inside the folder's
 * middle layer. Keeping it there is the only way CSS can place the moving
 * card between the SVG back and front shells for the entire round trip.
 */
export function FolderExpandedChildVisual({
  data,
  onClick,
}: FolderExpandedChildVisualProps) {
  const shouldReduceMotion = useReducedMotion();
  const returning = data.phase === 'closing';
  const origin = shouldReduceMotion
    ? { x: 0, y: 0, scale: 1, rotate: 0 }
    : {
        x: data.origin.x,
        y: data.origin.y,
        scale: data.origin.scale,
        rotate: data.origin.rotation,
      };
  const expanded = { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 };
  const returningTarget = {
    ...origin,
    opacity: shouldReduceMotion ? 0 : [1, 1, 0],
  };

  return (
    <motion.div
      animate={returning ? returningTarget : expanded}
      className={cn(
        'folder-expanded-child-visual node-visual pointer-events-auto size-full cursor-pointer overflow-hidden border border-black/7 bg-white shadow-card will-change-[transform,opacity] dark:border-white/10 dark:bg-neutral-800',
        getShapeClass(data.child.type)
      )}
      data-folder-child-id={data.child.id}
      initial={{ ...origin, opacity: 1 }}
      onClick={onClick}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      style={{ transformOrigin: 'center center' }}
      transition={{
        duration: shouldReduceMotion ? 0.01 : returning ? 0.32 : 0.42,
        ease: EASE_OUT_QUINT,
        opacity: returning
          ? {
              duration: shouldReduceMotion ? 0.01 : 0.32,
              ease: 'linear',
              times: [0, 0.75, 1],
            }
          : undefined,
      }}
    >
      <FolderChildPreview child={data.child} />
    </motion.div>
  );
}

/**
 * Invisible React Flow node retained only as the collision box/pinned pusher.
 * Rendering the card here would put it in a sibling stacking context, which
 * can only sit wholly in front of or wholly behind the folder SVG.
 */
function FolderExpandedChildNode() {
  return <div aria-hidden="true" className="pointer-events-none size-full" />;
}

export default memo(FolderExpandedChildNode);
