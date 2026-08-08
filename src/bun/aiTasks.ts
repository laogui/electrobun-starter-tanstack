import { generateObject } from 'ai';
import { z } from 'zod';

import type {
  AIContext,
  AINodeContext,
  AIRunTaskParams,
  AIRunTaskResponse,
  AITaskResult,
} from '../shared/ai/types';
import { type AIServerConfig, resolveModel } from './ai';
import { blocksToPlainText } from './blocknotePreview';
import { loadNoteRecord } from './noteStore';

/**
 * Canvas-level AI task layer (docs/features/Backlog/ai-integration-plan.md).
 *
 * Bun is responsible for "thinking" only: it calls the model, validates the
 * structured output, and returns `AIAction[]` proposals. The renderer owns
 * preview, apply, undo snapshots, and persistence.
 */

const TASK_TIMEOUT_MS = 60_000;
const MAX_NODES_PER_TASK = 40;
const MAX_CONTENT_CHARS_PER_NODE = 2000;
const MAX_CONTENT_CHARS_TOTAL = 24_000;
const SUMMARY_CARD_GAP = 80;

/** Default node sizes (mirror `src/mainview/lib/canvasNodeRegistry.ts`). */
const DEFAULT_NODE_SIZES = {
  card: { width: 350, height: 450 },
  sticky: { width: 200, height: 200 },
  group: { width: 500, height: 300 },
} as const;

/** Size fallback for a serialized node type (unknown types get card size). */
function defaultSizeFor(nodeType: string): { height: number; width: number } {
  if (nodeType === 'card' || nodeType === 'sticky' || nodeType === 'group') {
    return DEFAULT_NODE_SIZES[nodeType];
  }
  return DEFAULT_NODE_SIZES.card;
}

const truncate = (value: string, limit: number): string =>
  value.length <= limit ? value : `${value.slice(0, limit)}…`;

/**
 * Structured output contract for `summarize_selection`. Keep it shallow —
 * small models produce reliable flat objects with short string arrays.
 */
export const summarizeSelectionSchema = z.object({
  title: z.string().describe('Short title (<= 40 chars) for the summary card'),
  theme: z.string().describe('One-sentence core theme of the selection'),
  keyPoints: z
    .array(z.string())
    .max(8)
    .describe('Most important points, each one short sentence'),
  todos: z
    .array(z.string())
    .max(8)
    .describe('Action items found in the selection, empty when none'),
  risks: z
    .array(z.string())
    .max(8)
    .describe('Risks / open questions / gaps, empty when none'),
  nextSteps: z
    .array(z.string())
    .max(5)
    .describe('Concrete suggested next steps'),
});

export type SummarizeSelectionOutput = z.infer<typeof summarizeSelectionSchema>;

/** Fetch full note bodies for card nodes so the model sees more than titles. */
export async function enrichContext(
  wsPath: string,
  context: AIContext
): Promise<AIContext> {
  const enriched = await Promise.all(
    context.nodes.map(async (node) => {
      if (!(node.noteId && node.nodeType === 'card')) {
        return node;
      }
      const record = await loadNoteRecord(wsPath, node.noteId).catch(
        () => null
      );
      if (!record) {
        return node;
      }
      const body =
        record.source === 'markdown' && record.markdownDoc
          ? record.markdownDoc.body
          : blocksToPlainText(record.blocks);
      if (!body.trim()) {
        return node;
      }
      const merged = [node.content, body].filter(Boolean).join('\n\n');
      return {
        ...node,
        title: node.title || record.title,
        content: truncate(merged, MAX_CONTENT_CHARS_PER_NODE),
      };
    })
  );
  return { ...context, nodes: enriched };
}

function formatNodeForPrompt(node: AINodeContext): string {
  const parts = [`[${node.nodeType}] id=${node.id}`];
  if (node.title) {
    parts.push(`title=${node.title}`);
  }
  if (node.tags?.length) {
    parts.push(`tags=${node.tags.join(',')}`);
  }
  const head = parts.join(' ');
  return node.content ? `${head}\n${node.content}` : head;
}

/**
 * Serialize the context into a prompt body with a hard token budget. Nodes
 * are kept whole until the budget is exhausted; later nodes are skipped with
 * a marker so the model knows the input was clipped.
 */
export function buildContextPrompt(context: AIContext): string {
  const lines: string[] = [];
  let used = 0;
  let clipped = 0;
  for (const node of context.nodes.slice(0, MAX_NODES_PER_TASK)) {
    const block = formatNodeForPrompt(node);
    if (used + block.length > MAX_CONTENT_CHARS_TOTAL) {
      clipped += 1;
      continue;
    }
    used += block.length;
    lines.push(block);
  }
  const skippedByCap = Math.max(0, context.nodes.length - MAX_NODES_PER_TASK);
  const omitted = clipped + skippedByCap;
  if (omitted > 0) {
    lines.push(`(…${omitted} more node(s) omitted for length)`);
  }
  return lines.join('\n\n');
}

