/**
 * Read-only node wrappers for use in template previews, thumbnails, and
 * non-interactive embeddings of React Flow canvases.
 *
 * Each wrapper renders:
 * - 4 Handles (so edges still draw correctly)
 * - The same presentational `XxxContent` used by the editable node
 *
 * They deliberately omit:
 * - `useCanvasStore` subscriptions (no `commitNodeData`, no `renamingFolderId`)
 * - RPC calls (no `rpcSaveAttachment`)
 * - NodeResizeControl / NodeResizer (resizing is not meaningful in previews)
 * - contentEditable handlers (content is purely visual)
 */

import { Handle, Position } from '@xyflow/react';
import { memo } from 'react';

import { CardContent } from './CardNode';
import { FolderContent } from './FolderNode';
import { GroupContent } from './GroupNode';
import { ImageContent } from './ImageNode';
import { LinkContent } from './LinkNode';
import { StickyContent } from './StickyNode';

const handleClassName = 'conn-handle nodrag';

function ReadOnlyHandles() {
  return (
    <>
      <Handle
        className={handleClassName}
        id="top"
        position={Position.Top}
        type="source"
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
        type="source"
      />
    </>
  );
}

export const CardNodeReadOnly = memo(({ data }: { data: any }) => (
  <div className="size-full">
    <ReadOnlyHandles />
    <div className="node-visual size-full overflow-hidden rounded-3xl border border-black/5 shadow-card">
      <CardContent data={data} readOnly />
    </div>
  </div>
));
CardNodeReadOnly.displayName = 'CardNodeReadOnly';

export const ImageNodeReadOnly = memo(({ data }: { data: any }) => (
  <div className="size-full">
    <ReadOnlyHandles />
    <div className="node-visual size-full overflow-hidden rounded-3xl border border-black/5 shadow-sm">
      <ImageContent data={data} />
    </div>
  </div>
));
ImageNodeReadOnly.displayName = 'ImageNodeReadOnly';

export const LinkNodeReadOnly = memo(({ data }: { data: any }) => (
  <div className="size-full">
    <ReadOnlyHandles />
    <div className="node-visual size-full overflow-hidden rounded-3xl border border-black/5 shadow-card">
      <LinkContent data={data} />
    </div>
  </div>
));
LinkNodeReadOnly.displayName = 'LinkNodeReadOnly';

export const StickyNodeReadOnly = memo(({ data }: { data: any }) => (
  <div className="size-full">
    <ReadOnlyHandles />
    <div className="node-visual relative size-full overflow-hidden rounded-sm border border-black/5 shadow-card">
      <StickyContent data={data} />
    </div>
  </div>
));
StickyNodeReadOnly.displayName = 'StickyNodeReadOnly';

export const FolderNodeReadOnly = memo(({ data }: { data: any }) => (
  <div className="relative size-full">
    <ReadOnlyHandles />
    <FolderContent data={data} />
  </div>
));
FolderNodeReadOnly.displayName = 'FolderNodeReadOnly';

export const GroupNodeReadOnly = memo(({ data }: { data: any }) => (
  <GroupContent data={data}>
    <ReadOnlyHandles />
  </GroupContent>
));
GroupNodeReadOnly.displayName = 'GroupNodeReadOnly';
