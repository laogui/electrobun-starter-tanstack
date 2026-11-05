import { useUpdateNodeInternals } from '@xyflow/react';
import {
  type CSSProperties,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { nodeRenderPropsEqual } from '@/lib/nodeRenderPropsEqual';

import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../../paraglide/messages.js';
import { NodeHandles } from './_shared/NodeHandles';
import { ResizeHandle } from './_shared/ResizeHandle';

export interface GroupData {
  active?: boolean;
  color?: string;
  isHidden?: boolean;
  label?: string;
}

export interface GroupContentProps {
  /** Slot for Handles / resize control when wrapped inside a React Flow node. */
  children?: React.ReactNode;
  data: GroupData;
  /** Whether the wrapper node is being dragged (grabbing cursor). */
  dragging?: boolean;
  /** Enables contentEditable on the label. */
  editingLabel?: boolean;
  /** Ref forwarded to the contentEditable label element. */
  labelRef?: React.Ref<HTMLDivElement>;
  /** Blur handler for the label (ignored unless `editingLabel`). */
  onLabelBlur?: () => void;
  /** Double-click handler to enter edit mode (caller must flip `editingLabel`). */
  onLabelDoubleClick?: (e: React.MouseEvent) => void;
  /** Whether the wrapper node is selected (keeps the drag grip visible). */
  selected?: boolean;
}

function isCustomGroupColor(color: string | undefined): color is string {
  return typeof color === 'string' && color.startsWith('#');
}

/** Named tints map to CSS classes; a hex from the picker uses `group-custom`. */
function groupColorClass(color: string | undefined): string {
  return isCustomGroupColor(color)
    ? 'group-custom'
    : `group-${color || 'blue'}`;
}

function groupColorStyle(color: string | undefined): CSSProperties | undefined {
  return isCustomGroupColor(color)
    ? ({ '--group-custom': color } as CSSProperties)
    : undefined;
}

/**
 * Pure presentational group container: the translucent colored panel plus the
 * label in the top-left. No store / RPC coupling — reusable for template
 * previews. The `children` slot receives handles and resize controls from the
 * wrapper component.
 *
 * Selection and drop-target highlighting are styled centrally in `index.css`
 * (`.node-visual` / `.node-drop-target`), the same rule every node kind uses.
 */
export const GroupContent = ({
  data,
  selected = false,
  dragging = false,
  editingLabel = false,
  labelRef,
  onLabelBlur,
  onLabelDoubleClick,
  children,
}: GroupContentProps) => (
  <div
    className={cn(
      `group/group-node node-visual canvas-group ${groupColorClass(data.color)} size-full transition-opacity duration-200 ease-out`,
      dragging ? 'cursor-grabbing' : 'cursor-grab',
      data.active && 'node-drop-target',
      data.isHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
    )}
    style={groupColorStyle(data.color)}
  >
    {children}

    <div className="absolute top-0 left-0 flex items-center gap-1.5 px-3 pt-2">
      <div
        className={cn(
          'nodrag nopan font-semibold text-xs tracking-wide outline-hidden',
          'text-gray-600 dark:text-gray-200',
          editingLabel && 'rounded-sm px-0.5 ring-1 ring-accent/40'
        )}
        contentEditable={editingLabel}
        onBlur={onLabelBlur}
        onDoubleClick={onLabelDoubleClick}
        ref={labelRef}
        suppressContentEditableWarning
      >
        {data.label}
      </div>
      <span
        aria-hidden="true"
        className={cn(
          'text-gray-300 text-xs transition-opacity duration-150 dark:text-gray-500',
          selected || editingLabel
            ? 'opacity-100'
            : 'opacity-0 group-hover/group-node:opacity-100'
        )}
      >
        ⋮⋮
      </span>
    </div>
  </div>
);

const GroupNode = ({
  id,
  data,
  selected,
  dragging = false,
}: {
  id: string;
  data: GroupData;
  selected?: boolean;
  dragging?: boolean;
}) => {
  const [editingLabel, setEditingLabel] = useState(false);
  const labelRef = useRef<HTMLDivElement>(null);
  const onUpdate = useCanvasStore((s) => s.commitNodeData);
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    const frameId = globalThis.requestAnimationFrame(() => {
      updateNodeInternals(id);
    });

    return () => {
      globalThis.cancelAnimationFrame(frameId);
    };
  }, [id, updateNodeInternals]);

  const handleBlur = useCallback(() => {
    const text =
      labelRef.current?.textContent?.trim() || m.default_group_label();
    if (text !== data.label) {
      onUpdate(id, { label: text });
    }
    setEditingLabel(false);
  }, [id, data.label, onUpdate]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingLabel(true);
    setTimeout(() => labelRef.current?.focus(), 10);
  }, []);

  return (
    <GroupContent
      data={data}
      dragging={dragging}
      editingLabel={editingLabel}
      labelRef={labelRef}
      onLabelBlur={handleBlur}
      onLabelDoubleClick={handleDoubleClick}
      selected={selected}
    >
      <ResizeHandle
        hoverClassName="group-hover/group-node:opacity-100"
        minHeight={200}
        minWidth={300}
        nodeId={id}
        onResizeStart={saveSnapshot}
      />

      <NodeHandles />
    </GroupContent>
  );
};

export default memo(GroupNode, nodeRenderPropsEqual);
