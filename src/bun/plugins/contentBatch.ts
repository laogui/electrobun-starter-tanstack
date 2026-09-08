import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type {
  ContentApplyBatchArgs,
  ContentApplyBatchResult,
  ContentSelectionItem,
} from '../../shared/plugins/protocol';
import { applyNoteTitle, loadNoteRecord } from '../noteStore';

export const CONTENT_BATCH_MAX_OPERATIONS = 100;
export const CONTENT_TITLE_MAX_LENGTH = 256;
export const NOTE_TITLE_BATCH_JOURNAL =
  'content/.ghostboard/plugin-title-batch.json';

export class ContentBatchError extends Error {
  code:
    | 'invalid-state'
    | 'permission-denied'
    | 'protocol-error'
    | 'resource-limit'
    | 'revision-conflict'
    | 'unsupported-capability';

  constructor(code: ContentBatchError['code'], message: string) {
    super(message);
    this.name = 'ContentBatchError';
    this.code = code;
  }
}

export interface ContentEntityRecord {
  entityId: string;
  revision: number;
  title: string;
}

export interface ContentEntityBackend {
  get(
    entityId: string
  ): ContentEntityRecord | Promise<ContentEntityRecord | undefined> | undefined;
  put(record: ContentEntityRecord): Promise<void> | void;
}

interface FrozenItem {
  entityId: string;
  revision: number;
  title: string;
  token: string;
}

interface HistoryChange {
  afterRevision: number;
  afterTitle: string;
  beforeRevision: number;
  beforeTitle: string;
  entityId: string;
  ref: string;
}

interface HistoryEntry {
  changes: HistoryChange[];
  label: string;
  operationId: string;
  undone: boolean;
  workspaceId: string;
}

