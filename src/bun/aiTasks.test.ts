import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIContext, AIRunTaskParams } from '../shared/ai/types';
import type { AIServerConfig } from './ai';
import {
  buildContextPrompt,
  buildSummaryCardMarkdown,
  computeSummaryCardPosition,
  enrichContext,
  runAITask,
  type SummarizeSelectionOutput,
} from './aiTasks';
import { loadNoteRecord } from './noteStore';

vi.mock('./noteStore', () => ({
  loadNoteRecord: vi.fn(),
}));

const loadNoteRecordMock = vi.mocked(loadNoteRecord);

const OMITTED_MARKER_RE = /\(…\d+ more node\(s\) omitted for length\)$/;
const CARD_NODE_RE = /\[card\] id=node-/g;

function makeContext(overrides: Partial<AIContext> = {}): AIContext {
  return {
    viewId: 'default',
    nodes: [
      {
        id: 'node-a',
        nodeType: 'card',
        title: 'Kickoff notes',
        content: 'Ship the MVP by Friday.',
        position: { x: 0, y: 0 },
      },
      {
        id: 'node-b',
        nodeType: 'sticky',
        content: 'Budget is tight',
        position: { x: 100, y: 500 },
      },
    ],
    ...overrides,
  };
}

const baseConfig: AIServerConfig = {
  provider: 'openai',
  apiKey: 'sk-test',
  model: 'gpt-4o-mini',
};

describe('computeSummaryCardPosition', () => {
  it('returns the origin for an empty selection', () => {
    expect(computeSummaryCardPosition([])).toEqual({ x: 0, y: 0 });
  });

  it('places the card right of the selection bbox with default sizes', () => {
    const position = computeSummaryCardPosition([
      {
        id: 'n1',
        nodeType: 'card',
        position: { x: 0, y: 0 },
      },
    ]);
    // Default card is 350x450: x = 350 + 80 gap, y centers on the card.
    expect(position).toEqual({ x: 430, y: 0 });
  });

  it('honors explicit node sizes and spans multiple nodes', () => {
    const position = computeSummaryCardPosition([
      {
        id: 'n1',
        nodeType: 'card',
        position: { x: 0, y: 0 },
        size: { width: 200, height: 100 },
      },
      {
        id: 'n2',
        nodeType: 'sticky',
        position: { x: 400, y: 300 },
        size: { width: 100, height: 100 },
      },
    ]);
    // maxX = 400 + 100 = 500 → x = 580. minY=0, maxY=400 → center y = 200 - 225.
    expect(position).toEqual({ x: 580, y: -25 });
  });
});

describe('buildSummaryCardMarkdown', () => {
  const full: SummarizeSelectionOutput = {
    title: 'Summary',
    theme: 'Launch readiness review',
    keyPoints: ['MVP is scoped', 'QA started'],
    todos: ['Fix login bug'],
    risks: ['Budget unclear'],
    nextSteps: ['Demo on Friday'],
  };

  it('renders theme and all non-empty sections', () => {
    const markdown = buildSummaryCardMarkdown(full);
    expect(markdown).toContain('**Launch readiness review**');
    expect(markdown).toContain('## Key points\n- MVP is scoped\n- QA started');
    expect(markdown).toContain('## To-dos\n- [ ] Fix login bug');
    expect(markdown).toContain('## Risks & open questions\n- Budget unclear');
    expect(markdown).toContain('## Next steps\n- Demo on Friday');
  });

  it('omits empty sections', () => {
    const markdown = buildSummaryCardMarkdown({
      ...full,
      todos: [],
      risks: [],
      nextSteps: [],
    });
    expect(markdown).not.toContain('## To-dos');
    expect(markdown).not.toContain('## Risks');
    expect(markdown).not.toContain('## Next steps');
    expect(markdown).toContain('## Key points');
  });
});

