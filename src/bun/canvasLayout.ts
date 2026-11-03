import type { ManifestNode } from './manifest';
import { buildNoteIndex } from './noteStore';

/** Layout can commit without replaying stale note bodies or metadata. */
export async function layoutOnlyNodes(
  workspace: string,
  nodes: ManifestNode[]
): Promise<ManifestNode[]> {
  const index = await buildNoteIndex(workspace);
  const dataFor = (
    type: string | undefined,
    data: Record<string, unknown>,
    fallbackId?: string
  ): Record<string, unknown> => {
    const id = typeof data.noteId === 'string' ? data.noteId : fallbackId;
    const location = id ? index.get(id) : undefined;
    if (type === 'card' && location) {
      return {
        noteId: id,
        type: data.type,
        ...(location.markdownFile ? { file: location.markdownFile } : {}),
        ...(data.detached ? { detached: true } : {}),
      };
    }
    if (Array.isArray(data.children)) {
      return {
        ...data,
        children: data.children.map((value: unknown) => {
          if (!value || typeof value !== 'object') {
            return value;
          }
          const child = value as {
            type?: string;
            noteId?: string;
            data?: Record<string, unknown>;
          };
          return child.data
            ? { ...child, data: dataFor(child.type, child.data, child.noteId) }
            : child;
        }),
      };
    }
    return data;
  };
  return nodes.map((node) => ({
    ...node,
    data: dataFor(node.type, node.data),
  }));
}
