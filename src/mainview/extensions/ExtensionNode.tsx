import type { Node, NodeProps } from '@xyflow/react';
import { memo, useEffect, useMemo } from 'react';
import { nodeRenderPropsEqual } from '@/lib/nodeRenderPropsEqual';
import { useAppSettingsStore } from '@/store/appSettingsStore';
import { useExtensionEnablementStore } from '@/store/extensionEnablementStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import { isExtensionInstanceLoadError } from '../../shared/extensions/instance';
import type { ExtensionNodeData } from '../../shared/extensions/protocol';

import { ExtensionFallback } from './ExtensionFallback';
import { ExtensionHostShell } from './ExtensionHostShell';
import { createExtensionHostApi } from './hostApi';
import { canvasTypeRegistry, useCanvasTypeRegistryRevision } from './registry';

type ExtensionFlowNode = Node<ExtensionNodeData, 'extension'>;

function resolveTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function ExtensionNodeComponent({
  data,
  id,
  selected,
}: NodeProps<ExtensionFlowNode>) {
  useCanvasTypeRegistryRevision();
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
  const compatible = Boolean(
    !corrupted &&
      canvasType &&
      record.dataVersion === canvasType.dataVersion &&
      canvasType.validateState(record.state)
  );
  const needsMigration = Boolean(
    !corrupted &&
      canvasType &&
      availability === 'available' &&
      record.dataVersion < canvasType.dataVersion
  );

  useEffect(() => {
    if (needsMigration) {
      useExtensionInstanceStore
        .getState()
        .migrateInstance(instanceId)
        .catch(() => undefined);
    }
  }, [instanceId, needsMigration]);

  return (
    <ExtensionHostShell
      availability={
        corrupted
          ? 'corrupted'
          : availability !== 'available'
            ? availability
            : canvasType && !compatible
              ? 'incompatible'
              : availability
      }
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
      ) : canvasType && compatible && availability === 'available' ? (
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
          state={record.state}
        />
      ) : null}
    </ExtensionHostShell>
  );
}

export default memo(ExtensionNodeComponent, nodeRenderPropsEqual);

export function ExtensionNodeReadOnly({ data }: { data: ExtensionNodeData }) {
  useCanvasTypeRegistryRevision();
  const record = useExtensionInstanceStore((s) => s.records[data.instanceId]);
  const canvasType = canvasTypeRegistry.get(data.canvasTypeId);
  const locale = useAppSettingsStore((s) => s.locale);

  if (
    !record ||
    isExtensionInstanceLoadError(record) ||
    !canvasType ||
    record.dataVersion !== canvasType.dataVersion ||
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
