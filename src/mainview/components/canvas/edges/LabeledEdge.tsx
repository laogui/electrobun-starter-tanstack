import type { EdgeProps } from '@xyflow/react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
} from '@xyflow/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

function LabeledEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerStart,
  markerEnd,
  data,
  selected,
}: EdgeProps) {
  const label = (data?.label as string) ?? '';
  const animated = (data?.animated as boolean) ?? false;
  const pathType = (data?.pathType as 'smoothstep' | 'bezier') ?? 'bezier';
  const reverseVisualDirection =
    (data?.reverseVisualDirection as boolean) ?? false;
  const editingEdgeId = useCanvasStore((s) => s.editingEdgeId);
  const setEditingEdgeId = useCanvasStore((s) => s.setEditingEdgeId);
  const commitEdgeData = useCanvasStore((s) => s.commitEdgeData);
  const isEditing = editingEdgeId === id;

  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setDraft(label);
      // Focus after render
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isEditing, label]);

  const commitLabel = useCallback(() => {
    const trimmed = draft.trim();
    const next = trimmed || undefined;
    if (next !== label) {
      commitEdgeData(id, { label: next });
    }
    setEditingEdgeId(null);
  }, [draft, id, label, commitEdgeData, setEditingEdgeId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitLabel();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setEditingEdgeId(null);
      }
    },
    [commitLabel, setEditingEdgeId]
  );

  const handleLabelDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingEdgeId(id);
    },
    [id, setEditingEdgeId]
  );

  const pathParams = reverseVisualDirection
    ? {
        sourceX: targetX,
        sourceY: targetY,
        targetX: sourceX,
        targetY: sourceY,
        sourcePosition: targetPosition,
        targetPosition: sourcePosition,
      }
    : {
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
      };

  const [edgePath, labelX, labelY] =
    pathType === 'bezier'
      ? getBezierPath(pathParams)
      : getSmoothStepPath(pathParams);

  return (
    <>
      <BaseEdge
        className={cn(
          'transition-[stroke-width] duration-150',
          animated && 'react-flow__edge-animated-dash',
          selected && 'stroke-blue-500!'
        )}
        id={id}
        markerEnd={markerEnd}
        markerStart={markerStart}
        path={edgePath}
        style={{
          strokeWidth: selected ? 2.5 : 1.5,
          stroke: selected ? undefined : 'var(--xy-edge-stroke, #b1b1b7)',
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            zIndex: 1,
          }}
        >
          {isEditing ? (
            <input
              className="rounded-md border border-stone-300 bg-white px-2 py-0.5 text-xs shadow-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
              onBlur={commitLabel}
              onChange={(e) => {
                setDraft(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              ref={inputRef}
              style={{ minWidth: 60, maxWidth: 160 }}
              type="text"
              value={draft}
            />
          ) : label ? (
            <button
              className="cursor-default rounded-full bg-white px-2 py-0.5 font-medium text-stone-600 text-xs shadow-sm ring-1 ring-stone-200/60 transition-colors hover:bg-stone-100 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-600/60 dark:hover:bg-stone-700"
              onDoubleClick={handleLabelDoubleClick}
              style={{ maxWidth: 140 }}
              type="button"
            >
              <span className="block truncate">{label}</span>
            </button>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(LabeledEdgeComponent);
