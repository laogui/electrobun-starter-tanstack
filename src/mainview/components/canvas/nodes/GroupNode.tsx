import {
  Handle,
  NodeResizer,
  Position,
  useUpdateNodeInternals,
} from '@xyflow/react';
import { motion } from 'motion/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../../paraglide/messages.js';

const handleClassName = 'conn-handle nodrag';

const GroupNode = ({ id, data, selected }: any) => {
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
      labelRef.current?.textContent.trim() || m.default_group_label();
    if (text !== data.label) {
      onUpdate(id, { label: text });
    }
    setEditingLabel(false);
  }, [id, data.label, onUpdate]);

  return (
    <motion.div
      animate={{ opacity: data.isHidden ? 0 : 1, scale: 1 }}
      className={cn(
        `canvas-group group-${data.color || 'blue'} size-full`,
        selected && 'selected',
        data.active && 'ring-2 ring-blue-400 ring-offset-2',
        data.isHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
      initial={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      <NodeResizer
        handleClassName="!w-3 !h-3 !bg-blue-500 !border-2 !border-white !rounded-full !-translate-x-1/2 !-translate-y-1/2"
        isVisible={selected}
        lineClassName="!border-transparent"
        minHeight={200}
        minWidth={300}
        onResizeStart={() => saveSnapshot()}
      />

      <Handle
        className={handleClassName}
        id="top"
        position={Position.Top}
        type="target"
      />
      <Handle
        className={handleClassName}
        id="right"
        position={Position.Right}
        type="source"
      />
      <Handle
        className={handleClassName}
        id="bottom"
        position={Position.Bottom}
        type="source"
      />
      <Handle
        className={handleClassName}
        id="left"
        position={Position.Left}
        type="target"
      />

      <div className="absolute top-0 left-0 flex items-center gap-1.5 px-3 pt-2">
        <div
          className={cn(
            'nodrag nopan font-semibold text-xs tracking-wide outline-none',
            'text-gray-600',
            editingLabel && 'rounded-sm px-0.5 ring-1 ring-blue-400/40'
          )}
          contentEditable={editingLabel}
          onBlur={handleBlur}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditingLabel(true);
            setTimeout(() => labelRef.current?.focus(), 10);
          }}
          ref={labelRef}
          suppressContentEditableWarning
        >
          {data.label}
        </div>
        <span className="text-gray-300 text-xs">⋮⋮</span>
      </div>
    </motion.div>
  );
};

export default memo(GroupNode);
