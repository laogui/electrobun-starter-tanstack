import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  ContentBatchResult,
  NoteContentCreate,
  NoteContentSnapshot,
  NoteContentUpdate,
  NoteMetadata,
} from '../../../packages/plugin-sdk';
import type { PluginContentHistoryEvent } from '../../shared/plugins/contentHistory';
import { isPluginId } from '../../shared/plugins/ids';
import { blocksToPlainText, buildBlockNotePreview } from '../blocknotePreview';
import { buildNoteIndex, loadNoteRecord, type NoteRecord } from '../noteStore';
import {
  commitNoteFiles,
  NOTE_HISTORY_PATH,
  NOTE_INTENT_PATH,
  type NoteFileChange,
  NoteTransactionError,
  noteFilePath,
  readOptionalText,
  withNoteWorkspace,
} from '../noteTransactions';
import { assertCreationUnreferenced } from './noteCreation';
import type { PluginPermissionGate } from './permissions';

const OPERATION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_HISTORY_BYTES = 8 * 1024 * 1024;
interface Body {
  blocks: unknown[];
  preview?: unknown;
}
interface Change {
  after: NoteMetadata;
  afterBody?: Body;
  before: NoteMetadata;
  beforeBody?: Body;
  currentRevision: number;
  id: string;
}
interface CreatedNote {
  currentRevision: number;
  document: string;
  id: string;
}
interface Batch {
  changes: Change[];
  created?: CreatedNote[];
  id: string;
  label: string;
  pluginId: string;
  undone: boolean;
}
interface Receipt {
  fingerprint: string;
  id: string;
  pluginId: string;
  result: ContentBatchResult;
}
interface History {
  batches: Batch[];
  operations: Receipt[];
  schema:
    | 'ghostboard-content-history/v1'
    | 'ghostboard-content-history/v2'
    | 'ghostboard-content-history/v3';
}

function invalid(message: string): never {
  throw new NoteTransactionError('invalid-input', message);
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalid('Expected an object');
  }
  return value as Record<string, unknown>;
}
function string(value: unknown, max = 256): string {
  if (typeof value !== 'string' || value.length > max) {
    return invalid('Invalid string');
  }
  return value;
}
function revision(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value >= Number.MAX_SAFE_INTEGER
  ) {
    return invalid('Invalid revision');
  }
  return value;
}
function metadata(value: Record<string, unknown>): NoteMetadata {
  return {
    title: typeof value.title === 'string' ? value.title : '',
    color: typeof value.color === 'string' ? value.color : '',
    revision: revision(value.revision),
  };
}
function operationId(value: unknown): string {
  if (typeof value !== 'string' || !OPERATION_ID.test(value)) {
    return invalid('Invalid operation id');
  }
  return value;
}
function parseUpdates(value: unknown): NoteContentUpdate[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    return invalid('A batch requires 1–100 note updates');
  }
  const seen = new Set<string>();
  return value.map((raw) => {
    const item = record(raw);
    const id = string(item.id);
    noteFilePath('.', id);
    if (seen.has(id)) {
      return invalid('Duplicate note id in batch');
    }
    seen.add(id);
    const fields = record(item.changes);
    if (
      !Object.keys(fields).length ||
      Object.keys(fields).some(
        (key) => !['title', 'color', 'text'].includes(key)
      ) ||
      Object.keys(item).some(
        (key) => !['id', 'expectedRevision', 'changes'].includes(key)
      )
    ) {
      return invalid('Only title, color and text updates are supported');
    }
    const changes: NoteContentUpdate['changes'] = {};
    if ('title' in fields) {
      changes.title = string(fields.title);
    }
    if ('text' in fields) {
      const text = string(fields.text, 262_144);
      if (Buffer.byteLength(text) > 262_144) {
        return invalid('Body text exceeds 256 KiB');
      }
      changes.text = text.replace(/\r\n?/g, '\n');
    }
    if ('color' in fields) {
      changes.color = string(fields.color, 64);
    }
    return { id, expectedRevision: revision(item.expectedRevision), changes };
  });
}