describe('buildContextPrompt', () => {
  it('serializes node type, id, title, tags and content', () => {
    const prompt = buildContextPrompt({
      nodes: [
        {
          id: 'node-a',
          nodeType: 'card',
          title: 'Hello',
          tags: ['work', 'q3'],
          content: 'Body text',
          position: { x: 0, y: 0 },
        },
      ],
    });
    expect(prompt).toContain('[card] id=node-a');
    expect(prompt).toContain('title=Hello');
    expect(prompt).toContain('tags=work,q3');
    expect(prompt).toContain('Body text');
  });

  it('marks omitted nodes when the char budget is exhausted', () => {
    const nodes = Array.from({ length: 20 }, (_, index) => ({
      id: `node-${index}`,
      nodeType: 'card',
      content: 'x'.repeat(3000),
      position: { x: index * 10, y: 0 },
    }));
    const prompt = buildContextPrompt({ nodes });
    expect(prompt).toMatch(OMITTED_MARKER_RE);
    // The budget keeps roughly 24000 / ~3050 ≈ 7-8 whole nodes.
    const included = (prompt.match(CARD_NODE_RE) ?? []).length;
    expect(included).toBeGreaterThan(0);
    expect(included).toBeLessThan(20);
  });

  it('caps node count at 40 and reports the overflow', () => {
    const nodes = Array.from({ length: 45 }, (_, index) => ({
      id: `node-${index}`,
      nodeType: 'sticky',
      content: `note ${index}`,
      position: { x: 0, y: index },
    }));
    const prompt = buildContextPrompt({ nodes });
    const included = (prompt.match(/\[sticky\] id=node-/g) ?? []).length;
    expect(included).toBe(40);
    expect(prompt).toContain('(…5 more node(s) omitted for length)');
  });
});

describe('enrichContext', () => {
  beforeEach(() => {
    loadNoteRecordMock.mockReset();
  });

  it('merges the note body into card nodes that carry a noteId', async () => {
    loadNoteRecordMock.mockResolvedValue({
      noteId: 'note-1',
      title: 'Full note title',
      source: 'markdown',
      markdownDoc: { body: 'Full note body from disk.' },
      blocks: null,
      color: '#FFFFFF',
      corrupted: false,
      displayHint: 'note',
      preview: null,
      revision: 1,
    } as any);

    const enriched = await enrichContext('/ws', {
      nodes: [
        {
          id: 'node-a',
          nodeType: 'card',
          noteId: 'note-1',
          content: 'Preview only',
          position: { x: 0, y: 0 },
        },
      ],
    });

    expect(loadNoteRecordMock).toHaveBeenCalledWith('/ws', 'note-1');
    const node = enriched.nodes[0];
    expect(node?.title).toBe('Full note title');
    expect(node?.content).toContain('Preview only');
    expect(node?.content).toContain('Full note body from disk.');
  });

  it('leaves non-card nodes and failed loads untouched', async () => {
    loadNoteRecordMock.mockRejectedValue(new Error('missing'));
    const context = makeContext();
    const enriched = await enrichContext('/ws', context);
    expect(enriched.nodes).toEqual(context.nodes);
  });

  it('does not load note bodies beyond the per-task node cap', async () => {
    loadNoteRecordMock.mockResolvedValue({
      noteId: 'note-1',
      title: 'Full note title',
      source: 'markdown',
      markdownDoc: { body: 'Full note body from disk.' },
      blocks: null,
      color: '#FFFFFF',
      corrupted: false,
      displayHint: 'note',
      preview: null,
      revision: 1,
    } as any);
    const context: AIContext = {
      nodes: Array.from({ length: 41 }, (_, index) => ({
        id: `node-${index}`,
        nodeType: 'card',
        noteId: `note-${index}`,
        title: `Note ${index}`,
        position: { x: index, y: 0 },
      })),
    };

    const enriched = await enrichContext('/ws', context);

    expect(loadNoteRecordMock).toHaveBeenCalledTimes(40);
    expect(enriched.nodes[39]?.content).toContain('Full note body');
    expect(enriched.nodes[40]).toEqual(context.nodes[40]);
  });
});

describe('runAITask', () => {
  it('fails closed for unsupported tasks', async () => {
    const params: AIRunTaskParams = {
      task: 'generate_board',
      context: makeContext(),
    };
    const response = await runAITask(params, baseConfig, '/ws');
    expect(response).toEqual({ success: false, error: 'unsupported-task' });
  });

  it('rejects an empty selection before calling the model', async () => {
    const params: AIRunTaskParams = {
      task: 'summarize_selection',
      context: { nodes: [] },
    };
    const response = await runAITask(params, baseConfig, '/ws');
    expect(response).toEqual({ success: false, error: 'empty-selection' });
  });
});
