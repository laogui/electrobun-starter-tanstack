import {
  appendFile,
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';

import {
  PLUGIN_DIRECTORY_PAGE_MAX_ENTRIES,
  PLUGIN_FILE_TRANSFER_CHUNK_BYTES,
  PLUGIN_FILE_TRANSFER_MAX_BYTES,
  PLUGIN_TEXT_FILE_MAX_BYTES,
  type PluginDirectoryEntryData,
  type PluginDirectoryHandleData,
  type PluginDirectoryListRequest,
  type PluginFileContext,
  type PluginFileHandleData,
  type PluginFileSystemHandleData,
} from '../../shared/plugins/files';
import { isPluginId } from '../../shared/plugins/ids';

const MAX_LIVE_HANDLES = 512;
const MAX_LIVE_WRITES = 8;
const WRITE_REQUEST_MAX_BYTES = 16 * 1024;
const WRITE_SESSION_MAX_AGE_MS = 10 * 60 * 1000;
const ACTIVATION_ID_RE = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const BYTE_RANGE_RE = /^bytes=(\d+)-(\d+)$/;
const EXTENSION_RE = /^\.[a-z0-9][a-z0-9+_-]{0,15}$/;
const PATH_SEGMENT_RE = /[\\/]/;

interface StoredDirectoryHandle extends PluginDirectoryHandleData {
  context: PluginFileContext;
  path: string;
}

interface StoredFileHandle extends PluginFileHandleData {
  context: PluginFileContext;
  path: string;
}

type StoredHandle = StoredDirectoryHandle | StoredFileHandle;

interface StoredWrite {
  bytesWritten: number;
  context: PluginFileContext;
  createdAt: number;
  directoryHandleId: string;
  overwrite: boolean;
  targetPath: string;
  temporaryPath: string;
}

function selectedFileMimeType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.csv':
      return 'text/csv';
    case '.json':
      return 'application/json';
    case '.md':
      return 'text/markdown';
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
    | 'invalid-path'
    | 'not-directory'
    | 'not-file'
    | 'resource-limit';

  constructor(code: PluginFileError['code'], message: string) {
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

function publicHandle(handle: StoredHandle): PluginFileSystemHandleData {
  const { context: _context, path: _path, ...result } = handle;
  return { ...result };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function optionalLstat(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function parseCursor(cursor: string | undefined): number {
  if (cursor === undefined) {
    return 0;
  }
  const value = Number(cursor);
  if (
    !(Number.isSafeInteger(value) && value >= 0 && String(value) === cursor)
  ) {
    throw new PluginFileError('invalid-path', 'Invalid directory cursor.');
  }
  return value;
}

function parseRequiredRange(value: string | null, size: number) {
  const match = BYTE_RANGE_RE.exec(value ?? '');
  if (!match) {
    throw new PluginFileError(
      'invalid-path',
      'A bounded byte range is required.'
    );
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (
    !(Number.isSafeInteger(start) && Number.isSafeInteger(end)) ||
    start < 0 ||
    end < start ||
    end >= size ||
    end - start + 1 > PLUGIN_FILE_TRANSFER_CHUNK_BYTES
  ) {
    throw new PluginFileError(
      'resource-limit',
      'Invalid or oversized byte range.'
    );
  }
  return { end, start };
}

function resolveRelativeWritePath(root: string, value: string): string {
  if (
    !value ||
    value.length > 1024 ||
    value.includes('\0') ||
    isAbsolute(value) ||
    value
      .split(PATH_SEGMENT_RE)
      .some((part) => !part || part === '.' || part === '..')
  ) {
    throw new PluginFileError('invalid-path', 'Output path must be relative.');
  }
  const target = resolve(root, value);
  const fromRoot = relative(root, target);
  if (
    !fromRoot ||
    fromRoot === '..' ||
    fromRoot.startsWith('../') ||
    fromRoot.startsWith('..\\') ||
    isAbsolute(fromRoot)
  ) {
    throw new PluginFileError(
      'invalid-path',
      'Output path escapes the selected directory.'
    );
  }
  return target;
}

async function assertSafeWritePath(
  root: string,
  target: string
): Promise<void> {
  const rootMetadata = await lstat(root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new PluginFileError(
      'not-directory',
      'Selected directory is unavailable.'
    );
  }
  const fromRoot = relative(root, target);
  const parts = fromRoot ? fromRoot.split(PATH_SEGMENT_RE) : [];
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    const metadata = await optionalLstat(current);
    if (metadata?.isSymbolicLink()) {
      throw new PluginFileError(
        'invalid-path',
        'Plugin file writes do not follow symbolic links.'
      );
    }
  }
}

async function readBoundedBody(
  request: Request,
  maximum: number
): Promise<Uint8Array> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximum) {
    throw new PluginFileError('resource-limit', 'Request body is too large.');
  }
  if (!request.body) {
    return new Uint8Array();
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      throw new PluginFileError('resource-limit', 'Request body is too large.');
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export class PluginFileStore {
  private readonly handles = new Map<string, StoredHandle>();
  private readonly workspaceId: string;
  private readonly writes = new Map<string, StoredWrite>();

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

  private assertHandle<TKind extends StoredHandle['kind']>(
    context: PluginFileContext,
    handleId: string,
    kind: TKind
  ): Extract<StoredHandle, { kind: TKind }> {
    this.assertContext(context);
    const handle = this.handles.get(handleId);
    if (!(handle && sameContext(handle.context, context))) {
      throw new PluginFileError(
        'invalid-handle',
        'File handle is invalid or belongs to another plugin activation.'
      );
    }
    if (handle.kind !== kind) {
      throw new PluginFileError(
        kind === 'file' ? 'not-file' : 'not-directory',
        `Selected handle is not a ${kind}.`
      );
    }
    return handle as Extract<StoredHandle, { kind: TKind }>;
  }

  private async registerPath(
    context: PluginFileContext,
    path: string
  ): Promise<StoredHandle> {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) {
      throw new PluginFileError(
        'invalid-path',
        'Plugin file handles do not follow symbolic links.'
      );
    }
    let handle: StoredHandle;
    if (metadata.isFile()) {
      handle = {
        context: { ...context },
        id: crypto.randomUUID(),
        kind: 'file',
        lastModified: metadata.mtimeMs,
        mimeType: selectedFileMimeType(path),
        name: basename(path),
        path,
        size: metadata.size,
      };
    } else if (metadata.isDirectory()) {
      handle = {
        context: { ...context },
        id: crypto.randomUUID(),
        kind: 'directory',
        name: basename(path),
        path,
      };
    } else {
      throw new PluginFileError(
        'invalid-path',
        'Selected path is not a regular file or directory.'
      );
    }
    this.handles.set(handle.id, handle);
    while (this.handles.size > MAX_LIVE_HANDLES) {
      const oldest = this.handles.keys().next().value;
      if (typeof oldest !== 'string') {
        break;
      }
      this.releaseHandle(oldest);
    }
    return handle;
  }

  async registerSelection(
    context: PluginFileContext,
    paths: readonly string[],
    kind: 'directory' | 'file' = 'file'
  ): Promise<PluginFileSystemHandleData[]> {
    this.assertContext(context);
    if (paths.length > 16) {
      throw new PluginFileError(
        'resource-limit',
        'File selection is limited to 16 items.'
      );
    }
    const created: StoredHandle[] = [];
    try {
      for (const path of paths) {
        const handle = await this.registerPath(context, path);
        if (handle.kind !== kind) {
          this.releaseHandle(handle.id);
          throw new PluginFileError(
            kind === 'file' ? 'not-file' : 'not-directory',
            `Selected path is not a ${kind}.`
          );
        }
        created.push(handle);
      }
      return created.map(publicHandle);
    } catch (error) {
      for (const handle of created) {
        this.releaseHandle(handle.id);
      }
      throw error;
    }
  }

  async listDirectory(request: PluginDirectoryListRequest): Promise<{
    entries: PluginDirectoryEntryData[];
    nextCursor: string | null;
    success: true;
  }> {
    const directory = this.assertHandle(request, request.handleId, 'directory');
    const metadata = await lstat(directory.path);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new PluginFileError(
        'not-directory',
        'Selected directory is unavailable.'
      );
    }
    const limit = request.limit ?? PLUGIN_DIRECTORY_PAGE_MAX_ENTRIES;
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > PLUGIN_DIRECTORY_PAGE_MAX_ENTRIES
    ) {
      throw new PluginFileError(
        'resource-limit',
        `Directory pages are limited to ${PLUGIN_DIRECTORY_PAGE_MAX_ENTRIES} entries.`
      );
    }
    const offset = parseCursor(request.cursor);
    const sorted = (
      await readdir(directory.path, { withFileTypes: true })
    ).sort((left, right) => left.name.localeCompare(right.name));
    const end = Math.min(offset + limit, sorted.length);
    const entries: PluginDirectoryEntryData[] = [];
    for (const entry of sorted.slice(offset, end)) {
      if (entry.isFile() || entry.isDirectory()) {
        const handle = await this.registerPath(
          request,
          join(directory.path, entry.name)
        );
        entries.push({
          handle: publicHandle(handle),
          kind: handle.kind,
          name: entry.name,
        });
      } else {
        entries.push({ kind: 'symlink', name: entry.name });
      }
    }
    return {
      entries,
      nextCursor: end < sorted.length ? String(end) : null,
      success: true,
    };
  }

  async readText(
    context: PluginFileContext,
    handleId: string
  ): Promise<string> {
    const handle = this.assertHandle(context, handleId, 'file');
    const metadata = await lstat(handle.path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new PluginFileError('not-file', 'Selected path is not a file.');
    }
    if (metadata.size > PLUGIN_TEXT_FILE_MAX_BYTES) {
      throw new PluginFileError(
        'resource-limit',
        `Text files are limited to ${PLUGIN_TEXT_FILE_MAX_BYTES} bytes.`
      );
    }
    const file = await open(handle.path, 'r');
    try {
      const bytes = new Uint8Array(metadata.size);
      const result = await file.read(bytes, 0, bytes.byteLength, 0);
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(
          bytes.subarray(0, result.bytesRead)
        );
      } catch {
        throw new PluginFileError(
          'invalid-encoding',
          'Text file is not valid UTF-8.'
        );
      }
    } finally {
      await file.close();
    }
  }

  async handle(
    request: Request,
    corsHeaders: HeadersInit
  ): Promise<Response | null> {
    const url = new URL(request.url);
    if (url.pathname === '/plugins/files/read') {
      return this.handleRead(request, url, corsHeaders);
    }
    if (url.pathname === '/plugins/files/write') {
      return this.handleWrite(request, url, corsHeaders);
    }
    return null;
  }

  private contextFromUrl(url: URL): PluginFileContext {
    return {
      activationId: url.searchParams.get('activationId') ?? '',
      pluginId: url.searchParams.get('pluginId') ?? '',
      workspaceId: url.searchParams.get('workspaceId') ?? '',
    };
  }

  private async handleRead(
    request: Request,
    url: URL,
    corsHeaders: HeadersInit
  ): Promise<Response> {
    const headers = new Headers(corsHeaders);
    headers.set('Cache-Control', 'no-store');
    headers.set('Accept-Ranges', 'bytes');
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method not allowed', { status: 405, headers });
    }
    try {
      const context = this.contextFromUrl(url);
      const handle = this.assertHandle(
        context,
        url.searchParams.get('handleId') ?? '',
        'file'
      );
      const metadata = await lstat(handle.path);
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new PluginFileError('not-file', 'Selected path is not a file.');
      }
      const range = parseRequiredRange(
        request.headers.get('range'),
        metadata.size
      );
      headers.set('Content-Type', handle.mimeType);
      headers.set('Content-Length', String(range.end - range.start + 1));
      headers.set(
        'Content-Range',
        `bytes ${range.start}-${range.end}/${metadata.size}`
      );
      if (request.method === 'HEAD') {
        return new Response(null, { status: 206, headers });
      }
      const file = await open(handle.path, 'r');
      try {
        const bytes = new Uint8Array(range.end - range.start + 1);
        const result = await file.read(bytes, 0, bytes.byteLength, range.start);
        return new Response(bytes.subarray(0, result.bytesRead), {
          status: 206,
          headers,
        });
      } finally {
        await file.close();
      }
    } catch (error) {
      return new Response(errorMessage(error), { status: 400, headers });
    }
  }

  private async handleWrite(
    request: Request,
    url: URL,
    corsHeaders: HeadersInit
  ): Promise<Response> {
    const headers = new Headers(corsHeaders);
    headers.set('Cache-Control', 'no-store');
    try {
      const context = this.contextFromUrl(url);
      this.assertContext(context);
      const action = url.searchParams.get('action');
      if (request.method === 'POST' && action === 'begin') {
        const bytes = await readBoundedBody(request, WRITE_REQUEST_MAX_BYTES);
        const raw = JSON.parse(new TextDecoder().decode(bytes));
        return Response.json(await this.beginWrite(context, raw), { headers });
      }
      const uploadId = url.searchParams.get('uploadId') ?? '';
      if (request.method === 'POST' && action === 'chunk') {
        const offset = Number(url.searchParams.get('offset'));
        const bytes = await readBoundedBody(
          request,
          PLUGIN_FILE_TRANSFER_CHUNK_BYTES
        );
        return Response.json(
          await this.appendWrite(context, uploadId, offset, bytes),
          { headers }
        );
      }
      if (request.method === 'POST' && action === 'commit') {
        return Response.json(await this.commitWrite(context, uploadId), {
          headers,
        });
      }
      if (request.method === 'DELETE' && action === 'cancel') {
        await this.cancelWrite(context, uploadId);
        return Response.json({ success: true }, { headers });
      }
      return new Response('Method not allowed', { status: 405, headers });
    } catch (error) {
      return Response.json(
        { error: errorMessage(error), success: false },
        { status: 400, headers }
      );
    }
  }

  private async beginWrite(
    context: PluginFileContext,
    raw: unknown
  ): Promise<{ uploadId: string }> {
    await this.cleanupWrites();
    if (this.writes.size >= MAX_LIVE_WRITES) {
      throw new PluginFileError(
        'resource-limit',
        `At most ${MAX_LIVE_WRITES} plugin file writes may be active.`
      );
    }
    if (!raw || typeof raw !== 'object') {
      throw new PluginFileError('invalid-path', 'Invalid file write request.');
    }
    const input = raw as Record<string, unknown>;
    if (
      typeof input.directoryHandleId !== 'string' ||
      typeof input.relativePath !== 'string' ||
      (input.overwrite !== undefined && typeof input.overwrite !== 'boolean')
    ) {
      throw new PluginFileError('invalid-path', 'Invalid file write request.');
    }
    const directory = this.assertHandle(
      context,
      input.directoryHandleId,
      'directory'
    );
    const targetPath = resolveRelativeWritePath(
      directory.path,
      input.relativePath
    );
    const parent = dirname(targetPath);
    await assertSafeWritePath(directory.path, parent);
    await mkdir(parent, { recursive: true });
    await assertSafeWritePath(directory.path, targetPath);
    const overwrite = input.overwrite === true;
    const existing = await optionalLstat(targetPath);
    if (existing && !(overwrite && existing.isFile())) {
      throw new PluginFileError(
        'invalid-path',
        overwrite
          ? 'The output path is not a regular file.'
          : 'The output file already exists.'
      );
    }
    const uploadId = crypto.randomUUID();
    const temporaryPath = join(
      parent,
      `.ghostboard-plugin-write-${uploadId}.tmp`
    );
    await writeFile(temporaryPath, new Uint8Array(), { flag: 'wx' });
    this.writes.set(uploadId, {
      bytesWritten: 0,
      context: { ...context },
      createdAt: Date.now(),
      directoryHandleId: directory.id,
      overwrite,
      targetPath,
      temporaryPath,
    });
    return { uploadId };
  }

  private async appendWrite(
    context: PluginFileContext,
    uploadId: string,
    offset: number,
    bytes: Uint8Array
  ): Promise<{ written: number }> {
    const write = this.assertWrite(context, uploadId);
    if (
      !Number.isSafeInteger(offset) ||
      offset !== write.bytesWritten ||
      bytes.byteLength < 1 ||
      bytes.byteLength > PLUGIN_FILE_TRANSFER_CHUNK_BYTES ||
      write.bytesWritten + bytes.byteLength > PLUGIN_FILE_TRANSFER_MAX_BYTES
    ) {
      throw new PluginFileError(
        'resource-limit',
        'Plugin file write chunk or total size exceeds its limit.'
      );
    }
    await appendFile(write.temporaryPath, bytes);
    write.bytesWritten += bytes.byteLength;
    return { written: write.bytesWritten };
  }

  private async commitWrite(
    context: PluginFileContext,
    uploadId: string
  ): Promise<{ file: PluginFileHandleData }> {
    const write = this.assertWrite(context, uploadId);
    const directory = this.assertHandle(
      context,
      write.directoryHandleId,
      'directory'
    );
    await assertSafeWritePath(directory.path, write.targetPath);
    const existing = await optionalLstat(write.targetPath);
    if (existing && !(write.overwrite && existing.isFile())) {
      throw new PluginFileError(
        'invalid-path',
        write.overwrite
          ? 'The output path is not a regular file.'
          : 'The output file already exists.'
      );
    }
    await rename(write.temporaryPath, write.targetPath);
    this.writes.delete(uploadId);
    const handle = await this.registerPath(context, write.targetPath);
    if (handle.kind !== 'file') {
      throw new PluginFileError('not-file', 'Written output is not a file.');
    }
    return { file: publicHandle(handle) as PluginFileHandleData };
  }

  private async cancelWrite(
    context: PluginFileContext,
    uploadId: string
  ): Promise<void> {
    const write = this.assertWrite(context, uploadId);
    this.writes.delete(uploadId);
    await rm(write.temporaryPath, { force: true });
  }

  private assertWrite(
    context: PluginFileContext,
    uploadId: string
  ): StoredWrite {
    const write = this.writes.get(uploadId);
    if (!(write && sameContext(write.context, context))) {
      throw new PluginFileError(
        'invalid-handle',
        'File write is invalid or belongs to another plugin activation.'
      );
    }
    return write;
  }

  private async cleanupWrites(): Promise<void> {
    const cutoff = Date.now() - WRITE_SESSION_MAX_AGE_MS;
    const expired = [...this.writes.entries()].filter(
      ([, write]) => write.createdAt < cutoff
    );
    await Promise.all(
      expired.map(async ([id, write]) => {
        this.writes.delete(id);
        await rm(write.temporaryPath, { force: true });
      })
    );
  }

  release(context: PluginFileContext, handleIds: readonly string[]): void {
    this.assertContext(context);
    for (const id of handleIds) {
      const handle = this.handles.get(id);
      if (handle && sameContext(handle.context, context)) {
        this.releaseHandle(id);
      }
    }
  }

  revokePlugin(pluginId: string): void {
    for (const handle of this.handles.values()) {
      if (handle.context.pluginId === pluginId) {
        this.releaseHandle(handle.id);
      }
    }
  }

  private releaseHandle(id: string): void {
    this.handles.delete(id);
    for (const [uploadId, write] of this.writes) {
      if (write.directoryHandleId === id) {
        this.writes.delete(uploadId);
        rm(write.temporaryPath, { force: true }).catch(() => undefined);
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
