/**
 * Read-only node wrappers for use in template previews, thumbnails, and
 * non-interactive embeddings of React Flow canvases.
 *
 * Each wrapper renders:
 * - 4 Handles (so edges still draw correctly)
 * - The same presentational `XxxContent` used by the editable node
 *
 * They deliberately omit:
 * - `useCanvasStore` subscriptions (no `commitNodeData`, no `editingFolderId`)
 * - RPC calls (no `rpcSaveAttachment`)
 * - NodeResizeControl / NodeResizer (resizing is not meaningful in previews)
 * - contentEditable handlers (content is purely visual)
 */

import { Handle, Position } from '@xyflow/react';
import { memo } from 'react';

import type { AssetNodeRuntimeData } from './AssetNode';
import { AssetContent } from './AssetNode';
import type { CardContentData } from './CardNode';
import { CardContent } from './CardNode';
import type { FolderData } from './FolderNode';
import { FolderContent } from './FolderNode';
import type { GroupData } from './GroupNode';
import { GroupContent } from './GroupNode';
import type { ImageData } from './ImageNode';
import { ImageContent } from './ImageNode';
import type { LinkNodeRuntimeData } from './LinkNode';
import { LinkContent } from './LinkNode';
import type { RecordingRuntimeData } from './RecordingNode';
import { RecordingContent } from './RecordingNode';
import type { StickyData } from './StickyNode';
import { StickyContent } from './StickyNode';
import type { WidgetNodeData } from './WidgetNode';
import { WidgetNodeReadOnly } from './WidgetNode';

export type { WidgetNodeData };
export { WidgetNodeReadOnly };

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

export const CardNodeReadOnly = memo(({ data }: { data: CardContentData }) => (
  <div className="size-full">
    <ReadOnlyHandles />
    <div className="node-visual size-full overflow-hidden rounded-3xl shadow-card">
      <CardContent data={data} readOnly />
    </div>
  </div>
));
CardNodeReadOnly.displayName = 'CardNodeReadOnly';

export const ImageNodeReadOnly = memo(({ data }: { data: ImageData }) => (
  <div className="size-full">
    <ReadOnlyHandles />
    <div className="node-visual size-full overflow-hidden rounded-3xl shadow-card">
      <ImageContent data={data} />
    </div>
  </div>
));
ImageNodeReadOnly.displayName = 'ImageNodeReadOnly';

export const LinkNodeReadOnly = memo(
  ({ data }: { data: LinkNodeRuntimeData }) => (
    <div className="size-full">
      <ReadOnlyHandles />
      <div className="node-visual size-full overflow-hidden rounded-3xl shadow-card">
        <LinkContent data={data} />
      </div>
    </div>
  )
);
LinkNodeReadOnly.displayName = 'LinkNodeReadOnly';

export const AssetNodeReadOnly = memo(
  ({ data }: { data: AssetNodeRuntimeData }) => (
    <div className="size-full">
      <ReadOnlyHandles />
      <div className="node-visual size-full overflow-hidden rounded-3xl shadow-card">
        <AssetContent data={data} />
      </div>
    </div>
  )
);
AssetNodeReadOnly.displayName = 'AssetNodeReadOnly';

export const RecordingNodeReadOnly = memo(
  ({ data }: { data: RecordingRuntimeData }) => (
    <div className="size-full">
      <ReadOnlyHandles />
      <div className="node-visual size-full overflow-hidden rounded-2xl shadow-card">
        <RecordingContent data={data} />
      </div>
    </div>
  )
);
RecordingNodeReadOnly.displayName = 'RecordingNodeReadOnly';

export const StickyNodeReadOnly = memo(({ data }: { data: StickyData }) => (
  <div className="size-full">
    <ReadOnlyHandles />
    <div className="node-visual relative size-full rounded-sm shadow-card">
      <StickyContent data={data} />
    </div>
  </div>
));
StickyNodeReadOnly.displayName = 'StickyNodeReadOnly';

export const FolderNodeReadOnly = memo(({ data }: { data: FolderData }) => (
  <div className="relative size-full">
    <ReadOnlyHandles />
    <FolderContent data={data} />
  </div>
));
FolderNodeReadOnly.displayName = 'FolderNodeReadOnly';

export const GroupNodeReadOnly = memo(({ data }: { data: GroupData }) => (
  <GroupContent data={data}>
    <ReadOnlyHandles />
  </GroupContent>
));
GroupNodeReadOnly.displayName = 'GroupNodeReadOnly';
