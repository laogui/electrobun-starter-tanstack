import { ImageIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { IMAGE_CANVAS_TYPE_ID } from '../../../../shared/extensions/builtinIds';
import {
  buildImagePresentation,
  createImageInitialState,
  type ImageState,
  isImageState,
  normalizeImageState,
} from '../../../../shared/extensions/media/state';

import type {
  BuiltinCanvasType,
  PreviewProps,
  SurfaceProps,
} from '../../types';

function ImageCanvasSurface({
  context,
  host,
  state,
}: SurfaceProps<ImageState>) {
  const normalized = normalizeImageState(state);
  const path = normalized.thumbnailFile || normalized.imageFile;
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    host.assets
      .getUrl(path)
      .then((url) => {
        if (!cancelled) {
          setSrc(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [host, path]);

  return (
    <div className="flex size-full items-center justify-center bg-neutral-100 dark:bg-neutral-900">
      {src ? (
        <img
          alt={normalized.title || 'Image'}
          className="size-full object-cover"
          draggable={false}
          src={src}
        />
      ) : (
        <div className="text-neutral-400 text-sm">
          {normalized.title || 'Image'}
        </div>
      )}
      {context.surface === 'detail' && normalized.title ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-sm text-white/90">
          {normalized.title}
        </div>
      ) : null}
    </div>
  );
}

function ImagePreviewSurface({
  presentation,
  state,
}: PreviewProps<ImageState>) {
  const normalized = normalizeImageState(state);
  return (
    <div className="flex h-full items-center justify-center bg-neutral-100 p-3 text-sm dark:bg-neutral-900">
      {presentation.title || normalized.title || 'Image'}
    </div>
  );
}

export const imageCanvasType: BuiltinCanvasType<ImageState> = {
  id: IMAGE_CANVAS_TYPE_ID,
  titleKey: 'canvas_type_media_image',
  descriptionKey: 'canvas_type_media_image_description',
  icon: ImageIcon,
  category: 'media',
  dataVersion: 1,
  createFlow: 'image',
  capabilities: ['assets'],
  surface: {
    defaultSize: { width: 350, height: 350 },
    minSize: { width: 150, height: 150 },
    maxSize: { width: 800, height: 900 },
    resizable: true,
    preserveAspectRatio: true,
    openBehavior: 'detail',
    canEnterGroup: true,
    canEnterFolder: true,
  },
  createInitialState: createImageInitialState,
  validateState: isImageState,
  migrateState: (record) => normalizeImageState(record.state),
  buildPresentation: buildImagePresentation,
  CanvasSurface: ImageCanvasSurface,
  PreviewSurface: ImagePreviewSurface,
  DetailSurface: ImageCanvasSurface,
};
