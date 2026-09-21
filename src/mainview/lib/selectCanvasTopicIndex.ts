import type { Edge, Node } from '@xyflow/react';
import { buildTopicIndex, type TopicIndex } from './topicTree';

/** Share one index among Topic subscriptions, retaining it through layout changes. */
export function createCanvasTopicIndexSelector() {
  let previousNodes: Node[] | undefined;
  let previousEdges: Edge[] | undefined;
  let index: TopicIndex | undefined;
  return ({ nodes, edges }: { nodes: Node[]; edges: Edge[] }): TopicIndex => {
    if (index && previousNodes === nodes && previousEdges === edges) {
      return index;
    }
    const sameStructure =
      previousEdges === edges &&
      previousNodes?.length === nodes.length &&
      nodes.every((node, i) => {
        const previous = previousNodes![i]!;
        return (
          node.id === previous.id &&
          node.type === previous.type &&
          node.parentId === previous.parentId &&
          node.data === previous.data
        );
      });
    if (!(index && sameStructure)) {
      index = buildTopicIndex(nodes, edges);
    }
    previousNodes = nodes;
    previousEdges = edges;
    return index;
  };
}

export const selectCanvasTopicIndex = createCanvasTopicIndexSelector();
