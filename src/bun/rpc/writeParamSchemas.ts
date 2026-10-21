import { z } from 'zod';

/**
 * Runtime shape checks for RPC handlers that write to disk. The renderer and
 * trusted plugins share one realm, so a renderer bug (or a plugin poking the
 * bridge) must not be able to persist structurally broken data.
 *
 * Schemas are deliberately structural and `loose()`: they pin the fields the
 * main process relies on and let unknown/forward-compatible keys through, so
 * a valid save is never rejected for carrying extra data. Deeper semantic
 * checks (path containment, id formats) stay in the domain modules.
 */

const id = z.string().min(1).max(512);
const record = z.record(z.string(), z.unknown());
const finite = z.number();

const manifestNode = z
  .object({
    data: record,
    id,
    parentId: z.string().optional(),
    position: z.object({ x: finite, y: finite }).loose(),
    type: z.string().optional(),
  })
  .loose();

const manifestEdge = z
  .object({
    data: record.optional(),
    id,
    source: id,
    target: id,
  })
  .loose();

const attachmentKind = z.enum(['audio', 'file', 'image', 'video']);
const widgetKind = z.enum(['checklist', 'pomodoro', 'reminder']);

const widgetRecord = z
  .object({
    data: record,
    id,
    kind: widgetKind,
    title: z.string(),
  })
  .loose();

const nodeMetadata = z
  .object({
    tag: z.string().optional(),
    tagColor: z.string().optional(),
    tagColors: z.record(z.string(), z.string()).optional(),
    tags: z.array(z.string()).optional(),
  })
  .loose();

const presentation = record;

export const RPC_WRITE_PARAM_SCHEMAS = {
  saveManifest: z
    .object({
      edges: z.array(manifestEdge),
      nodes: z.array(manifestNode),
      viewId: id,
    })
    .loose(),
  createWidget: z
    .object({ kind: widgetKind, title: z.string().optional() })
    .loose(),
  cloneWidget: z.object({ widgetId: id }).loose(),
  saveWidget: z.object({ widget: widgetRecord }).loose(),
  deleteWidget: z.object({ widgetId: id }).loose(),
  extensionInstanceCreate: z
    .object({
      canvasTypeId: id,
      dataVersion: z.number().int().nonnegative(),
      id: id.optional(),
      presentation,
      state: z.unknown(),
    })
    .loose(),
  extensionInstanceUpdate: z
    .object({
      dataVersion: z.number().int().nonnegative().optional(),
      expectedRevision: z.number().int().optional(),
      instanceId: id,
      presentation,
      state: z.unknown(),
    })
    .loose(),
  extensionInstanceClone: z.object({ instanceId: id }).loose(),
  extensionInstanceClearType: z.object({ canvasTypeId: id }).loose(),
  extensionEnablementSetEnabled: z
    .object({ canvasTypeId: id, enabled: z.boolean() })
    .loose(),
  saveNote: z
    .object({ body: z.string(), frontmatter: record, noteId: id })
    .loose(),
  saveBlockNote: z
    .object({
      blocks: z.array(z.unknown()),
      frontmatter: record,
      markdown: z.string(),
      noteId: id,
      revision: z.number().int().optional(),
    })
    .loose(),
  createNote: z
    .object({ displayHint: z.string(), id, title: z.string() })
    .loose(),
  deleteNote: z.object({ noteId: id }).loose(),
  saveAttachment: z
    .object({
      dataUrl: z.string().min(1),
      existingFile: z.string().optional(),
      kind: attachmentKind.optional(),
      mimeType: z.string().optional(),
      suggestedName: z.string().optional(),
    })
    .loose(),
  saveAttachmentFile: z
    .object({
      kind: attachmentKind.optional(),
      mimeType: z.string().optional(),
      sourcePath: z.string().min(1),
      suggestedName: z.string().optional(),
    })
    .loose(),
  saveSettings: record,
  setAIApiKey: z
    .object({
      apiKey: z.string().nullable(),
      provider: z.string().optional(),
    })
    .loose(),
  restoreTrash: z.object({ trashId: id }).loose(),
  purgeTrash: z.object({ trashId: id }).loose(),
  deleteUnlinkedNotes: z.object({ files: z.array(z.string()) }).loose(),
  activateLicense: z.object({ key: z.string().max(64) }).loose(),
  createView: z.object({ name: z.string().max(512) }).loose(),
  deleteView: z.object({ viewId: id }).loose(),
  restoreView: z.object({ trashId: id }).loose(),
  renameView: z.object({ name: z.string().max(512), viewId: id }).loose(),
  setActiveView: z.object({ viewId: id }).loose(),
  renameTag: z
    .object({ newName: z.string().min(1), oldName: z.string().min(1) })
    .loose(),
  deleteTag: z.object({ name: z.string().min(1) }).loose(),
  setNodeMetadata: z.object({ id, metadata: nodeMetadata }).loose(),
  deleteNodeMetadata: z.object({ id }).loose(),
  createViewFromTemplate: z
    .object({ name: z.string().max(512), templateId: id })
    .loose(),
  saveTemplateThumbnail: z
    .object({ pngBase64: z.string().min(1), templateId: id })
    .loose(),
} satisfies Record<string, z.ZodType>;

export class RpcParamsError extends Error {
  readonly method: string;

  constructor(method: string, detail: string) {
    super(`Invalid params for ${method}: ${detail}`);
    this.name = 'RpcParamsError';
    this.method = method;
  }
}

/** Throws `RpcParamsError` when `params` does not match `method`'s schema. */
export function assertRpcWriteParams(method: string, params: unknown): void {
  const schema = (RPC_WRITE_PARAM_SCHEMAS as Record<string, z.ZodType>)[method];
  if (!schema) {
    return;
  }
  const result = schema.safeParse(params);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? issue.path.join('.') : '(root)';
    throw new RpcParamsError(
      method,
      `${where}: ${issue?.message ?? 'invalid'}`
    );
  }
}

type HandlerMap = Record<string, (...args: any[]) => unknown>;

/**
 * Wrap an RPC request-handler map so every write handler with a schema
 * validates its params before running. Read handlers pass through untouched.
 */
export function withRpcWriteValidation<T extends HandlerMap>(handlers: T): T {
  const wrapped: HandlerMap = { ...handlers };
  for (const method of Object.keys(RPC_WRITE_PARAM_SCHEMAS)) {
    const handler = handlers[method];
    if (!handler) {
      continue;
    }
    wrapped[method] = (params: unknown, ...rest: unknown[]) => {
      try {
        assertRpcWriteParams(method, params);
      } catch (error) {
        console.warn(`[rpc] ${(error as Error).message}`);
        return Promise.reject(error);
      }
      return handler(params, ...rest);
    };
  }
  return wrapped as T;
}
