import { useCallback, useEffect, useMemo } from 'react';
import type { BlockNoteSaveStatus } from '@/components/editor/useBlockNoteSaver';
import { ExtensionFallback } from '@/extensions/ExtensionFallback';
import { ExtensionHostShell } from '@/extensions/ExtensionHostShell';
import { createExtensionHostApi } from '@/extensions/hostApi';
import {
  canvasTypeRegistry,
  useCanvasTypeRegistryRevision,
} from '@/extensions/registry';
import { getLinkHost } from '@/lib/contentTypes';
import { FLAGS } from '@/lib/flags';
import { useAppSettingsStore } from '@/store/appSettingsStore';
import { type FocusedItem, useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import { isExtensionInstanceLoadError } from '../../../../shared/extensions/instance';
import { FocusedNoteBody } from '../FocusedNoteBody';
import { ImageZoomPan } from '../ImageZoomPan';
import { AssetContent } from '../nodes/AssetNode';
import { CardContent } from '../nodes/CardNode';
import { ImageContent } from '../nodes/ImageNode';
import { LinkContent } from '../nodes/LinkNode';
import { toCardContentData, toImageData } from '../nodes/nodeDataGuards';

/** How an open item is laid out, decided from its kind. */
export interface FocusedItemLayout {
  /** Images and lightbox-type extensions: dark full-screen viewer. */
  isLightbox: boolean;
  /** Rich text notes (BlockNote). */
  isText: boolean;
  /** Title for chrome (lightbox caption, panel header fallback). */
  title: string | undefined;
}

/** Layout facts for an item, shared by the panel shell and the body. */
export function useFocusedItemLayout(node: FocusedItem): FocusedItemLayout {
  useCanvasTypeRegistryRevision();
  const dataTypeRaw = node.data.type;
  const canvasTypeId =
    node.type === 'extension' && typeof node.data.canvasTypeId === 'string'
      ? node.data.canvasTypeId
      : undefined;
  const instanceId =
    node.type === 'extension' && typeof node.data.instanceId === 'string'
      ? node.data.instanceId
      : undefined;
  const extensionType = canvasTypeId
    ? canvasTypeRegistry.get(canvasTypeId)
    : undefined;
  const record = useExtensionInstanceStore((s) =>
    instanceId ? s.records[instanceId] : undefined
  );
  const presentationTitle =
    record && !isExtensionInstanceLoadError(record)
      ? record.presentation.title.trim()
      : '';
  const envelopeTitle =
    typeof node.data.title === 'string' ? node.data.title : undefined;
  return {
    isLightbox:
      node.type === 'image' ||
      extensionType?.surface.detailLayout === 'lightbox',
    isText:
      node.type !== 'image' &&
      node.type !== 'extension' &&
      (dataTypeRaw === 'text' || dataTypeRaw == null) &&
      FLAGS.focusedNoteEditor,
    title: envelopeTitle || presentationTitle || undefined,
  };
}

interface FocusedItemBodyProps {
  node: FocusedItem;
  onSaveStatusChange: (
    status: BlockNoteSaveStatus,
    savedAt: Date | null
  ) => void;
}

/**
 * The editing surface of one open item, whatever shell shows it (side panel,
 * full-screen writing, lightbox). Owns the per-kind data plumbing: note body,
 * link, image, asset and extension detail surfaces.
 */
// react-doctor-disable-next-line react-doctor/no-giant-component
export function FocusedItemBody({
  node,
  onSaveStatusChange,
}: FocusedItemBodyProps) {
  const { isText, title } = useFocusedItemLayout(node);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const commitNodeData = useCanvasStore((s) => s.commitNodeData);
  const updateFolderChildData = useCanvasStore((s) => s.updateFolderChildData);
  const commitFolderChildData = useCanvasStore((s) => s.commitFolderChildData);
  const folderId =
    typeof node.folderId === 'string' ? node.folderId : undefined;
  const noteId =
    typeof node.data.noteId === 'string' ? node.data.noteId : undefined;
  const color =
    typeof node.data.color === 'string' ? node.data.color : undefined;
  const content =
    typeof node.data.content === 'string' ? node.data.content : undefined;
  const updateFocusedData = useCallback(
    (updates: Record<string, unknown>) => {
      if (folderId) {
        updateFolderChildData(folderId, node.id, updates);
        return;
      }
      updateNodeData(node.id, updates);
    },
    [folderId, node.id, updateFolderChildData, updateNodeData]
  );

  const commitFocusedData = useCallback(
    (updates: Record<string, unknown>) => {
      if (folderId) {
        commitFolderChildData(folderId, node.id, updates);
        return;
      }
      commitNodeData(node.id, updates);
    },
    [commitFolderChildData, commitNodeData, folderId, node.id]
  );

  const handleLinkUrlChange = useCallback(
    (url: string) => {
      commitFocusedData({
        url,
        title: getLinkHost(url) || url,
        description: undefined,
        faviconUrl: undefined,
        imageUrl: undefined,
        siteName: undefined,
        unfurlError: undefined,
        unfurlStatus: 'idle',
      });
    },
    [commitFocusedData]
  );

  // ── Extensions ──────────────────────────────────────────────────────────
  const extensionCanvasTypeId =
    node.type === 'extension' && typeof node.data.canvasTypeId === 'string'
      ? node.data.canvasTypeId
      : undefined;
  const extensionInstanceId =
    node.type === 'extension' && typeof node.data.instanceId === 'string'
      ? node.data.instanceId
      : undefined;
  const extensionType = extensionCanvasTypeId
    ? canvasTypeRegistry.get(extensionCanvasTypeId)
    : undefined;
  const extensionRecord = useExtensionInstanceStore((s) =>
    extensionInstanceId ? s.records[extensionInstanceId] : undefined
  );
  const locale = useAppSettingsStore((s) => s.locale);
  const extensionAvailability = extensionCanvasTypeId
    ? canvasTypeRegistry.availability(extensionCanvasTypeId)
    : 'unknown';
  const extensionLoaded = Boolean(
    extensionRecord && !isExtensionInstanceLoadError(extensionRecord)
  );
  const extensionCompatible = Boolean(
    extensionType &&
      extensionRecord &&
      !isExtensionInstanceLoadError(extensionRecord) &&
      extensionRecord.dataVersion === extensionType.dataVersion &&
      extensionType.validateState(extensionRecord.state)
  );
  const extensionNeedsMigration = Boolean(
    extensionType &&
      extensionRecord &&
      !isExtensionInstanceLoadError(extensionRecord) &&
      extensionAvailability === 'available' &&
      extensionRecord.dataVersion < extensionType.dataVersion
  );
  useEffect(() => {
    if (extensionNeedsMigration && extensionInstanceId) {
      useExtensionInstanceStore
        .getState()
        .migrateInstance(extensionInstanceId)
        .catch(() => undefined);
    }
  }, [extensionInstanceId, extensionNeedsMigration]);
  const extensionHost = useMemo(
    () =>
      extensionCanvasTypeId && extensionInstanceId
        ? createExtensionHostApi({
            canvasTypeId: extensionCanvasTypeId,
            instanceId: extensionInstanceId,
            nodeId: node.id,
            ...(folderId ? { folderId } : {}),
          })
        : null,
    [extensionCanvasTypeId, extensionInstanceId, folderId, node.id]
  );

  if (
    node.type === 'extension' &&
    extensionCanvasTypeId &&
    extensionInstanceId
  ) {
    const presentation =
      extensionRecord && !isExtensionInstanceLoadError(extensionRecord)
        ? extensionRecord.presentation
        : undefined;
    const shellAvailability = extensionLoaded
      ? extensionAvailability !== 'available'
        ? extensionAvailability
        : extensionType && !extensionCompatible
          ? 'incompatible'
          : extensionAvailability
      : 'unknown';
    const fallbackAvailability = extensionLoaded
      ? shellAvailability
      : 'corrupted';
    return (
      <ExtensionHostShell
        availability={shellAvailability}
        canvasTypeId={extensionCanvasTypeId}
        instanceId={extensionInstanceId}
        minHeight={0}
        minWidth={0}
        nodeId={node.id}
        presentation={presentation}
        readOnly={extensionAvailability !== 'available' || !extensionCompatible}
        resizable={false}
        selected
        surface="detail"
      >
        {extensionType?.DetailSurface &&
        extensionHost &&
        extensionRecord &&
        !isExtensionInstanceLoadError(extensionRecord) &&
        extensionCompatible &&
        extensionAvailability === 'available' ? (
          <extensionType.DetailSurface
            context={{
              width: 0,
              height: 0,
              theme: document.documentElement.classList.contains('dark')
                ? 'dark'
                : 'light',
              locale,
              readOnly: false,
              selected: true,
              surface: 'detail',
            }}
            host={extensionHost}
            presentation={extensionRecord.presentation}
            state={extensionRecord.state}
          />
        ) : (
          <ExtensionFallback
            availability={fallbackAvailability}
            canvasTypeId={extensionCanvasTypeId}
            presentation={presentation}
          />
        )}
      </ExtensionHostShell>
    );
  }

  if (node.type === 'image') {
    return (
      <ImageZoomPan>
        <ImageContent data={toImageData(node.data)} isFocused={true} />
      </ImageZoomPan>
    );
  }
  if (node.type === 'asset') {
    return <AssetContent data={node.data} isFocused={true} />;
  }
  if (node.type === 'link') {
    return (
      <LinkContent
        data={node.data}
        isFocused={true}
        onUrlChange={handleLinkUrlChange}
      />
    );
  }
  if (isText) {
    return (
      <FocusedNoteBody
        color={color}
        content={content}
        data={node.data}
        editorEnabled
        nodeId={node.id}
        noteId={noteId}
        onMarkdownChange={(markdown) => {
          updateFocusedData({
            content: markdown,
            previewBlocks: undefined,
            previewExcerpt: undefined,
            previewHtml: undefined,
            previewVersion: undefined,
          });
        }}
        onPreviewUpdate={folderId ? updateFocusedData : undefined}
        onSaveStatusChange={onSaveStatusChange}
        onTitleChange={(nextTitle) => {
          updateFocusedData({ title: nextTitle });
        }}
        title={title}
      />
    );
  }
  return <CardContent data={toCardContentData(node.data)} />;
}
