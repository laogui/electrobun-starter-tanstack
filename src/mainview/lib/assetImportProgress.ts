import { createElement } from 'react';
import { toast } from 'sonner';

import { type AssetImportProgress, saveAssetFile } from '@/lib/assetFiles';
import type { AssetNodeData } from '@/lib/contentTypes';
import * as m from '../../paraglide/messages.js';
import { AssetImportProgressToast } from './AssetImportProgressToast';

const IMPORT_TOAST_DURATION_MS = 60 * 60 * 1000;

export async function saveAssetFileWithProgressToast(
  file: File
): Promise<AssetNodeData> {
  const toastId = `asset-import-${
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  }`;
  try {
    const data = await saveAssetFile(file, {
      onProgress: (progress: AssetImportProgress) => {
        toast.custom(
          () =>
            createElement(AssetImportProgressToast, {
              fileName: progress.fileName,
              label: progress.label,
              progress: progress.progress,
            }),
          {
            id: toastId,
            duration: IMPORT_TOAST_DURATION_MS,
          }
        );
      },
    });
    toast.success(m.asset_import_added(), {
      id: toastId,
      description: file.name,
      duration: 2200,
    });
    return data;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : m.asset_import_save_failed();
    toast.error(message, {
      id: toastId,
      description: file.name,
      duration: 5000,
    });
    throw error;
  }
}
