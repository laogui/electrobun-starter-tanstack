import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import {
  PLUGIN_TEXT_FILE_MAX_BYTES,
  type PluginFileContext,
  type PluginFileHandleData,
} from '../../shared/plugins/files';
import { isPluginId } from '../../shared/plugins/ids';

const MAX_LIVE_HANDLES = 256;
const ACTIVATION_ID_RE = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const EXTENSION_RE = /^\.[a-z0-9][a-z0-9+_-]{0,15}$/;

interface StoredFileHandle extends PluginFileHandleData {
  context: PluginFileContext;
  path: string;
}

function selectedFileMimeType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.csv':
      return 'text/csv';
    case '.tsv':
      return 'text/tab-separated-values';
    case '.txt':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}

export class PluginFileError extends Error {
  readonly code:
    | 'invalid-context'
    | 'invalid-encoding'
    | 'invalid-handle'
    | 'not-file'
    | 'resource-limit';

  constructor(
    code:
      | 'invalid-context'
      | 'invalid-encoding'
      | 'invalid-handle'
      | 'not-file'
      | 'resource-limit',
    message: string
  ) {
    super(message);
    this.name = 'PluginFileError';
    this.code = code;
  }
}

function sameContext(
  left: PluginFileContext,
  right: PluginFileContext
): boolean {
  return (
    left.activationId === right.activationId &&
    left.pluginId === right.pluginId &&
    left.workspaceId === right.workspaceId
  );
}

export class PluginFileStore {
  private readonly handles = new Map<string, StoredFileHandle>();
  private readonly workspaceId: string;

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
  }

  validateContext(context: PluginFileContext): void {
    this.assertContext(context);
  }

  private assertContext(context: PluginFileContext): void {
    if (
      context.workspaceId !== this.workspaceId ||
      !isPluginId(context.pluginId) ||
      !ACTIVATION_ID_RE.test(context.activationId)
    ) {
      throw new PluginFileError(
        'invalid-context',
        'File operation does not belong to this plugin activation and workspace.'
      );
    }
  }

  async registerSelection(
    context: PluginFileContext,
    paths: readonly string[]
  ): Promise<PluginFileHandleData[]> {
    this.assertContext(context);
    const created: StoredFileHandle[] = [];
    for (const path of paths) {
      const metadata = await stat(path);
      if (!metadata.isFile()) {
        throw new PluginFileError('not-file', 'Selected path is not a file.');
      }
      const handle: StoredFileHandle = {
        context: { ...context },
        id: crypto.randomUUID(),
        lastModified: metadata.mtimeMs,
        mimeType: selectedFileMimeType(path),
        name: basename(path),
        path,
        size: metadata.size,
      };
      this.handles.set(handle.id, handle);
      created.push(handle);
    }
    while (this.handles.size > MAX_LIVE_HANDLES) {
      const oldest = this.handles.keys().next().value;
      if (typeof oldest !== 'string') {
        break;
      }
      this.handles.delete(oldest);
    }
    return created.map(({ context: _context, path: _path, ...handle }) => ({
      ...handle,
    }));
  }

  async readText(
    context: PluginFileContext,
    handleId: string
  ): Promise<string> {
    this.assertContext(context);
    const handle = this.handles.get(handleId);
    if (!(handle && sameContext(handle.context, context))) {
      throw new PluginFileError(
        'invalid-handle',
        'File handle is invalid or belongs to another plugin activation.'
      );
    }
    const metadata = await stat(handle.path);
    if (!(metadata.isFile() && metadata.size <= PLUGIN_TEXT_FILE_MAX_BYTES)) {
      throw new PluginFileError(
        'resource-limit',
        `Text files are limited to ${PLUGIN_TEXT_FILE_MAX_BYTES} bytes.`
      );
    }
    const bytes = await readFile(handle.path);
    if (bytes.byteLength > PLUGIN_TEXT_FILE_MAX_BYTES) {
      throw new PluginFileError(
        'resource-limit',
        `Text files are limited to ${PLUGIN_TEXT_FILE_MAX_BYTES} bytes.`
      );
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new PluginFileError(
        'invalid-encoding',
        'Text file is not valid UTF-8.'
      );
    }
  }

  release(context: PluginFileContext, handleIds: readonly string[]): void {
    this.assertContext(context);
    for (const id of handleIds) {
      const handle = this.handles.get(id);
      if (handle && sameContext(handle.context, context)) {
        this.handles.delete(id);
      }
    }
  }
}

export function pluginPickerFileTypes(extensions: readonly string[]): string {
  if (
    !Array.isArray(extensions) ||
    extensions.length < 1 ||
    extensions.length > 16 ||
    extensions.some(
      (extension) =>
        typeof extension !== 'string' ||
        extension !== extension.toLowerCase() ||
        !EXTENSION_RE.test(extension)
    ) ||
    new Set(extensions).size !== extensions.length
  ) {
    throw new PluginFileError(
      'invalid-context',
      'File picker requires 1–16 unique lowercase extensions.'
    );
  }
  return extensions.map((extension) => extension.slice(1)).join(',');
}
