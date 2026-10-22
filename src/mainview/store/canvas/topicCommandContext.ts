import type { Node } from '@xyflow/react';
import { isTopicNodeType } from '../../../shared/topic';
// Derive the explicit Topic command context from selection transitions.

/**
 * Topic command context follows an *explicit* selection change onto a single
 * Topic, not the mere fact that one is selected. After Esc the same node may
 * stay highlighted; the next store update must not put Tab back in Topic mode.
 */
export function nextTopicCommandContext(
  previousNodes: Node[],
  nextNodes: Node[],
  currentContext: string | null
): string | null {
  const nextSelected = nextNodes.filter((node) => node.selected);
  const nextTopicId =
    nextSelected.length === 1 && isTopicNodeType(nextSelected[0]?.type)
      ? nextSelected[0]!.id
      : null;
  if (!nextTopicId) {
    return null;
  }
  const previousSelected = previousNodes.filter((node) => node.selected);
  const previousId =
    previousSelected.length === 1 ? previousSelected[0]?.id : undefined;
  if (previousId !== nextTopicId) {
    return nextTopicId;
  }
  return currentContext === nextTopicId ? nextTopicId : null;
}

export function nodeSelectionChanged(previous: Node[], next: Node[]): boolean {
  if (previous.length !== next.length) {
    return true;
  }
  for (let i = 0; i < previous.length; i++) {
    const previousNode = previous[i]!;
    const nextNode = next[i]!;
    if (
      previousNode.id !== nextNode.id ||
      Boolean(previousNode.selected) !== Boolean(nextNode.selected)
    ) {
      return true;
    }
  }
  return false;
}

export function topicCommandContextForNodes(
  previousNodes: Node[],
  nextNodes: Node[],
  currentContext: string | null
): string | null {
  if (!nodeSelectionChanged(previousNodes, nextNodes)) {
    return currentContext;
  }
  return nextTopicCommandContext(previousNodes, nextNodes, currentContext);
}
