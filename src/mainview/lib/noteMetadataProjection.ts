import type {
  NoteMetadata,
  NoteMetadataChange,
} from '../../../packages/plugin-sdk';
import { updateHistoryNoteMetadata } from './canvasNoteHistory';

interface Item {
  data: Record<string, unknown>;
}

interface ProjectionState {
  focusedFolder: Item | null;
  focusedNode: Item | null;
  nodes: Item[];
}

type MetadataListener = (
  changes: readonly NoteMetadataChange[]
) => readonly string[] | undefined;
const listeners = new Set<MetadataListener>();

export function subscribeNoteMetadataChanges(
  listener: MetadataListener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Called only by the workspace-filtered host bridge, before React can render.
export function publishNoteMetadataChanges(
  changes: readonly NoteMetadataChange[]
): readonly NoteMetadataChange[] {
  const conflicts = new Set<string>();
  for (const listener of listeners) {
    for (const id of listener(changes) ?? []) {
      conflicts.add(id);
    }
  }
  // An editor's title draft may not be in node.data yet. Do not push new props
  // that would cause its external-title synchronization to erase that draft.
  const projectable = changes.filter((change) => !conflicts.has(change.id));
  updateHistoryNoteMetadata(projectable);
  return projectable;
}

export function hasNoteMetadataConflict(
  data: Record<string, unknown>,
  change: NoteMetadataChange
): boolean {
  return (['title', 'color'] as const).some(
    (key) => data[key] !== change.before[key] && data[key] !== change.after[key]
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isNoteMetadata(value: unknown): value is NoteMetadata {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    typeof value.color === 'string' &&
    Number.isSafeInteger(value.revision) &&
    (value.revision as number) >= 0
  );
}

export function isNoteMetadataChange(
  value: unknown
): value is NoteMetadataChange {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.metadataOnly === 'boolean' &&
    isNoteMetadata(value.before) &&
    isNoteMetadata(value.after) &&
    value.after.revision > value.before.revision
  );
}

function projectMetadata(
  data: Record<string, unknown>,
  change: NoteMetadataChange | undefined,
  body?: Record<string, unknown>
): Record<string, unknown> {
  if (
    !(change && (change.metadataOnly || body)) ||
    hasNoteMetadataConflict(data, change) ||
    (data.blocknoteRevision !== change.before.revision &&
      data.blocknoteRevision !== change.after.revision)
  ) {
    return data;
  }
  const { title, color, revision } = change.after;
  if (
    !body &&
    data.title === title &&
    data.color === color &&
    data.blocknoteRevision === revision
  ) {
    return data;
  }
  return { ...data, ...body, title, color, blocknoteRevision: revision };
}

function projectData(
  data: Record<string, unknown>,
  changes: ReadonlyMap<string, NoteMetadataChange>,
  body?: Record<string, unknown>
): Record<string, unknown> {
  let next = projectMetadata(data, changes.get(data.noteId as string), body);
  if (!Array.isArray(data.children)) {
    return next;
  }
  let changed = false;
  const children = data.children.map((child: unknown) => {
    if (!isRecord(child)) {
      return child;
    }
    const nested = isRecord(child.data) ? child.data : undefined;
    const id = (nested?.noteId ?? child.noteId) as string;
    const change = changes.get(id);
    // Nested children keep their editable fields in data; legacy children are flat.
    const source = nested ?? child;
    const projected = projectMetadata(source, change, body);
    if (source === projected) {
      return child;
    }
    changed = true;
    if (!nested) {
      return projected;
    }
    const result: Record<string, unknown> = { ...child, data: projected };
    for (const key of [
      'title',
      'color',
      'blocknoteRevision',
      ...Object.keys(body ?? {}),
    ]) {
      if (key in child) {
        result[key] = projected[key];
      }
    }
    return result;
  });
  if (changed) {
    next = { ...next, children };
  }
  return next;
}

export function applyNoteMetadataChanges<S extends ProjectionState>(
  state: S,
  changes: readonly NoteMetadataChange[],
  body?: Record<string, unknown>
): S {
  let next = state;
  // Preserve transaction ordering when a batch contains multiple revisions of a note.
  for (const change of changes) {
    const map = new Map([[change.id, change]]);
    const projectItem = <T extends Item>(item: T): T => {
      const data = projectData(item.data, map, body);
      return data === item.data ? item : { ...item, data };
    };
    const nodes = next.nodes.map(projectItem);
    const focusedNode = next.focusedNode ? projectItem(next.focusedNode) : null;
    const focusedFolder = next.focusedFolder
      ? projectItem(next.focusedFolder)
      : null;
    const nodesChanged = nodes.some(
      (node, index) => node !== next.nodes[index]
    );
    if (
      nodesChanged ||
      focusedNode !== next.focusedNode ||
      focusedFolder !== next.focusedFolder
    ) {
      next = {
        ...next,
        nodes: nodesChanged ? nodes : next.nodes,
        focusedNode,
        focusedFolder,
      };
    }
  }
  return next;
}

/**
 * Projects a canonical note snapshot after the user explicitly discards a
 * local draft. Unlike event reconciliation, this intentionally replaces
 * conflicting cached metadata and revisions because the choice is explicit.
 */
export function applyCanonicalNoteSnapshot<S extends ProjectionState>(
  state: S,
  noteId: string,
  updates: Record<string, unknown>
): S {
  const projectData = (
    data: Record<string, unknown>
  ): Record<string, unknown> => {
    let next = data.noteId === noteId ? { ...data, ...updates } : data;
    if (!Array.isArray(data.children)) {
      return next;
    }
    let childrenChanged = false;
    const children = data.children.map((child: unknown) => {
      if (!isRecord(child)) {
        return child;
      }
      const nested = isRecord(child.data) ? child.data : undefined;
      const source = nested ?? child;
      if ((source.noteId ?? child.noteId) !== noteId) {
        return child;
      }
      childrenChanged = true;
      const projected = { ...source, ...updates };
      if (!nested) {
        return projected;
      }
      const result: Record<string, unknown> = { ...child, data: projected };
      for (const key of Object.keys(updates)) {
        if (key in child) {
          result[key] = updates[key];
        }
      }
      return result;
    });
    if (childrenChanged) {
      next = { ...next, children };
    }
    return next;
  };
  const projectItem = <T extends Item>(item: T): T => {
    const data = projectData(item.data);
    return data === item.data ? item : { ...item, data };
  };
  const nodes = state.nodes.map(projectItem);
  const focusedNode = state.focusedNode ? projectItem(state.focusedNode) : null;
  const focusedFolder = state.focusedFolder
    ? projectItem(state.focusedFolder)
    : null;
  const nodesChanged = nodes.some((node, index) => node !== state.nodes[index]);
  if (
    !nodesChanged &&
    focusedNode === state.focusedNode &&
    focusedFolder === state.focusedFolder
  ) {
    return state;
  }
  return {
    ...state,
    nodes: nodesChanged ? nodes : state.nodes,
    focusedNode,
    focusedFolder,
  };
}
