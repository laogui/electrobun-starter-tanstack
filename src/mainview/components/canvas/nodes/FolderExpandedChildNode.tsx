import { useReducedMotion } from 'motion/react';
import * as motion from 'motion/react-m';
import { memo } from 'react';

import { FolderChildPreview } from '@/components/canvas/FolderChildPreview';
import { isFocusableNode } from '@/lib/canvasNodePredicates';
import {
  type FolderExpandedChildData,
  getFolderChildShapeClass,
  getFolderThumbnailContentTransform,
} from '@/lib/folderExpansion';
import { cn } from '@/lib/utils';

const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

export interface FolderExpandedChildVisualProps {
  data: FolderExpandedChildData;
  onAnimationComplete?: () => void;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
}

/**
 * The visible shared element is rendered by FolderNode inside the folder's
 * middle layer. Keeping it there is the only way CSS can place the moving
 * card between the SVG back and front shells for the entire round trip.
 *
 * Origin frame matches the closed-stack thumbnail (same size, scale→rotate
 * order, border, radius, shadow). During close the static stack is already
 * visible underneath, so unmounting this layer is a visual no-op.
 */
export function FolderExpandedChildVisual({
  data,
  onAnimationComplete,
  onClick,
}: FolderExpandedChildVisualProps) {
  const shouldReduceMotion = useReducedMotion();
  const returning = data.phase === 'closing';
  const origin = shouldReduceMotion
    ? {
        x: 0,
        y: 0,
        opacity: data.origin.kind === 'hidden' ? 0 : 1,
        scaleX: 1,
        scaleY: 1,
        rotate: 0,
      }
    : {
        x: data.origin.x,
        y: data.origin.y,
        opacity: data.origin.opacity,
        scaleX: data.origin.scaleX,
        scaleY: data.origin.scaleY,
        rotate: data.origin.rotation,
      };
  const expanded = {
    x: 0,
    y: 0,
    opacity: 1,
    scaleX: 1,
    scaleY: 1,
    rotate: 0,
  };
  const thumbnailContent = getFolderThumbnailContentTransform({
    scaleX: data.origin.scaleX,
    scaleY: data.origin.scaleY,
  });
  const originContent = shouldReduceMotion
    ? { scaleX: 1, width: '100%' }
    : {
        scaleX: thumbnailContent.scaleX,
        width: `${thumbnailContent.widthPercent}%`,
      };
  const expandedContent = { scaleX: 1, width: '100%' };
  const transition = {
    delay: shouldReduceMotion
      ? 0
      : returning
        ? (data.motionCount - 1 - data.motionOrder) * 0.015
        : data.motionOrder * 0.018,
    duration: shouldReduceMotion ? 0.01 : returning ? 0.3 : 0.38,
    ease: EASE_OUT_QUINT,
  };

  const focusable = isFocusableNode(data.child.type);

  return (
    <motion.div
      animate={returning ? origin : expanded}
      className={cn(
        'folder-expanded-child-visual node-visual pointer-events-auto size-full overflow-hidden border border-black/7 bg-white shadow-card will-change-transform dark:border-white/10 dark:bg-neutral-800',
        focusable ? 'cursor-pointer' : 'cursor-default',
        getFolderChildShapeClass(data.child.type)
      )}
      data-folder-child-id={data.child.id}
      initial={origin}
      onAnimationComplete={() => {
        if (!returning) {
          return;
        }
        // Paint the final origin frame over the already-visible static stack
        // before tearing the expansion layer down, so React unmount cannot
        // land on a half-composited Motion frame.
        requestAnimationFrame(() => {
          onAnimationComplete?.();
        });
      }}
      onClick={focusable ? onClick : undefined}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      style={{ transformOrigin: 'center center' }}
      // Keep Motion's default prop order (translate → scale → rotate) so the
      // landing frame matches getFolderThumbnailTransformFromOrigin.
      transition={transition}
    >
      <motion.div
        animate={returning ? originContent : expandedContent}
        className="h-full"
        initial={originContent}
        style={{ transformOrigin: 'left center' }}
        transition={transition}
      >
        <FolderChildPreview child={data.child} />
      </motion.div>
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