function plainBody(text: string, id: string): Body {
  const blocks = text.split('\n').map((line, index) => ({
    id: `plugin-${id}-${index}`,
    type: 'paragraph',
    content: line ? [{ type: 'text', text: line, styles: {} }] : [],
    children: [],
  }));
  return { blocks, preview: buildBlockNotePreview(blocks) };
}
function parseCreates(value: unknown): NoteContentCreate[] {
  if (!(Array.isArray(value) && value.length) || value.length > 100) {
    invalid('A batch requires 1–100 notes');
  }
  return value.map((raw) => {
    const note = record(raw);
    if (
      Object.keys(note).some((key) => !['title', 'color', 'text'].includes(key))
    ) {
      invalid('Unsupported creation field');
    }
    const parsed = parseUpdates([
      {
        id: 'validation',
        expectedRevision: 0,
        changes: {
          title: note.title,
          ...(note.color === undefined ? {} : { color: note.color }),
          ...(note.text === undefined ? {} : { text: note.text }),
        },
      },
    ])[0]!;
    return {
      title: parsed.changes.title!,
      color: parsed.changes.color ?? '',
      text: parsed.changes.text ?? '',
    };
  });
}

async function readHistory(workspace: string): Promise<History> {
  const text = await readOptionalText(join(workspace, NOTE_HISTORY_PATH));
  if (text === null) {
    return {
      schema: 'ghostboard-content-history/v1',
      batches: [],
      operations: [],
    };
  }
  if (Buffer.byteLength(text) > MAX_HISTORY_BYTES) {
    throw new NoteTransactionError(
      'history-limit',
      'Content history exceeds 8 MiB'
    );
  }
  const data = record(JSON.parse(text));
  if (
    (data.schema !== 'ghostboard-content-history/v1' &&
      data.schema !== 'ghostboard-content-history/v2' &&
      data.schema !== 'ghostboard-content-history/v3') ||
    !Array.isArray(data.batches) ||
    !Array.isArray(data.operations)
  ) {
    throw new NoteTransactionError(
      'corrupt-history',
      'Invalid content history; original file retained'
    );
  }
  const schema: History['schema'] = data.schema;
  assertHistoryBatches(workspace, schema, data.batches);
  assertHistoryReceipts(workspace, data.operations);
  return {
    ...data,
    schema,
    batches: data.batches,
    operations: data.operations,
  };
}

/** Throws `corrupt-history` unless every persisted batch has the `Batch` shape. */
function assertHistoryBatches(
  workspace: string,
  schema: History['schema'],
  batches: unknown[]
): asserts batches is Batch[] {
  for (const raw of batches) {
    const batch = record(raw);
    operationId(batch.id);
    if (
      typeof batch.pluginId !== 'string' ||
      !isPluginId(batch.pluginId) ||
      typeof batch.label !== 'string' ||
      typeof batch.undone !== 'boolean' ||
      !Array.isArray(batch.changes)
    ) {
      throw new NoteTransactionError(
        'corrupt-history',
        'Invalid content history batch'
      );
    }
    if (batch.created !== undefined) {
      if (
        schema !== 'ghostboard-content-history/v3' ||
        !Array.isArray(batch.created) ||
        !batch.created.length ||
        batch.created.length > 100 ||
        batch.changes.length
      ) {
        throw new NoteTransactionError(
          'corrupt-history',
          'Invalid creation history'
        );
      }
      const createdIds = new Set<string>();
      for (const rawCreated of batch.created) {
        const created = record(rawCreated);
        const createdId = string(created.id);
        noteFilePath(workspace, createdId);
        if (createdIds.has(createdId)) {
          throw new NoteTransactionError(
            'corrupt-history',
            'Duplicate note in creation history'
          );
        }
        createdIds.add(createdId);
        const currentRevision = revision(created.currentRevision);
        const doc = record(
          JSON.parse(string(created.document, MAX_HISTORY_BYTES))
        );
        if (
          doc.schema !== 'ghostboard-blocknote/v1' ||
          doc.noteId !== created.id ||
          !Array.isArray(doc.blocks)
        ) {
          throw new NoteTransactionError(
            'corrupt-history',
            'Invalid created document'
          );
        }
        const documentRevision = metadata(doc).revision;
        if (
          (batch.undone && currentRevision !== documentRevision + 1) ||
          (!batch.undone && currentRevision !== documentRevision)
        ) {
          throw new NoteTransactionError(
            'corrupt-history',
            'Invalid creation history revision'
          );
        }
      }
    }
    for (const rawChange of batch.changes) {
      const change = record(rawChange);
      noteFilePath(workspace, string(change.id));
      metadata(record(change.before));
      metadata(record(change.after));
      revision(change.currentRevision);
      if ('beforeBody' in change || 'afterBody' in change) {
        for (const body of [change.beforeBody, change.afterBody]) {
          if (!Array.isArray(record(body).blocks)) {
            throw new NoteTransactionError(
              'corrupt-history',
              'Invalid body history'
            );
          }
        }
      }
    }
  }
}

