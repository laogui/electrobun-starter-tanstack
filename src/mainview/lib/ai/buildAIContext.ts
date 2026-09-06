import type { Node } from '@xyflow/react';

import type { AINodeContext } from '../../../shared/ai/types';
import {
  type ExtensionInstanceLoadError,
  type ExtensionInstanceRecord,
  isExtensionInstanceLoadError,
} from '../../../shared/extensions/instance';
import { buildAbsoluteRects, type Rect } from '../collision';

/**
 * Serialize the renderer's live selection into the `AINodeContext[]` the Bun
 * task layer consumes (docs/features/Backlog/ai-integration-plan.md §8.1).
 *
 * Cards, stickies, groups, folders, and legacy media/link nodes contribute
 * their node data. Migrated `extension` nodes contribute host presentation
 * (`title` + `plainText`) only — never instance state. Hidden nodes and
 * empty records are skipped.
 */

export type ExtensionInstanceLookup = Record<
  string,
  ExtensionInstanceLoadError | ExtensionInstanceRecord
>;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return;
  }
  const items = value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0
  );
  return items.length > 0 ? items : undefined;
};

const nodeSize = (
  node: Node,
  absoluteRect?: Rect
): { width?: number; height?: number } | undefined => {
  const style = node.style as Record<string, unknown> | undefined;
  const width =
    typeof style?.width === 'number'
      ? style.width
      : absoluteRect
        ? absoluteRect.right - absoluteRect.left
        : undefined;
  const height =
    typeof style?.height === 'number'
      ? style.height
      : absoluteRect
        ? absoluteRect.bottom - absoluteRect.top
        : undefined;
  if (width === undefined && height === undefined) {
    return;
  }
  return { width, height };
};

function extractFromData(
  nodeType: string,
  data: Record<string, unknown>
): Pick<AINodeContext, 'title' | 'content' | 'tags' | 'noteId'> | null {
  switch (nodeType) {
    case 'card': {
      const title = asString(data.title);
      const content = asString(data.content) ?? asString(data.previewExcerpt);
      const noteId = asString(data.noteId);
      const tags = asStringArray(data.tags) ?? asString(data.tag)?.split(',');
      if (!(title || content || noteId)) {
        return null;
      }
      return { title, content, tags, noteId };
    }
    case 'sticky': {
      const content = asString(data.content);
      if (!content) {
        return null;
      }
      return { content, tags: asStringArray(data.tags) };
    }
    case 'group': {
      const title = asString(data.label);
      if (!title) {
        return null;
      }
      return { title };
    }
    case 'folder': {
      const title = asString(data.title);
      if (!title) {
        return null;
      }
      return { title };
    }
    case 'link': {
      const title = asString(data.title);
      const url = asString(data.url);
      const description = asString(data.description);
      if (!(title || url)) {
        return null;
      }
      return {
        title: title ?? url,
        content: [url, description].filter(Boolean).join('\n'),
      };
    }
    case 'image':
    case 'asset':
    case 'recording': {
      const title = asString(data.title) ?? asString(data.fileName);
      if (!title) {
        return null;
      }
      return { title };
    }
    default:
      return null;
  }
}

function extractFromExtension(
  data: Record<string, unknown>,
  extensionInstances: ExtensionInstanceLookup | undefined
): Pick<AINodeContext, 'content' | 'noteId' | 'tags' | 'title'> | null {
  const instanceId = asString(data.instanceId);
  if (!instanceId) {
    return null;
  }
  const record = extensionInstances?.[instanceId];
  if (!record || isExtensionInstanceLoadError(record)) {
    return null;
  }
  const title = asString(record.presentation.title);
  const content = asString(record.presentation.plainText);
  if (!(title || content)) {
    return null;
  }
  return { title, content };
}

/** Convert a single React Flow node to AI context, or null to skip it. */
export function nodeToAIContext(
  node: Node,
  absoluteRect?: Rect,
  extensionInstances?: ExtensionInstanceLookup
): AINodeContext | null {
  const nodeType = node.type ?? '';
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (data.isHidden === true) {
    return null;
  }
  const extracted =
    nodeType === 'extension'
      ? extractFromExtension(data, extensionInstances)
      : extractFromData(nodeType, data);
  if (!extracted) {
    return null;
  }
  return {
    id: node.id,
    nodeType,
    title: extracted.title,
    content: extracted.content,
    tags: extracted.tags,
    noteId: extracted.noteId,
    position: absoluteRect
      ? { x: absoluteRect.left, y: absoluteRect.top }
      : { x: node.position.x, y: node.position.y },
    ...(node.parentId ? { parentId: node.parentId } : {}),
    size: nodeSize(node, absoluteRect),
  };
}

/** Build the task context from the current selection. */
export function buildSelectionContext(
  nodes: Node[],
  extensionInstances?: ExtensionInstanceLookup
): AINodeContext[] {
  const selected = nodes.filter((node) => node.selected);
  const absoluteRects = buildAbsoluteRects(nodes);
  const contexts: AINodeContext[] = [];
  for (const node of selected) {
    const context = nodeToAIContext(
      node,
      absoluteRects.get(node.id),
      extensionInstances
    );
    if (context) {
      contexts.push(context);
    }
  }
  return contexts;
}

/** True when the selection contains at least one summarizable node. */
export function hasSummarizableSelection(
  nodes: Node[],
  extensionInstances?: ExtensionInstanceLookup
): boolean {
  return nodes.some(
    (node) =>
      node.selected &&
      nodeToAIContext(node, undefined, extensionInstances) !== null
  );
}
