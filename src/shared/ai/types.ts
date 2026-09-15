/**
 * Shared AI data contract between the Bun task layer (model calls) and the
 * renderer apply pipeline (canvas mutations).
 *
 * Design rules (docs/features/Backlog/ai-integration-plan.md §7):
 * - Model output is always structured `AIAction[]` + a short explanation.
 * - The renderer previews and applies actions; Bun never writes the store.
 * - Everything crossing the RPC boundary is validated with zod (schema.ts).
 */

export type AITaskType =
  | 'summarize_selection'
  | 'generate_board'
  | 'organize_selection'
  | 'search_workspace'
  | 'extract_image_notes';

/** A canvas node serialized for model consumption (renderer → Bun). */
export interface AINodeContext {
  content?: string;
  id: string;
  nodeType: string;
  /** Card note id — Bun enriches these with the full note body. */
  noteId?: string;
  parentId?: string;
  position: { x: number; y: number };
  size?: { width?: number; height?: number };
  tags?: string[];
  title?: string;
  /** Position among its siblings, so the model sees the outline's order. */
  topicOrder?: number;
  /** Parent Topic in the mind-map tree. Deliberately separate from
   *  `parentId`, which is the Group container and carries no hierarchy. */
  topicParentId?: string;
}

/** The "live context" slice the renderer sends with every task. */
export interface AIContext {
  nodes: AINodeContext[];
  viewId?: string;
}

/** Node kinds AI may create. Mirrors a subset of `CanvasNodeKind`. */
export type AINodeKind = 'card' | 'group' | 'sticky';

/**
 * A single canvas mutation proposed by an AI task. `tempId` / `source` /
 * `target` / `childIds` may reference temp ids of other `create_node` /
 * `create_group` actions in the same batch; the renderer resolves them while
 * applying.
 */
export type AIAction =
  | {
      type: 'create_node';
      tempId: string;
      nodeKind: AINodeKind;
      position: { x: number; y: number };
      data: Record<string, unknown>;
      size?: { width: number; height: number };
    }
  | {
      type: 'update_node';
      nodeId: string;
      updates: Record<string, unknown>;
    }
  | {
      type: 'move_node';
      nodeId: string;
      position: { x: number; y: number };
    }
  | {
      type: 'create_edge';
      source: string;
      target: string;
      label?: string;
    }
  | {
      type: 'create_group';
      tempId: string;
      label: string;
      color?: string;
      childIds: string[];
    };

export interface AIUsage {
  inputTokens?: number;
  latencyMs?: number;
  model?: string;
  outputTokens?: number;
}

/** Structured result of one AI task (Bun → renderer). */
export interface AITaskResult {
  actions: AIAction[];
  /** Human-readable explanation / preview body (markdown). */
  answer: string;
  task: AITaskType;
  usage?: AIUsage;
  warnings?: string[];
}

export interface AIRunTaskParams {
  context: AIContext;
  /** Optional free-form instruction layered on top of the task prompt. */
  prompt?: string;
  task: AITaskType;
}

/** Stable error codes the renderer maps to localized messages. */
export type AITaskErrorCode =
  | 'ai-disabled'
  | 'empty-selection'
  | 'model-error'
  | 'rpc-unavailable'
  | 'unsupported-task';

export type AIRunTaskResponse =
  | { success: true; result: AITaskResult }
  | { success: false; error: AITaskErrorCode; errorMessage?: string };