/** Throws `corrupt-history` unless every persisted receipt has the `Receipt` shape. */
function assertHistoryReceipts(
  workspace: string,
  operations: unknown[]
): asserts operations is Receipt[] {
  for (const raw of operations) {
    const receipt = record(raw);
    operationId(receipt.id);
    const result = record(receipt.result);
    if (
      typeof receipt.pluginId !== 'string' ||
      typeof receipt.fingerprint !== 'string' ||
      result.operationId !== receipt.id ||
      !Array.isArray(result.items) ||
      typeof result.changed !== 'boolean'
    ) {
      throw new NoteTransactionError(
        'corrupt-history',
        'Invalid content operation receipt'
      );
    }
    for (const item of result.items) {
      const resultItem = record(item);
      noteFilePath(workspace, string(resultItem.id));
      metadata(resultItem);
    }
    if (
      result.removedIds !== undefined &&
      (!Array.isArray(result.removedIds) ||
        result.removedIds.some((id) => typeof id !== 'string'))
    ) {
      throw new NoteTransactionError(
        'corrupt-history',
        'Invalid removed note receipt'
      );
    }
    for (const removedId of result.removedIds ?? []) {
      noteFilePath(workspace, removedId as string);
    }
  }
}

function snapshot(note: NoteRecord): NoteContentSnapshot {
  if (note.corrupted) {
    throw new NoteTransactionError(
      'corrupt-content',
      `Corrupt note: ${note.noteId}`
    );
  }
  return {
    id: note.noteId,
    kind: 'note',
    title: note.title,
    color: note.color,
    source: note.source,
    revision: note.source === 'sidecar' ? note.revision : null,
    text: note.blocks
      ? blocksToPlainText(note.blocks)
      : (note.markdownDoc?.body ?? ''),
  };
}

/**
 * Plugin-initiated creation undo that would delete more than this many notes
 * needs main-process consent (`content.delete`).
 */
export const BULK_DELETE_CONFIRM_THRESHOLD = 1;

export interface NoteContentServiceOptions {
  /** Main-process consent gate for plugin-token callers. */
  permissions?: Pick<PluginPermissionGate, 'check'>;
}

export class NoteContentService {
  readonly workspace: string;
  readonly workspaceId: string;
  private readonly permissions: NoteContentServiceOptions['permissions'];
  constructor(
    workspace: string,
    workspaceId: string,
    options: NoteContentServiceOptions = {}
  ) {
    this.workspace = workspace;
    this.workspaceId = workspaceId;
    this.permissions = options.permissions;
  }