interface BatchFile {
  entities?: Record<string, ContentEntityRecord>;
  history: HistoryEntry[];
  persistEntities?: boolean;
  schema: 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function generateToken(): string {
  return `plgsel_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
}

export class MemoryContentBackend implements ContentEntityBackend {
  private readonly records = new Map<string, ContentEntityRecord>();

  seed(records: ContentEntityRecord[]): void {
    for (const record of records) {
      this.records.set(record.entityId, { ...record });
    }
  }

  get(entityId: string): ContentEntityRecord | undefined {
    const record = this.records.get(entityId);
    return record ? { ...record } : undefined;
  }

  put(record: ContentEntityRecord): void {
    this.records.set(record.entityId, { ...record });
  }

  snapshot(): Record<string, ContentEntityRecord> {
    return Object.fromEntries(this.records);
  }

  restore(entities: Record<string, ContentEntityRecord>): void {
    this.records.clear();
    for (const [entityId, record] of Object.entries(entities)) {
      this.records.set(entityId, { ...record });
    }
  }
}

export class NoteSidecarContentBackend implements ContentEntityBackend {
  private readonly workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  async get(entityId: string): Promise<ContentEntityRecord | undefined> {
    const record = await loadNoteRecord(this.workspacePath, entityId);
    if (!record || record.corrupted) {
      return;
    }
    if (record.source !== 'sidecar') {
      throw new ContentBatchError(
        'unsupported-capability',
        `legacy markdown notes cannot be title-batched: ${entityId}`
      );
    }
    return {
      entityId: record.noteId,
      title: record.title,
      revision: record.revision,
    };
  }

  async put(record: ContentEntityRecord): Promise<void> {
    await applyNoteTitle(this.workspacePath, record.entityId, {
      title: record.title,
      revision: record.revision,
    });
  }
}

export class ContentBatchStore {
  private readonly backend: ContentEntityBackend;
  private readonly freezes = new Map<string, FrozenItem[]>();
  private history: HistoryEntry[] = [];
  private readonly filePath?: string;
  private readonly persistEntities: boolean;

  constructor(
    filePath?: string,
    backend: ContentEntityBackend = new MemoryContentBackend(),
    persistEntities = true
  ) {
    this.backend = backend;
    this.filePath = filePath;
    this.persistEntities = persistEntities;
  }

  static async open(filePath: string): Promise<ContentBatchStore> {
    const store = new ContentBatchStore(filePath);
    await store.load();
    return store;
  }

  static async openNotes(workspacePath: string): Promise<ContentBatchStore> {
    const store = new ContentBatchStore(
      join(workspacePath, NOTE_TITLE_BATCH_JOURNAL),
      new NoteSidecarContentBackend(workspacePath),
      false
    );
    await store.load();
    return store;
  }

  seed(records: ContentEntityRecord[]): void {
    if (!(this.backend instanceof MemoryContentBackend)) {
      throw new ContentBatchError(
        'invalid-state',
        'seed is only available on the memory backend'
      );
    }
    this.backend.seed(records);
  }

  async freezeSelection(input: {
    entityIds: string[];
    operationId: string;
  }): Promise<ContentSelectionItem[]> {
    const seen = new Set<string>();
    const items: FrozenItem[] = [];
    for (const entityId of input.entityIds) {
      if (seen.has(entityId)) {
        continue;
      }
      seen.add(entityId);
      const record = await this.backend.get(entityId);
      if (!record) {
        throw new ContentBatchError(
          'invalid-state',
          `unknown content entity: ${entityId}`
        );
      }
      items.push({
        entityId,
        token: generateToken(),
        title: record.title,
        revision: record.revision,
      });
    }
    this.freezes.set(input.operationId, items);
    return items.map((item) => ({
      token: item.token,
      ref: item.token,
      title: item.title,
      revision: item.revision,
    }));
  }

  readSelection(operationId: string): { items: ContentSelectionItem[] } {
    const freeze = this.freezes.get(operationId);
    if (!freeze) {
      throw new ContentBatchError(
        'invalid-state',
        'selection is not frozen for this operation'
      );
    }
    return {
      items: freeze.map((item) => ({
        token: item.token,
        ref: item.token,
        title: item.title,
        revision: item.revision,
      })),
    };
  }

  async get(entityId: string): Promise<ContentEntityRecord | undefined> {
    const record = await this.backend.get(entityId);
    return record ? { ...record } : undefined;
  }

  async applyBatch(
    operationId: string,
    workspaceId: string,
    args: unknown
  ): Promise<ContentApplyBatchResult> {
    const parsed = parseApplyBatchArgs(args);
    if (parsed.operationId !== operationId) {
      throw new ContentBatchError(
        'invalid-state',
        'operationId does not match the host-issued operation'
      );
    }
    const existing = this.history.find(
      (entry) => entry.operationId === operationId
    );
    if (existing && !existing.undone) {
      return {
        operationId,
        results: existing.changes.map((change) => ({
          ref: change.ref,
          title: change.afterTitle,
          revision: change.afterRevision,
        })),
      };
    }
    if (parsed.operations.length > CONTENT_BATCH_MAX_OPERATIONS) {
      throw new ContentBatchError(
        'resource-limit',
        `batch exceeds ${CONTENT_BATCH_MAX_OPERATIONS} operations`
      );
    }
    const freeze = this.freezes.get(operationId);
    if (!freeze) {
      throw new ContentBatchError(
        'invalid-state',
        'selection is not frozen for this operation'
      );
    }
    const byToken = new Map(freeze.map((item) => [item.token, item]));
    const seenTokens = new Set<string>();
    const planned: HistoryChange[] = [];
    for (const operation of parsed.operations) {
      if (seenTokens.has(operation.ref)) {
        throw new ContentBatchError(
          'invalid-state',
          `duplicate ref in batch: ${operation.ref}`
        );
      }
      seenTokens.add(operation.ref);
      const frozen = byToken.get(operation.ref);
      if (!frozen) {
        throw new ContentBatchError(
          'permission-denied',
          'batch ref is outside the frozen selection'
        );
      }
      const current = await this.backend.get(frozen.entityId);
      if (!current) {
        throw new ContentBatchError(
          'invalid-state',
          `missing content entity for ${operation.ref}`
        );
      }
      if (
        current.revision !== operation.expectedRevision ||
        frozen.revision !== operation.expectedRevision ||
        current.title !== frozen.title
      ) {
        throw new ContentBatchError(
          'revision-conflict',
          `stale revision for ${operation.ref}`
        );
      }
      if (current.title === operation.set.title) {
        continue;
      }
      planned.push({
        entityId: frozen.entityId,
        ref: operation.ref,
        beforeTitle: current.title,
        beforeRevision: current.revision,
        afterTitle: operation.set.title,
        afterRevision: current.revision + 1,
      });
    }

    for (const change of planned) {
      await this.backend.put({
        entityId: change.entityId,
        title: change.afterTitle,
        revision: change.afterRevision,
      });
    }
    if (planned.length > 0) {
      this.history.push({
        operationId,
        workspaceId,
        label: parsed.label ?? 'content.applyBatch',
        undone: false,
        changes: planned,
      });
      if (this.history.length > 50) {
        this.history = this.history.slice(-50);
      }
    }
    await this.persist();
    const results: ContentApplyBatchResult['results'] = [];
    for (const operation of parsed.operations) {
      const frozen = byToken.get(operation.ref);
      const record = frozen
        ? await this.backend.get(frozen.entityId)
        : undefined;
      results.push({
        ref: operation.ref,
        title: record?.title ?? operation.set.title,
        revision: record?.revision ?? operation.expectedRevision,
      });
    }
    return { operationId, results };
  }

  async undo(operationId: string): Promise<ContentApplyBatchResult> {
    const entry = this.history.find((item) => item.operationId === operationId);
    if (!entry || entry.undone) {
      throw new ContentBatchError(
        'invalid-state',
        'nothing to undo for this operation'
      );
    }
    const restored: HistoryChange[] = [];
    for (const change of entry.changes) {
      const current = await this.backend.get(change.entityId);
      if (!current) {
        continue;
      }
      if (current.revision !== change.afterRevision) {
        continue;
      }
      await this.backend.put({
        entityId: change.entityId,
        title: change.beforeTitle,
        revision: change.beforeRevision,
      });
      restored.push(change);
    }
    entry.undone = true;
    await this.persist();
    return {
      operationId,
      results: restored.map((change) => ({
        ref: change.ref,
        title: change.beforeTitle,
        revision: change.beforeRevision,
      })),
    };
  }

  async redo(operationId: string): Promise<ContentApplyBatchResult> {
    const entry = this.history.find((item) => item.operationId === operationId);
    if (!entry?.undone) {
      throw new ContentBatchError(
        'invalid-state',
        'nothing to redo for this operation'
      );
    }
    const applied: HistoryChange[] = [];
    for (const change of entry.changes) {
      const current = await this.backend.get(change.entityId);
      if (!current) {
        continue;
      }
      if (current.revision !== change.beforeRevision) {
        continue;
      }
      await this.backend.put({
        entityId: change.entityId,
        title: change.afterTitle,
        revision: change.afterRevision,
      });
      applied.push(change);
    }
    entry.undone = false;
    await this.persist();
    return {
      operationId,
      results: applied.map((change) => ({
        ref: change.ref,
        title: change.afterTitle,
        revision: change.afterRevision,
      })),
    };
  }

  private async load(): Promise<void> {
    if (!this.filePath) {
      return;
    }
    if (!existsSync(this.filePath)) {
      return;
    }
    const parsed = JSON.parse(
      await readFile(this.filePath, 'utf8')
    ) as BatchFile;
    if (parsed.schema !== 1 || !Array.isArray(parsed.history)) {
      throw new ContentBatchError('protocol-error', 'invalid batch store file');
    }
    this.history = parsed.history;
    if (
      this.persistEntities &&
      this.backend instanceof MemoryContentBackend &&
      isRecord(parsed.entities)
    ) {
      this.backend.restore(parsed.entities);
    }
  }

  private async persist(): Promise<void> {
    if (!this.filePath) {
      return;
    }
    const payload: BatchFile = {
      schema: 1,
      persistEntities: this.persistEntities,
      history: this.history,
    };
    if (this.persistEntities && this.backend instanceof MemoryContentBackend) {
      payload.entities = this.backend.snapshot();
    }
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`);
    await rename(tempPath, this.filePath);
  }
}

