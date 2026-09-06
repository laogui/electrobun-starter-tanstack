import { ImageIcon } from 'lucide-react';

import { ImageZoomPan } from '@/components/canvas/ImageZoomPan';
import { AssetHoverCard } from '@/components/canvas/nodes/_shared/AssetHoverCard';
import { TypeBadge } from '@/components/canvas/nodes/_shared/TypeBadge';
import {
  ImageContent,
  type ImageData,
} from '@/components/canvas/nodes/ImageNode';
import { IMAGE_CANVAS_TYPE_ID } from '../../../../shared/extensions/builtinIds';
import {
  buildImagePresentation,
  createImageInitialState,
  type ImageState,
  isImageState,
  normalizeImageState,
} from '../../../../shared/extensions/media/state';

import {
  type BuiltinCanvasType,
  colorFieldInteractions,
  type PreviewProps,
  type SurfaceProps,
} from '../../types';
import { imageMenuActions } from './menuActions';

function toImageData(state: ImageState): ImageData {
  return {
    color: state.color,
    title: state.title,
    ...(state.imageFile ? { imageFile: state.imageFile } : {}),
    ...(state.thumbnailFile ? { thumbnailFile: state.thumbnailFile } : {}),
  };
}

function ImageCanvasSurface({ state }: SurfaceProps<ImageState>) {
  const data = toImageData(normalizeImageState(state));
  const hasImage = Boolean(data.imageFile || data.thumbnailFile);
  return (
    <AssetHoverCard
      enabled={hasImage && Boolean(data.title)}
      rows={
        data.title
          ? [
              { label: 'Name', value: data.title },
              ...(data.imageFile
                ? [{ label: 'Path', value: data.imageFile }]
                : []),
            ]
          : []
      }
    >
      <div className="relative size-full">
        <ImageContent data={data} />
        {hasImage ? (
          <TypeBadge className="absolute top-5 right-5 z-10">Image</TypeBadge>
        ) : null}
      </div>
    </AssetHoverCard>
  );
}

function ImagePreviewSurface({ state }: PreviewProps<ImageState>) {
  return <ImageContent data={toImageData(normalizeImageState(state))} />;
}

function ImageDetailSurface({ state }: SurfaceProps<ImageState>) {
  return (
    <ImageZoomPan>
      <ImageContent data={toImageData(normalizeImageState(state))} isFocused />
    </ImageZoomPan>
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
  interactions: {
    canDetach: true,
    color: colorFieldInteractions<ImageState>(),
    supportsTags: true,
  },
  menuActions: imageMenuActions,
  surface: {
    defaultSize: { width: 350, height: 350 },
    minSize: { width: 150, height: 150 },
    maxSize: { width: 800, height: 900 },
    resizable: true,
    preserveAspectRatio: true,
    openBehavior: 'detail',
    detailLayout: 'lightbox',
    canEnterGroup: true,
    canEnterFolder: true,
  },
  createInitialState: createImageInitialState,
  validateState: isImageState,
  migrateState: (record) => normalizeImageState(record.state),
  buildPresentation: buildImagePresentation,
  CanvasSurface: ImageCanvasSurface,
  PreviewSurface: ImagePreviewSurface,
  DetailSurface: ImageDetailSurface,
};
