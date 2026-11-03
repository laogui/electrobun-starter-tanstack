import { z } from 'zod';

import type { AIAction, AITaskResult } from './types';

/**
 * Zod mirrors of the AI contract. Used twice on every task:
 * 1. Bun — as the `generateObject` output schema (model side).
 * 2. Renderer — to re-validate task results before preview/apply, so a
 *    misbehaving model can never reach the canvas store.
 */

export const AI_TASK_TYPES = [
  'summarize_selection',
  'generate_board',
  'organize_selection',
  'search_workspace',
  'extract_image_notes',
] as const;

export const AI_NODE_KINDS = ['card', 'group', 'sticky'] as const;

export const aiPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const aiSizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
});

const aiEditableData = z
  .object({
    title: z.string().optional(),
    content: z.string().optional(),
    color: z.string().optional(),
    label: z.string().optional(),
    description: z.string().optional(),
  })
  .strict();

export const aiActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create_node'),
    tempId: z.string().min(1),
    nodeKind: z.enum(AI_NODE_KINDS),
    position: aiPositionSchema,
    data: aiEditableData,
    size: aiSizeSchema.optional(),
  }),
  z.object({
    type: z.literal('update_node'),
    nodeId: z.string().min(1),
    updates: aiEditableData,
  }),
  z.object({
    type: z.literal('move_node'),
    nodeId: z.string().min(1),
    position: aiPositionSchema,
  }),
  z.object({
    type: z.literal('create_edge'),
    source: z.string().min(1),
    target: z.string().min(1),
    label: z.string().optional(),
  }),
  z.object({
    type: z.literal('create_group'),
    tempId: z.string().min(1),
    label: z.string(),
    color: z.string().optional(),
    childIds: z.array(z.string().min(1)).min(1),
  }),
]);

export const aiUsageSchema = z.object({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  latencyMs: z.number().optional(),
  model: z.string().optional(),
});

export const aiTaskResultSchema = z.object({
  task: z.enum(AI_TASK_TYPES),
  answer: z.string(),
  actions: z.array(aiActionSchema),
  warnings: z.array(z.string()).optional(),
  usage: aiUsageSchema.optional(),
});

/** Validate an untrusted task result. Returns null when invalid. */
export function parseAITaskResult(raw: unknown): AITaskResult | null {
  const parsed = aiTaskResultSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Validate a raw action list, keeping only well-formed entries. Returns the
 * accepted actions plus a warning per dropped one.
 */
export function filterValidAIActions(raw: unknown[]): {
  actions: AIAction[];
  warnings: string[];
} {
  const actions: AIAction[] = [];
  const warnings: string[] = [];
  for (const [index, item] of raw.entries()) {
    const parsed = aiActionSchema.safeParse(item);
    if (parsed.success) {
      actions.push(parsed.data);
    } else {
      warnings.push(`Dropped malformed AI action at index ${index}`);
    }
  }
  return { actions, warnings };
}