const SUMMARIZE_SYSTEM_PROMPT = `You are the built-in AI of GhostBoard, a spatial whiteboard where users arrange cards, sticky notes and groups.
You always answer with the structured object requested — never with prose outside the schema.
Match the primary language of the provided node contents (e.g. answer in Chinese when the cards are in Chinese).
Be concise and specific; quote facts only when they appear in the provided nodes; never invent details.`;

/** Compute where the summary card should land: right of the selection bbox. */
export function computeSummaryCardPosition(nodes: AINodeContext[]): {
  x: number;
  y: number;
} {
  const cardSize = DEFAULT_NODE_SIZES.card;
  if (nodes.length === 0) {
    return { x: 0, y: 0 };
  }
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    const size = defaultSizeFor(node.nodeType);
    const width = node.size?.width ?? size.width;
    const height = node.size?.height ?? size.height;
    maxX = Math.max(maxX, node.position.x + width);
    minY = Math.min(minY, node.position.y);
    maxY = Math.max(maxY, node.position.y + height);
  }
  return {
    x: Math.round(maxX + SUMMARY_CARD_GAP),
    y: Math.round((minY + maxY) / 2 - cardSize.height / 2),
  };
}

const bulletList = (items: string[]): string =>
  items.map((item) => `- ${item}`).join('\n');

/** Fold the structured summary into the markdown stored on the card. */
export function buildSummaryCardMarkdown(
  output: SummarizeSelectionOutput
): string {
  const sections: string[] = [`**${output.theme}**`];
  if (output.keyPoints.length > 0) {
    sections.push(`## Key points\n${bulletList(output.keyPoints)}`);
  }
  if (output.todos.length > 0) {
    sections.push(
      `## To-dos\n${output.todos.map((item) => `- [ ] ${item}`).join('\n')}`
    );
  }
  if (output.risks.length > 0) {
    sections.push(`## Risks & open questions\n${bulletList(output.risks)}`);
  }
  if (output.nextSteps.length > 0) {
    sections.push(`## Next steps\n${bulletList(output.nextSteps)}`);
  }
  return sections.join('\n\n');
}

async function runSummarizeSelection(
  params: AIRunTaskParams,
  config: AIServerConfig,
  wsPath: string
): Promise<AIRunTaskResponse> {
  const selection = params.context.nodes;
  if (selection.length === 0) {
    return { success: false, error: 'empty-selection' };
  }

  const context = await enrichContext(wsPath, params.context);
  const startedAt = Date.now();
  const instruction = params.prompt?.trim()
    ? `\n\nAdditional instruction from the user: ${params.prompt.trim()}`
    : '';

  let object: SummarizeSelectionOutput;
  let usage: { inputTokens?: number; outputTokens?: number } | undefined;
  try {
    const result = await generateObject({
      model: resolveModel(config),
      schema: summarizeSelectionSchema,
      system: SUMMARIZE_SYSTEM_PROMPT,
      prompt: `Summarize the following ${context.nodes.length} selected canvas node(s) into a single summary card.${instruction}\n\n${buildContextPrompt(context)}`,
      abortSignal: AbortSignal.timeout(TASK_TIMEOUT_MS),
    });
    object = result.object;
    const rawUsage = result.usage as
      | {
          inputTokens?: number;
          outputTokens?: number;
          promptTokens?: number;
          completionTokens?: number;
        }
      | undefined;
    usage = {
      inputTokens: rawUsage?.inputTokens ?? rawUsage?.promptTokens,
      outputTokens: rawUsage?.outputTokens ?? rawUsage?.completionTokens,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[aiTasks] summarize_selection failed:', message);
    return { success: false, error: 'model-error', errorMessage: message };
  }

  const position = computeSummaryCardPosition(selection);
  const markdown = buildSummaryCardMarkdown(object);
  const result: AITaskResult = {
    task: 'summarize_selection',
    answer: markdown,
    actions: [
      {
        type: 'create_node',
        tempId: 'summary-card',
        nodeKind: 'card',
        position,
        size: DEFAULT_NODE_SIZES.card,
        data: {
          type: 'text',
          title: object.title,
          content: markdown,
        },
      },
    ],
    usage: {
      ...usage,
      latencyMs: Date.now() - startedAt,
      model: config.model,
    },
  };
  return { success: true, result };
}

/**
 * Single entry point for all canvas AI tasks. The renderer calls this through
 * the `aiRunTask` RPC; unknown tasks fail closed with `unsupported-task`.
 */
export async function runAITask(
  params: AIRunTaskParams,
  config: AIServerConfig,
  wsPath: string
): Promise<AIRunTaskResponse> {
  switch (params.task) {
    case 'summarize_selection':
      return runSummarizeSelection(params, config, wsPath);
    default:
      return { success: false, error: 'unsupported-task' };
  }
}
