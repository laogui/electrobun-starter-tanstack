import {
  assertWorkspaceAttachmentPath,
  loadAttachment as loadWorkspaceAttachment,
  openAttachment as openWorkspaceAttachment,
  revealAttachment as revealWorkspaceAttachment,
  saveAttachment as saveWorkspaceAttachment,
  saveAttachmentFile as saveWorkspaceAttachmentFile,
} from '../../attachments';
import { generateFileMetadata, generateVideoPosterFile } from '../../thumbnail';
import type { RpcContext } from '../context';
import type { RpcRequestHandlers } from '../types';

export function createAttachmentsHandlers(
  ctx: RpcContext
): RpcRequestHandlers<
  | 'saveAttachment'
  | 'saveAttachmentFile'
  | 'generateVideoThumbnail'
  | 'loadAttachment'
  | 'openAttachment'
  | 'revealAttachment'
> {
  const { wsPath } = ctx;
  return {
    saveAttachment: async (params) => {
      const saved = await saveWorkspaceAttachment(wsPath, params);
      // Generate any text excerpt / archive summary the renderer can show
      // on the canvas card. Failures are swallowed inside the helper so
      // the save itself never blocks on metadata.
      const { fullPath } = assertWorkspaceAttachmentPath(
        wsPath,
        saved.filePath
      );
      const metadata = await generateFileMetadata(
        fullPath,
        params.mimeType ?? ''
      );
      return { ...saved, ...metadata };
    },

    saveAttachmentFile: async (params) => {
      const saved = await saveWorkspaceAttachmentFile(wsPath, params);
      const { fullPath } = assertWorkspaceAttachmentPath(
        wsPath,
        saved.filePath
      );
      const metadata = await generateFileMetadata(
        fullPath,
        params.mimeType ?? ''
      );
      return { ...saved, ...metadata };
    },

    generateVideoThumbnail: async ({ attachmentFile }) => {
      const { fullPath } = assertWorkspaceAttachmentPath(
        wsPath,
        attachmentFile
      );
      const thumbnailFile = await generateVideoPosterFile(wsPath, fullPath);
      return thumbnailFile ? { thumbnailFile } : {};
    },

    loadAttachment: async ({ filePath }) =>
      loadWorkspaceAttachment(wsPath, filePath),

    openAttachment: async ({ filePath }) =>
      openWorkspaceAttachment(wsPath, filePath),

    revealAttachment: async ({ filePath }) =>
      revealWorkspaceAttachment(wsPath, filePath),
  };
}
