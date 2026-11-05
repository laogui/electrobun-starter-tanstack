import type { Edge, Node } from '@xyflow/react';

/**
 * Renderer-side fallback for the default canvas when the backend did not
 * seed it (the real first-run board is the `feature-story` template, seeded
 * in `src/bun/workspace.ts`). Kept deliberately small: one welcome sticky
 * that points at the template gallery.
 */

export const initialNodes: Node[] = [
  {
    id: 'node-init-welcome',
    position: { x: 100, y: 100 },
    data: {
      content:
        '👋 欢迎来到 GhostBoard\n\n把写作要用的网页、截图、文件和笔记摊在这里对照。\n\n不知道从哪开始？底部画布切换器 → 「+」→ 选一个模板。',
      color: '#FEF08A',
    },
    type: 'sticky',
    style: { height: 220, width: 320 },
  },
];

export const initialEdges: Edge[] = [];
