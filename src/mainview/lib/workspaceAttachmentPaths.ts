const URI_PROTOCOL_RE = /^[a-z][a-z\d+.-]*:/i;
const QUERY_OR_HASH_RE = /[?#]/;

export const toWorkspaceAttachmentPath = (src: string): string | null => {
  const [path = ''] = src
    .trim()
    .replaceAll('\\', '/')
    .split(QUERY_OR_HASH_RE, 1);
  if (!path || URI_PROTOCOL_RE.test(path) || path.startsWith('//')) {
    return null;
  }
  const segments = path.split('/').filter(Boolean);
  const attachmentIndex = segments.indexOf('attachments');
  if (attachmentIndex < 0) {
    return null;
  }
  const prefix = segments.slice(0, attachmentIndex);
  if (!prefix.every((segment) => segment === '.' || segment === '..')) {
    return null;
  }
  const attachmentSegments = segments.slice(attachmentIndex);
  if (
    attachmentSegments.length < 2 ||
    attachmentSegments.some((segment) => segment === '.' || segment === '..')
  ) {
    return null;
  }
  return attachmentSegments.join('/');
};
