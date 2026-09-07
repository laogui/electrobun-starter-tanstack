import type { Node, NodeProps } from '@xyflow/react';
import { memo, useMemo } from 'react';
import { useAppSettingsStore } from '@/store/appSettingsStore';
import { useExtensionEnablementStore } from '@/store/extensionEnablementStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import { isExtensionInstanceLoadError } from '../../shared/extensions/instance';
import type { ExtensionNodeData } from '../../shared/extensions/protocol';

import { ExtensionFallback } from './ExtensionFallback';
import { ExtensionHostShell } from './ExtensionHostShell';
import { createExtensionHostApi } from './hostApi';
import { canvasTypeRegistry } from './registry';

type ExtensionFlowNode = Node<ExtensionNodeData, 'extension'>;

function resolveTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function ExtensionNodeComponent({
  data,
  id,
  selected,
}: NodeProps<ExtensionFlowNode>) {
  const canvasTypeId = data.canvasTypeId;
  const instanceId = data.instanceId;
  const record = useExtensionInstanceStore((s) => s.records[instanceId]);
  const disabledCanvasTypes = useExtensionEnablementStore(
    (s) => s.disabledCanvasTypes
  );
  const setEnabled = useExtensionEnablementStore((s) => s.setEnabled);
  const locale = useAppSettingsStore((s) => s.locale);
  const canvasType = canvasTypeRegistry.get(canvasTypeId);
  const availability = canvasTypeRegistry.availability(
    canvasTypeId,
    disabledCanvasTypes
  );

  const host = useMemo(
    () => createExtensionHostApi({ canvasTypeId, instanceId, nodeId: id }),
    [canvasTypeId, instanceId, id]
  );

  const presentation =
    record && !isExtensionInstanceLoadError(record)
      ? record.presentation
      : undefined;
  const minWidth = canvasType?.surface.minSize?.width ?? 160;
  const minHeight = canvasType?.surface.minSize?.height ?? 120;
  const corrupted = !record || isExtensionInstanceLoadError(record);

  return (
    <ExtensionHostShell
      availability={corrupted ? 'corrupted' : availability}
      canvasTypeId={canvasTypeId}
      instanceId={instanceId}
      maxHeight={canvasType?.surface.maxSize?.height}
      maxWidth={canvasType?.surface.maxSize?.width}
      minHeight={minHeight}
      minWidth={minWidth}
      nodeId={id}
      onEnable={() => {
        setEnabled(canvasTypeId, true).catch(() => undefined);
      }}
      presentation={presentation}
      readOnly={availability !== 'available'}
      resizable={canvasType?.surface.resizable ?? true}
      selected={!!selected}
    >
      {corrupted ? (
        <ExtensionFallback
          availability="corrupted"
          canvasTypeId={canvasTypeId}
          message="This instance could not be loaded. The original file is kept."
          presentation={presentation}
        />
      ) : canvasType && availability === 'available' ? (
        <canvasType.CanvasSurface
          context={{
            width: 0,
            height: 0,
            theme: resolveTheme(),
            locale,
            readOnly: false,
            selected: !!selected,
            surface: 'canvas',
          }}
          host={host}
          presentation={record.presentation}
          state={
            canvasType.validateState(record.state)
              ? record.state
              : canvasType.createInitialState()
          }
        />
      ) : null}
    </ExtensionHostShell>
  );
}

export default memo(ExtensionNodeComponent);

export function ExtensionNodeReadOnly({ data }: { data: ExtensionNodeData }) {
  const record = useExtensionInstanceStore((s) => s.records[data.instanceId]);
  const canvasType = canvasTypeRegistry.get(data.canvasTypeId);
  const locale = useAppSettingsStore((s) => s.locale);

  if (
    !record ||
    isExtensionInstanceLoadError(record) ||
    !canvasType ||
    !canvasType.validateState(record.state)
  ) {
    return (
      <ExtensionFallback
        availability="unknown"
        canvasTypeId={data.canvasTypeId}
        message="Preview is not available."
        presentation={
          record && !isExtensionInstanceLoadError(record)
            ? record.presentation
            : undefined
        }
      />
    );
  }

  return (
    <canvasType.PreviewSurface
      context={{
        width: 0,
        height: 0,
        theme: resolveTheme(),
        locale,
      }}
      presentation={record.presentation}
      state={record.state}
    />
  );
}
