import { File } from 'lucide-react';
import { useCallback } from 'react';

import { FILE_CANVAS_TYPE_ID } from '../../../../shared/extensions/builtinIds';
import {
  buildFilePresentation,
  createFileInitialState,
  type FileState,
  isFileState,
  normalizeFileState,
} from '../../../../shared/extensions/media/state';

import type {
  BuiltinCanvasType,
  PreviewProps,
  SurfaceProps,
} from '../../types';

function FileCanvasSurface({ context, host, state }: SurfaceProps<FileState>) {
  const normalized = normalizeFileState(state);
  const title = normalized.title.trim() || normalized.fileName || 'File';
  const open = useCallback(() => {
    if (!normalized.attachmentFile) {
      return;
    }
    host.external.openUrl(normalized.attachmentFile).catch(() => undefined);
  }, [host, normalized.attachmentFile]);

  return (
    <div className="flex h-full flex-col justify-between p-5">
      <div>
        <div className="font-medium text-sm">{title}</div>
        <div className="mt-1 text-neutral-500 text-xs">
          {normalized.fileName || normalized.mimeType}
        </div>
      </div>
      {context.readOnly ? null : (
        <button
          className="nodrag nopan rounded-full bg-neutral-900 px-3 py-2 text-white text-xs dark:bg-white/10"
          onClick={open}
          type="button"
        >
          Open
        </button>
      )}
    </div>
  );
}

function FilePreviewSurface({ presentation, state }: PreviewProps<FileState>) {
  const normalized = normalizeFileState(state);
  return (
    <div className="flex h-full flex-col justify-center gap-1 p-3">
      <div className="truncate font-medium text-sm">
        {presentation.title || normalized.title || 'File'}
      </div>
      <div className="truncate text-neutral-500 text-xs">
        {normalized.fileName}
      </div>
    </div>
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
  DetailSurface: FileCanvasSurface,
};
