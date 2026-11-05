import {
  Copy,
  FilePlus,
  FolderOpen,
  Image as ImageIcon,
  PenLine,
} from 'lucide-react';

import { resolveExtensionMessage } from '@/extensions/messages';
import type {
  FileState,
  ImageState,
} from '../../../../shared/extensions/media/state';
import type { CanvasTypeMenuAction } from '../../types';

const FILE_EXT_RE = /\.[^.]+$/;

function readTitle(state: { title: string }): string {
  return state.title.trim();
}

export function revealInFinderAction<
  TState extends { attachmentFile?: string; imageFile?: string },
>(
  getAssetId: (state: TState) => string | undefined
): CanvasTypeMenuAction<TState> {
  return {
    id: 'reveal-in-finder',
    labelKey: 'menu_reveal_in_finder',
    icon: FolderOpen,
    visible: (state) => Boolean(getAssetId(state)),
    run: async ({ host, state }) => {
      const assetId = getAssetId(state);
      if (assetId) {
        await host.assets.reveal(assetId);
      }
    },
  };
}

export function renameAssetAction<
  TState extends { title: string },
>(): CanvasTypeMenuAction<TState> {
  return {
    id: 'rename-asset',
    labelKey: 'menu_rename_asset',
    icon: PenLine,
    run: async ({ host }) => {
      await host.canvas.requestTitleEdit();
    },
  };
}

export function replaceImageAction(): CanvasTypeMenuAction<ImageState> {
  return {
    id: 'replace-image',
    labelKey: 'menu_replace_image',
    icon: ImageIcon,
    run: async ({ host, state }) => {
      const handle = await host.assets.importFile({ accept: 'image/*' });
      if (!handle) {
        return;
      }
      const meta = await host.assets.getMetadata(handle.id);
      const fallbackTitle = meta.name.replace(FILE_EXT_RE, '');
      const next: ImageState = {
        color: state.color,
        imageFile: handle.id,
        title: readTitle(state) || fallbackTitle,
      };
      if (meta.thumbnailId) {
        next.thumbnailFile = meta.thumbnailId;
      }
      await host.instance.updateState({
        history: 'record',
        state: next,
      });
    },
  };
}

export function copyImageAddressAction(): CanvasTypeMenuAction<ImageState> {
  return {
    id: 'copy-image-address',
    labelKey: 'menu_copy_image_address',
    icon: Copy,
    visible: (state) => Boolean(state.imageFile),
    run: ({ host, state }) => {
      if (!state.imageFile) {
        return;
      }
      navigator.clipboard
        .writeText(state.imageFile)
        .then(() =>
          host.notifications
            .show({
              title: resolveExtensionMessage('toast_copied'),
            })
            .catch(() => undefined)
        )
        .catch(() => undefined);
    },
  };
}

export function replaceFileAction(): CanvasTypeMenuAction<FileState> {
  return {
    id: 'replace-file',
    labelKey: 'menu_replace_file',
    icon: FilePlus,
    run: async ({ host, state }) => {
      const handle = await host.assets.importFile();
      if (!handle) {
        return;
      }
      const meta = await host.assets.getMetadata(handle.id);
      const kind =
        meta.kind === 'video' || meta.kind === 'audio' ? meta.kind : 'file';
      await host.instance.updateState({
        history: 'record',
        state: {
          color: state.color,
          fileName: meta.name,
          kind,
          mimeType: meta.mimeType,
          title: meta.name,
          attachmentFile: handle.id,
          ...(typeof meta.size === 'number' ? { size: meta.size } : {}),
          ...(typeof meta.duration === 'number'
            ? { duration: meta.duration }
            : {}),
          ...(meta.thumbnailId ? { thumbnailFile: meta.thumbnailId } : {}),
          ...(meta.previewExcerpt
            ? { previewExcerpt: meta.previewExcerpt }
            : {}),
          ...(meta.waveform && meta.waveform.length > 0
            ? { waveform: meta.waveform }
            : {}),
          ...(meta.archiveSummary
            ? { archiveSummary: meta.archiveSummary }
            : {}),
        },
      });
    },
  };
}

export const imageMenuActions: readonly CanvasTypeMenuAction<ImageState>[] = [
  replaceImageAction(),
  copyImageAddressAction(),
  revealInFinderAction((state) => state.imageFile),
  renameAssetAction(),
];

export const fileMenuActions: readonly CanvasTypeMenuAction<FileState>[] = [
  revealInFinderAction((state) => state.attachmentFile),
  replaceFileAction(),
  renameAssetAction(),
];
