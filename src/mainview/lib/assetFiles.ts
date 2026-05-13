import {
  type AssetNodeData,
  classifyFile,
  createAssetNodeData,
} from '@/lib/contentTypes';
import { rpcSaveAttachment } from '@/lib/rpc';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Unable to read file as a data URL.'));
    });
    reader.addEventListener('error', () => {
      reject(new Error('Unable to read file.'));
    });
    reader.readAsDataURL(file);
  });
}

export async function saveAssetFile(file: File): Promise<AssetNodeData> {
  const classified = classifyFile(file);
  const dataUrl = await readFileAsDataUrl(file);
  const result = await rpcSaveAttachment(dataUrl, undefined, {
    kind: classified.kind,
    mimeType: classified.mimeType,
    suggestedName: file.name,
  });

  return createAssetNodeData(file, {
    attachmentFile: result?.filePath,
  });
}