  /**
   * @param scope.pluginId When the caller authenticated with a plugin-scoped
   * token, the plugin id it was issued to; batches may only be recorded,
   * undone or redone under that id.
   */
  async handle(
    request: Request,
    cors: HeadersInit,
    scope: { pluginId?: string } = {}
  ): Promise<Response | null> {
    if (new URL(request.url).pathname !== '/plugins/content') {
      return null;
    }
    const headers = new Headers(cors);
    headers.set('Cache-Control', 'no-store');
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers });
    }
    let id: string | undefined;
    try {
      const text = await request.text();
      if (Buffer.byteLength(text) > 1_048_576) {
        return invalid('Content request exceeds 1 MiB');
      }
      const input = record(JSON.parse(text));
      if (input.workspaceId !== this.workspaceId) {
        throw new NoteTransactionError(
          'workspace-inactive',
          'Workspace is no longer active'
        );
      }
      const pluginId = string(input.pluginId, 200);
      if (!isPluginId(pluginId)) {
        return invalid('Invalid plugin id');
      }
      if (scope.pluginId !== undefined && pluginId !== scope.pluginId) {
        return Response.json(
          { code: 'forbidden', error: 'Token belongs to another plugin' },
          { status: 403, headers }
        );
      }
      id =
        typeof input.operationId === 'string' ? input.operationId : undefined;
      const result = await withNoteWorkspace(this.workspace, async () => {
        request.signal.throwIfAborted();
        if (input.action === 'get') {
          return { item: await this.get(string(input.id)) };
        }
        if (input.action === 'getMany') {
          if (!Array.isArray(input.ids) || input.ids.length > 500) {
            return invalid('getMany requires at most 500 note IDs');
          }
          const ids = input.ids.map((value) => string(value));
          const index = await buildNoteIndex(this.workspace);
          const items: (NoteContentSnapshot | null)[] = [];
          for (const id of ids) {
            request.signal.throwIfAborted();
            const location = index.get(id);
            const note = location
              ? await loadNoteRecord(this.workspace, id, location.markdownFile)
              : null;
            items.push(note ? snapshot(note) : null);
          }
          return { items };
        }
        if (input.action === 'query') {
          return this.query(input.query);
        }
        if (
          !['create', 'update', 'undo', 'redo'].includes(input.action as string)
        ) {
          return invalid('Unsupported content action');
        }
        return this.mutate(pluginId, input, request.signal, {
          pluginInitiated: scope.pluginId !== undefined,
        });
      });
      return Response.json(result, { headers });
    } catch (error) {
      const code =
        error instanceof NoteTransactionError ? error.code : 'content-error';
      return Response.json(
        {
          error:
            error instanceof Error ? error.message : 'Content operation failed',
          code,
          operationId: id,
        },
        {
          status: [
            'revision-conflict',
            'workspace-inactive',
            'operation-mismatch',
            'history-state',
            'content-referenced',
            'content-exists',
          ].includes(code)
            ? 409
            : code === 'invalid-input'
              ? 400
              : code === 'permission-denied'
                ? 403
                : 500,
          headers,
        }
      );
    }
  }

  private async get(id: string): Promise<NoteContentSnapshot | null> {
    const index = await buildNoteIndex(this.workspace);
    const location = index.get(id);
    if (!location) {
      return null;
    }
    const note = await loadNoteRecord(
      this.workspace,
      id,
      location.markdownFile
    );
    return note ? snapshot(note) : null;
  }

  private async query(
    raw: unknown
  ): Promise<{ items: NoteContentSnapshot[]; nextCursor: string | null }> {
    const query = raw === undefined ? {} : record(raw);
    if (
      Object.keys(query).some(
        (key) => !['text', 'after', 'limit'].includes(key)
      )
    ) {
      return invalid('Unsupported query field');
    }
    const limit = query.limit === undefined ? 100 : revision(query.limit);
    if (limit < 1 || limit > 500) {
      return invalid('Query limit must be 1–500');
    }
    const needle =
      query.text === undefined
        ? ''
        : string(query.text, 1024).toLocaleLowerCase();
    const after = query.after === undefined ? '' : string(query.after);
    const index = await buildNoteIndex(this.workspace);
    const items: NoteContentSnapshot[] = [];
    for (const id of [...index.keys()].sort()) {
      if (after && id <= after) {
        continue;
      }
      const note = await loadNoteRecord(
        this.workspace,
        id,
        index.get(id)?.markdownFile
      );
      if (!note) {
        continue;
      }
      const item = snapshot(note);
      if (
        needle &&
        !`${item.title}\n${item.text}`.toLocaleLowerCase().includes(needle)
      ) {
        continue;
      }
      items.push(item);
      if (items.length > limit) {
        return {
          items: items.slice(0, limit),
          nextCursor: items[limit - 1]!.id,
        };
      }
    }
    return { items, nextCursor: null };
  }

  private async mutate(
    pluginId: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
    origin: { pluginInitiated: boolean }
  ): Promise<ContentBatchResult> {
    const id = operationId(input.operationId);
    const action = input.action as 'create' | 'update' | 'undo' | 'redo';
    const creating = action === 'create';
    const forward = creating || action === 'update';
    const notes = creating ? parseCreates(input.notes) : undefined;
    const updates =
      action === 'update' ? parseUpdates(input.updates) : undefined;
    const label = forward ? string(input.label) : undefined;
    if (forward && !label?.trim()) {
      return invalid('A batch label is required');
    }
    const target = forward ? undefined : operationId(input.batchId);
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          action,
          updates,
          label,
          target,
          ...(notes ? { notes } : {}),
        })
      )
      .digest('hex');
    const history = await readHistory(this.workspace);
    const receipt = history.operations.find(
      (entry) => entry.id === id && entry.pluginId === pluginId
    );
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) {
        throw new NoteTransactionError(
          'operation-mismatch',
          'An operation id cannot be reused with different input'
        );
      }
      return receipt.result;
    }
    let batch: Batch;
    if (forward) {
      batch = { id, pluginId, label: label!, changes: [], undone: false };
    } else {
      const found = history.batches.find(
        (entry) => entry.id === target && entry.pluginId === pluginId
      );
      if (!found) {
        throw new NoteTransactionError(
          'history-missing',
          'No batch with this id belongs to the plugin'
        );
      }
      if ((action === 'undo') === found.undone) {
        throw new NoteTransactionError(
          'history-state',
          'Batch is already in the requested history state'
        );
      }
      batch = found;
    }
    if (creating || batch.created) {
      return this.mutateCreation({
        batch,
        notes,
        action,
        input,
        history,
        id,
        pluginId,
        fingerprint,
        signal,
        pluginInitiated: origin.pluginInitiated,
      });
    }
    const planned: (NoteContentUpdate & { body?: Body })[] =
      updates ??
      batch.changes.map((change) => ({
        id: change.id,
        expectedRevision: change.currentRevision,
        body: action === 'undo' ? change.beforeBody : change.afterBody,
        changes:
          action === 'undo'
            ? { title: change.before.title, color: change.before.color }
            : { title: change.after.title, color: change.after.color },
      }));
    const files: NoteFileChange[] = [];
    const items: ContentBatchResult['items'] = [];
    for (const update of planned) {
      const beforeText = await readOptionalText(
        noteFilePath(this.workspace, update.id)
      );
      if (beforeText === null) {
        throw new NoteTransactionError(
          'unsupported-content',
          `Missing or legacy note is not writable: ${update.id}`
        );
      }
      const before = record(JSON.parse(beforeText));
      if (
        before.schema !== 'ghostboard-blocknote/v1' ||
        before.noteId !== update.id ||
        !Array.isArray(before.blocks)
      ) {
        throw new NoteTransactionError(
          'corrupt-content',
          `Invalid sidecar: ${update.id}`
        );
      }
      const current = metadata(before);
      if (current.revision !== update.expectedRevision) {
        throw new NoteTransactionError(
          'revision-conflict',
          `Note ${update.id} changed since it was read`
        );
      }
      const { text, ...fields } = update.changes;
      let body = update.body;
      if (text !== undefined) {
        body = plainBody(text, id);
      }
      const bodyChanged =
        body !== undefined &&
        JSON.stringify(body.blocks) !== JSON.stringify(before.blocks);
      const next = { ...current, ...fields };
      if (
        next.title !== current.title ||
        next.color !== current.color ||
        bodyChanged
      ) {
        next.revision = current.revision + 1;
        files.push({
          id: update.id,
          before: beforeText,
          after: JSON.stringify(
            {
              ...before,
              ...next,
              ...(bodyChanged
                ? { blocks: body!.blocks, preview: body!.preview }
                : {}),
              updatedAt: new Date().toISOString(),
            },
            null,
            2
          ),
        });
        if (action === 'update') {
          batch.changes.push({
            id: update.id,
            before: current,
            after: next,
            ...(bodyChanged
              ? {
                  beforeBody: {
                    blocks: before.blocks as unknown[],
                    preview: before.preview,
                  },
                  afterBody: body,
                }
              : {}),
            currentRevision: next.revision,
          });
        }
      }
      items.push({ id: update.id, ...next });
      if (action !== 'update') {
        batch.changes.find(
          (change) => change.id === update.id
        )!.currentRevision = next.revision;
      }
    }
    if (
      history.schema !== 'ghostboard-content-history/v3' &&
      batch.changes.some((change) => change.beforeBody !== undefined)
    ) {
      // Older hosts must reject this history instead of undoing metadata alone.
      history.schema = 'ghostboard-content-history/v2';
    }
    if (action === 'update' && files.length) {
      history.batches.push(batch);
    }
    if (action !== 'update') {
      batch.undone = action === 'undo';
    }
    const result: ContentBatchResult = {
      operationId: id,
      items,
      changed: files.length > 0,
    };
    await this.commitMutation(
      history,
      files,
      { id, pluginId, fingerprint, result },
      signal,
      files.length
        ? {
            action: action === 'update' ? 'record' : action,
            batchId: batch.id,
            label: batch.label,
            operationId: id,
            pluginId,
          }
        : undefined
    );
    return result;
  }
  private async commitMutation(
    history: History,
    files: NoteFileChange[],
    receipt: Receipt,
    signal: AbortSignal,
    hostHistory?: PluginContentHistoryEvent
  ): Promise<void> {
    const { id, pluginId, fingerprint, result } = receipt;
    history.operations.push({ id, pluginId, fingerprint, result });
    const historyText = JSON.stringify(history);
    if (Buffer.byteLength(historyText) > MAX_HISTORY_BYTES) {
      throw new NoteTransactionError(
        'history-limit',
        'Content history is full; no changes were written'
      );
    }
    signal.throwIfAborted();
    try {
      await commitNoteFiles(this.workspace, files, historyText, hostHistory);
    } catch (error) {
      if (
        (await readOptionalText(join(this.workspace, NOTE_INTENT_PATH))) !==
        null
      ) {
        throw new NoteTransactionError(
          'commit-pending',
          'Transaction intent is durable but completion needs recovery; retry the identical operation id'
        );
      }
      throw error;
    }
  }

  private async mutateCreation({
    batch,
    notes,
    action,
    input,
    history,
    id,
    pluginId,
    fingerprint,
    signal,
    pluginInitiated,
  }: {
    batch: Batch;
    notes?: NoteContentCreate[];
    action: string;
    input: Record<string, unknown>;
    history: History;
    id: string;
    pluginId: string;
    fingerprint: string;
    signal: AbortSignal;
    pluginInitiated: boolean;
  }): Promise<ContentBatchResult> {
    const index = await buildNoteIndex(this.workspace);
    if (notes) {
      batch.created = notes.map((note) => {
        const noteId = `plugin_note_${randomUUID().replaceAll('-', '')}`;
        const body = plainBody(note.text ?? '', noteId);
        const now = new Date().toISOString();
        return {
          id: noteId,
          currentRevision: 1,
          document: JSON.stringify(
            {
              schema: 'ghostboard-blocknote/v1',
              noteId,
              title: note.title,
              color: note.color ?? '',
              displayHint: 'note',
              revision: 1,
              createdAt: now,
              updatedAt: now,
              ...body,
            },
            null,
            2
          ),
        };
      });
    }
    const created = batch.created!;
    if (action === 'undo') {
      await assertCreationUnreferenced(
        this.workspace,
        created.map((note) => note.id),
        input.protectedIds ?? []
      );
    }
    if (
      action === 'undo' &&
      pluginInitiated &&
      created.length > BULK_DELETE_CONFIRM_THRESHOLD
    ) {
      // Asked in the Bun process: a renderer-side confirm is bypassable by
      // same-realm plugin code. Host (renderer-token) undo is user-driven.
      const allowed = await this.permissions?.check(
        pluginId,
        'content.delete',
        `Undoing “${batch.label}” would delete ${created.length} notes this plugin created.`
      );
      if (!allowed) {
        throw new NoteTransactionError(
          'permission-denied',
          'Deleting these notes was not allowed'
        );
      }
    }
    const files: NoteFileChange[] = [];
    const items: ContentBatchResult['items'] = [];
    for (const note of created) {
      const path = noteFilePath(this.workspace, note.id);
      const before = await readOptionalText(path);
      if (action === 'undo') {
        if (before !== note.document) {
          throw new NoteTransactionError(
            'revision-conflict',
            'A created note has changed; creation undo rejected'
          );
        }
        note.currentRevision = revision(note.currentRevision) + 1;
        files.push({ id: note.id, before, after: null });
      } else {
        if (before !== null || index.has(note.id)) {
          throw new NoteTransactionError(
            'content-exists',
            'Created note ID is already occupied'
          );
        }
        if (action === 'redo') {
          note.currentRevision = revision(note.currentRevision) + 1;
          note.document = JSON.stringify(
            {
              ...record(JSON.parse(note.document)),
              revision: note.currentRevision,
              updatedAt: new Date().toISOString(),
            },
            null,
            2
          );
        }
        files.push({ id: note.id, before: null, after: note.document });
        items.push({
          id: note.id,
          ...metadata(record(JSON.parse(note.document))),
        });
      }
    }
    history.schema = 'ghostboard-content-history/v3';
    if (notes) {
      history.batches.push(batch);
    }
    batch.undone = action === 'undo';
    const result: ContentBatchResult = {
      operationId: id,
      changed: true,
      items,
      ...(action === 'undo'
        ? { removedIds: created.map((note) => note.id) }
        : {}),
    };
    await this.commitMutation(
      history,
      files,
      { id, pluginId, fingerprint, result },
      signal,
      {
        action: notes ? 'record' : (action as 'redo' | 'undo'),
        batchId: batch.id,
        label: batch.label,
        operationId: id,
        pluginId,
      }
    );
    return result;
  }
}
