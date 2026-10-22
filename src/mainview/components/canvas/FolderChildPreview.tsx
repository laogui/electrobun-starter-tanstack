import { ExtensionNodeReadOnly } from '@/extensions/ExtensionNode';
import { colorToStyle } from '@/lib/colorUtils';
import type { FolderChildEntry } from '@/lib/folderExpansion';

import type { AssetNodeRuntimeData } from './nodes/AssetNode';
import { AssetContent } from './nodes/AssetNode';
import { CardContent } from './nodes/CardNode';
import { ImageContent } from './nodes/ImageNode';
import type { LinkNodeRuntimeData } from './nodes/LinkNode';
import { LinkContent } from './nodes/LinkNode';
import {
  isExtensionNodeData,
  isWidgetNodeData,
  toCardContentData,
  toImageData,
} from './nodes/nodeDataGuards';
import type { RecordingRuntimeData } from './nodes/RecordingNode';
import { RecordingContent } from './nodes/RecordingNode';
import { WidgetNodeReadOnly } from './nodes/WidgetNode';

export function FolderChildPreview({ child }: { child: FolderChildEntry }) {
  if (child.type === 'image') {
    return <ImageContent data={toImageData(child.data)} />;
  }
  if (child.type === 'link') {
    return (
      <LinkContent
        allowPlayback={false}
        data={child.data as LinkNodeRuntimeData}
      />
    );
  }
  if (child.type === 'asset') {
    return <AssetContent data={child.data as AssetNodeRuntimeData} />;
  }
  if (child.type === 'recording') {
    return <RecordingContent data={child.data as RecordingRuntimeData} />;
  }
  if (child.type === 'widget' && isWidgetNodeData(child.data)) {
    return <WidgetNodeReadOnly data={child.data} />;
  }
  if (child.type === 'extension' && isExtensionNodeData(child.data)) {
    return <ExtensionNodeReadOnly data={child.data} />;
  }
  if (child.type === 'sticky') {
    const color =
      typeof child.data.color === 'string' ? child.data.color : undefined;
    const content =
      typeof child.data.content === 'string' ? child.data.content : '';
    return (
      <div className="flex size-full flex-col p-4" style={colorToStyle(color)}>
        <div className="wrap-break-word flex-1 whitespace-pre-wrap text-sm/relaxed">
          {content}
        </div>
      </div>
    );
  }
  return <CardContent data={toCardContentData(child.data)} readOnly />;
}
