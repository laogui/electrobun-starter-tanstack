import { rpcLoadAttachment } from '@/lib/rpc';
import { toWorkspaceAttachmentPath } from '@/lib/workspaceAttachmentPaths';

type AttachmentLoader = (
  filePath: string
) => Promise<{ dataUrl?: unknown } | null | undefined>;

export async function hydratePreviewImageSources(
  html: string,
  loadAttachment: AttachmentLoader = rpcLoadAttachment
): Promise<string> {
  if (!html.includes('<img') || typeof document === 'undefined') {
    return html;
  }

  const template = document.createElement('template');
  template.innerHTML = html;
  const images = Array.from(template.content.querySelectorAll('img[src]'));
  if (images.length === 0) {
    return html;
  }

  await Promise.all(
    images.map(async (image) => {
      const rawSrc = image.getAttribute('src');
      if (!rawSrc) {
        return;
      }
      const attachmentPath = toWorkspaceAttachmentPath(rawSrc);
      if (!attachmentPath) {
        return;
      }
      try {
        const result = await loadAttachment(attachmentPath);
        if (
          result &&
          typeof result.dataUrl === 'string' &&
          result.dataUrl.startsWith('data:image/')
        ) {
          image.setAttribute('src', result.dataUrl);
        }
      } catch {
        // Keep the original src so the browser can show its broken-image state.
      }
    })
  );

  return template.innerHTML;
}