function parseApplyBatchArgs(value: unknown): ContentApplyBatchArgs {
  if (!isRecord(value)) {
    throw new ContentBatchError(
      'protocol-error',
      'applyBatch args must be an object'
    );
  }
  const operationId = value.operationId;
  const label = value.label;
  if (typeof operationId !== 'string' || operationId.length === 0) {
    throw new ContentBatchError(
      'protocol-error',
      'applyBatch operationId is required'
    );
  }
  if (label !== undefined && typeof label !== 'string') {
    throw new ContentBatchError(
      'protocol-error',
      'applyBatch label must be a string'
    );
  }
  if (!Array.isArray(value.operations)) {
    throw new ContentBatchError(
      'protocol-error',
      'applyBatch operations must be an array'
    );
  }
  const operations: ContentApplyBatchArgs['operations'] = [];
  for (const entry of value.operations) {
    if (!(isRecord(entry) && isRecord(entry.set))) {
      throw new ContentBatchError(
        'protocol-error',
        'batch operation must be an object'
      );
    }
    const ref =
      typeof entry.ref === 'string'
        ? entry.ref
        : typeof entry.token === 'string'
          ? entry.token
          : '';
    const title = entry.set.title;
    const expectedRevision = entry.expectedRevision;
    if (
      !(
        ref &&
        typeof title === 'string' &&
        typeof expectedRevision === 'number' &&
        Number.isSafeInteger(expectedRevision)
      )
    ) {
      throw new ContentBatchError(
        'protocol-error',
        'batch operation needs ref, expectedRevision, and set.title'
      );
    }
    if (title.length > CONTENT_TITLE_MAX_LENGTH) {
      throw new ContentBatchError(
        'resource-limit',
        `title exceeds ${CONTENT_TITLE_MAX_LENGTH} characters`
      );
    }
    const extraKeys = Object.keys(entry.set).filter((key) => key !== 'title');
    if (extraKeys.length > 0) {
      throw new ContentBatchError(
        'unsupported-capability',
        `unsupported batch fields: ${extraKeys.join(', ')}`
      );
    }
    operations.push({
      ref,
      expectedRevision,
      set: { title },
    });
  }
  return { operationId, label, operations };
}
