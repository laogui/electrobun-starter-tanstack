import { z } from 'zod';

import { AI_PROVIDERS } from '../../shared/ai/providerConfig';

/**
 * Runtime shape checks for RPC handlers that write to disk, so a renderer bug
 * cannot persist structurally broken data.
 *
 * Schemas are deliberately structural and `loose()`: they pin the fields the
 * main process relies on and let unknown/forward-compatible keys through, so
 * a valid save is never rejected for carrying extra data. Deeper semantic
 * checks (path containment, id formats) stay in the domain modules.
 */

const id = z.string().min(1).max(512);
const record = z.record(z.string(), z.unknown());
const finite = z.number();
const folderChildren = z
  .array(z.object({ id, type: id.optional(), data: record }).loose())
  .superRefine((children, ctx) => {
    const ids = new Set<string>();
    for (const [index, child] of children.entries()) {
      if (ids.has(child.id)) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'id'],
          message: 'Duplicate folder child',
        });
      }
      ids.add(child.id);
    }
  });

const manifestNode = z
  .object({
    data: record,
    id,
    parentId: z.string().optional(),
    position: z.object({ x: finite, y: finite }).loose(),
    type: z.string().optional(),
  })
  .loose()
  .superRefine((node, ctx) => {
    if (node.type !== 'folder' || node.data.children === undefined) {
      return;
    }
    const parsed = folderChildren.safeParse(node.data.children);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ ...issue, path: ['data', 'children', ...issue.path] });
      }
    }
  });

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
    tag: z.string().nullish(),
    tagColor: z.string().nullish(),
    tagColors: z.record(z.string(), z.string()).nullish(),
    tags: z.array(z.string()).nullish(),
  })
  .loose();

const presentation = record;

export const RPC_WRITE_PARAM_SCHEMAS = {
  quarantineDamagedTrash: z.object({ trashId: id, token: id }),
  restoreCanvasSnapshot: z.object({
    name: id,
    nodes: z.array(manifestNode.safeExtend({ type: id })),
    edges: z.array(manifestEdge),
    workspacePath: z.string().optional(),
  }),
  finishCanvasClones: z.object({
    tokens: z.array(id).max(1000),
    liveReferences: z.array(id),
  }),
  resolveTransactionRecovery: z.object({
    id: z.literal('canvas'),
    token: id,
    action: z.enum(['retry', 'quarantine']),
  }),
  confirmCanvasRecovery: z.object({ viewId: id, token: id }),
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
  saveNote: z
    .object({ body: z.string(), frontmatter: record, noteId: id })
    .loose(),
  saveBlockNote: z
    .object({
      blocks: z.array(z.unknown()),
      frontmatter: record,
      markdown: z.string().optional(),
      noteId: id,
      revision: z.number().int().optional(),
    })
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
  saveSettings: record,
  setAIApiKey: z
    .object({
      apiKey: z.string().nullable(),
      provider: z.enum(AI_PROVIDERS).optional(),
    })
    .loose(),
  restoreTrash: z.object({ trashId: id }).loose(),
  purgeTrash: z.object({ trashId: id }).loose(),
  deleteUnlinkedNotes: z.object({ files: z.array(z.string()) }).loose(),
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
        const failure = {
          success: false,
          error: 'invalid-params',
          method,
          message: (error as Error).message,
        };
        // Methods with collection/count replies still return their normal empty shape.
        if (method === 'finishCanvasClones') {
          return Promise.resolve({ ...failure, removed: [], retained: [] });
        }
        if (method === 'deleteUnlinkedNotes') {
          return Promise.resolve({
            ...failure,
            deleted: [],
            skipped: Array.isArray((params as { files?: unknown })?.files)
              ? (params as { files: string[] }).files
              : [],
          });
        }
        if (method === 'renameTag' || method === 'deleteTag') {
          return Promise.resolve({ ...failure, updated: 0 });
        }
        return Promise.resolve(failure);
      }
      return handler(params, ...rest);
    };
  }
  return wrapped as T;
}
