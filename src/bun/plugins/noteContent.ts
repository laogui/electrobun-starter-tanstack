import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type {
  ContentBatchResult,
  NoteContentSnapshot,
  NoteContentUpdate,
  NoteMetadata,
} from '../../../packages/plugin-sdk';
import { isPluginId } from '../../shared/plugins/ids';
import { blocksToPlainText } from '../blocknotePreview';
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

const OPERATION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_HISTORY_BYTES = 8 * 1024 * 1024;
interface Change {
  after: NoteMetadata;
  before: NoteMetadata;
  currentRevision: number;
  id: string;
}
interface Batch {
  changes: Change[];
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
  schema: 'ghostboard-content-history/v1';
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
      Object.keys(fields).some((key) => !['title', 'color'].includes(key)) ||
      Object.keys(item).some(
        (key) => !['id', 'expectedRevision', 'changes'].includes(key)
      )
    ) {
      return invalid('Only title and color updates are supported');
    }
    const changes: NoteContentUpdate['changes'] = {};
    if ('title' in fields) {
      changes.title = string(fields.title);
    }
    if ('color' in fields) {
      changes.color = string(fields.color, 64);
    }
    return { id, expectedRevision: revision(item.expectedRevision), changes };
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
    data.schema !== 'ghostboard-content-history/v1' ||
    !Array.isArray(data.batches) ||
    !Array.isArray(data.operations)
  ) {
    throw new NoteTransactionError(
      'corrupt-history',
      'Invalid content history; original file retained'
    );
  }
  for (const raw of data.batches) {
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
    for (const rawChange of batch.changes) {
      const change = record(rawChange);
      noteFilePath(workspace, string(change.id));
      metadata(record(change.before));
      metadata(record(change.after));
      revision(change.currentRevision);
    }
  }
  for (const raw of data.operations) {
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
      metadata(record(item));
    }
  }
  return data as unknown as History;
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

export class NoteContentService {
  readonly workspace: string;
  readonly workspaceId: string;
  constructor(workspace: string, workspaceId: string) {
    this.workspace = workspace;
    this.workspaceId = workspaceId;
  }

  async handle(request: Request, cors: HeadersInit): Promise<Response | null> {
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
        if (!['update', 'undo', 'redo'].includes(input.action as string)) {
          return invalid('Unsupported content action');
        }
        return this.mutate(pluginId, input, request.signal);
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
          ].includes(code)
            ? 409
            : code === 'invalid-input'
              ? 400
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
    signal: AbortSignal
  ): Promise<ContentBatchResult> {
    const id = operationId(input.operationId);
    const action = input.action as 'update' | 'undo' | 'redo';
    const updates =
      action === 'update' ? parseUpdates(input.updates) : undefined;
    const label = action === 'update' ? string(input.label) : undefined;
    if (action === 'update' && !label?.trim()) {
      return invalid('A batch label is required');
    }
    const target = action === 'update' ? undefined : operationId(input.batchId);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ action, updates, label, target }))
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
    if (action === 'update') {
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
    const planned =
      updates ??
      batch.changes.map((change) => ({
        id: change.id,
        expectedRevision: change.currentRevision,
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
      const next = { ...current, ...update.changes };
      if (next.title !== current.title || next.color !== current.color) {
        next.revision = current.revision + 1;
        files.push({
          id: update.id,
          before: beforeText,
          after: JSON.stringify(
            { ...before, ...next, updatedAt: new Date().toISOString() },
            null,
            2
          ),
        });
        if (action === 'update') {
          batch.changes.push({
            id: update.id,
            before: current,
            after: next,
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
      await commitNoteFiles(this.workspace, files, historyText);
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
    return result;
  }
}
