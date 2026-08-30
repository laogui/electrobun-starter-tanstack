import { File } from 'lucide-react';

import { AssetHoverCard } from '@/components/canvas/nodes/_shared/AssetHoverCard';
import {
  AssetContent,
  type AssetNodeRuntimeData,
  buildAssetHoverRows,
  resolveAssetData,
} from '@/components/canvas/nodes/AssetNode';
import { FILE_CANVAS_TYPE_ID } from '../../../../shared/extensions/builtinIds';
import {
  buildFilePresentation,
  createFileInitialState,
  type FileState,
  isFileState,
  normalizeFileState,
} from '../../../../shared/extensions/media/state';

import {
  type BuiltinCanvasType,
  colorFieldInteractions,
  type PreviewProps,
  type SurfaceProps,
} from '../../types';
import { fileMenuActions } from './menuActions';

function toAssetData(state: FileState): AssetNodeRuntimeData {
  return {
    ...(state.archiveSummary ? { archiveSummary: state.archiveSummary } : {}),
    ...(state.attachmentFile ? { attachmentFile: state.attachmentFile } : {}),
    color: state.color,
    ...(typeof state.duration === 'number' ? { duration: state.duration } : {}),
    fileName: state.fileName,
    kind: state.kind,
    mimeType: state.mimeType,
    ...(state.previewExcerpt ? { previewExcerpt: state.previewExcerpt } : {}),
    ...(typeof state.size === 'number' ? { size: state.size } : {}),
    ...(state.thumbnailFile ? { thumbnailFile: state.thumbnailFile } : {}),
    title: state.title,
    ...(state.waveform ? { waveform: state.waveform } : {}),
  };
}

function FileCanvasSurface({ state }: SurfaceProps<FileState>) {
  const data = toAssetData(normalizeFileState(state));
  const asset = resolveAssetData(data);
  return (
    <AssetHoverCard enabled={!asset.missing} rows={buildAssetHoverRows(asset)}>
      <AssetContent data={data} />
    </AssetHoverCard>
  );
}

function FilePreviewSurface({ state }: PreviewProps<FileState>) {
  return <AssetContent data={toAssetData(normalizeFileState(state))} />;
}

function FileDetailSurface({ state }: SurfaceProps<FileState>) {
  return (
    <AssetContent data={toAssetData(normalizeFileState(state))} isFocused />
  );
}

export const fileCanvasType: BuiltinCanvasType<FileState> = {
  id: FILE_CANVAS_TYPE_ID,
  titleKey: 'canvas_type_media_file',
  descriptionKey: 'canvas_type_media_file_description',
  icon: File,
  category: 'media',
  dataVersion: 1,
  createFlow: 'file',
  capabilities: ['assets', 'external'],
  interactions: {
    color: colorFieldInteractions<FileState>(),
    supportsTags: true,
  },
  menuActions: fileMenuActions,
  surface: {
    defaultSize: { width: 350, height: 260 },
    minSize: { width: 220, height: 180 },
    maxSize: { width: 800, height: 900 },
    resizable: true,
    openBehavior: 'detail',
    canEnterGroup: true,
    canEnterFolder: true,
  },
  createInitialState: createFileInitialState,
  validateState: isFileState,
  migrateState: (record) => normalizeFileState(record.state),
  buildPresentation: buildFilePresentation,
  CanvasSurface: FileCanvasSurface,
  PreviewSurface: FilePreviewSurface,
  DetailSurface: FileDetailSurface,
};
