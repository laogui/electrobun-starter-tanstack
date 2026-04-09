import { memo, useCallback, useRef, useState } from 'react';
import { Handle, Position, NodeResizer, useReactFlow } from '@xyflow/react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import * as m from '../../../../paraglide/messages.js';

const handleClassName = "conn-handle nodrag";

const GroupNode = ({ id, data, selected }: any) => {
  const [editingLabel, setEditingLabel] = useState(false);
  const labelRef = useRef<HTMLDivElement>(null);
  const onUpdate = useCanvasStore((s) => s.updateNodeData);
  const rf = useReactFlow();

  const handleBlur = useCallback(() => {
    const text = labelRef.current?.innerText.trim() || m.default_group_label();
    onUpdate(id, { label: text });
    setEditingLabel(false);
  }, [id, onUpdate]);

  const shouldResize = useCallback(
    (_event: unknown, params: { x: number; y: number; width: number; height: number }) => {
      const allNodes = rf.getNodes();
      const thisNode = allNodes.find((n) => n.id === id);
      const otherGroups = allNodes.filter(
        (n) =>
          n.type === 'group' &&
          n.id !== id &&
          n.parentId !== id &&
          n.id !== thisNode?.parentId,
      );
      const MARGIN = 4;
      for (const og of otherGroups) {
        const internal = rf.getInternalNode(og.id);
        if (!internal) continue;
        const ox = internal.internals.positionAbsolute.x;
        const oy = internal.internals.positionAbsolute.y;
        const ow = internal.measured.width ?? 400;
        const oh = internal.measured.height ?? 300;
        if (
          params.x < ox + ow + MARGIN &&
          params.x + params.width > ox - MARGIN &&
          params.y < oy + oh + MARGIN &&
          params.y + params.height > oy - MARGIN
        ) {
          return false;
        }
      }
      return true;
    },
    [rf, id],
  );

  return (
    <motion.div
      className={cn(
        `canvas-group group-${data.color || 'blue'} w-full h-full`,
        selected && 'selected',
        data.active && 'ring-2 ring-blue-400 ring-offset-2',
        data.isHidden ? 'opacity-0 pointer-events-none' : 'opacity-100',
      )}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: data.isHidden ? 0 : 1, scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={300}
        minHeight={200}
        lineClassName="!border-transparent"
        handleClassName="!w-3 !h-3 !bg-blue-500 !border-2 !border-white !rounded-full !-translate-x-1/2 !-translate-y-1/2"
        shouldResize={shouldResize}
      />

      <Handle type="target" position={Position.Top} id="top" className={handleClassName} />
      <Handle type="source" position={Position.Right} id="right" className={handleClassName} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={handleClassName} />
      <Handle type="target" position={Position.Left} id="left" className={handleClassName} />

      <div className="absolute top-0 left-0 px-3 pt-2 flex items-center gap-1.5">
        <div
          ref={labelRef}
          contentEditable={editingLabel}
          suppressContentEditableWarning
          className={cn(
            'text-xs font-semibold tracking-wide outline-none nodrag nopan',
            'text-gray-600',
            editingLabel && 'ring-1 ring-blue-400/40 rounded px-0.5',
          )}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditingLabel(true);
            setTimeout(() => labelRef.current?.focus(), 10);
          }}
          onBlur={handleBlur}
        >
          {data.label}
        </div>
        <span className="text-gray-300 text-xs">⋮⋮</span>
      </div>
    </motion.div>
  );
};

export default memo(GroupNode);
