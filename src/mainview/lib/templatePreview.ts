import type { Node } from '@xyflow/react';

/**
 * The template gallery renders a template's raw manifest with read-only node
 * types. Raw manifests only carry placeholders: cards point at `noteContents`
 * by id, and image / link nodes point at extension instances that do not
 * exist until the template is instantiated. Without this step the preview
 * (and the exported thumbnail) shows "Untitled / Empty note" cards and
 * "Preview is not available." tiles.
 *
 * This resolves those placeholders into self-contained node data for the
 * preview only. Instantiation (`populateViewFromTemplate`) is unchanged.
 */

const TEMPLATE_ASSET_PREFIX = 'tpl-asset:';
const IMAGE_CANVAS_TYPE_ID = 'ghostboard.media/image';
const LINK_CANVAS_TYPE_ID = 'ghostboard.web/link';

interface PreviewNoteContent {
  body: string;
  color?: string;
  title: string;
}

interface PreviewNodeMetadata {
  tag?: string;
  tagColor?: string;
  tagColors?: Record<string, string>;
  tags?: string[];
}

interface PreviewExtensionSeed {
  canvasTypeId: string;
  state: unknown;
}

export interface TemplatePreviewSource {
  assets?: Record<string, string>;
  extensionInstances?: Record<string, PreviewExtensionSeed>;
  nodeMetadata?: Record<string, PreviewNodeMetadata>;
  nodes?: unknown[];
  noteContents?: Record<string, PreviewNoteContent>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveAsset(
  value: unknown,
  assets: Record<string, string>
): string | undefined {
  if (typeof value !== 'string') {
    return;
  }
  if (!value.startsWith(TEMPLATE_ASSET_PREFIX)) {
    return value;
  }
  const base64 = assets[value.slice(TEMPLATE_ASSET_PREFIX.length)];
  return base64 ? `data:image/jpeg;base64,${base64}` : undefined;
}

function previewCard(
  node: Node,
  source: TemplatePreviewSource
): Node | undefined {
  const data = node.data as Record<string, unknown>;
  const noteId = typeof data.noteId === 'string' ? data.noteId : undefined;
  const note = noteId ? source.noteContents?.[noteId] : undefined;
  if (!(noteId && note)) {
    return;
  }
  const meta = source.nodeMetadata?.[noteId] ?? {};
  return {
    ...node,
    data: {
      ...data,
      ...meta,
      title: note.title,
      content: note.body,
      color: data.color ?? note.color,
    },
  };
}

function previewExtension(
  node: Node,
  source: TemplatePreviewSource
): Node | undefined {
  const data = node.data as Record<string, unknown>;
  const instanceId =
    typeof data.instanceId === 'string' ? data.instanceId : undefined;
  const seed = instanceId ? source.extensionInstances?.[instanceId] : undefined;
  if (!(seed && isRecord(seed.state))) {
    return;
  }
  const assets = source.assets ?? {};
  const state = seed.state;
  if (seed.canvasTypeId === IMAGE_CANVAS_TYPE_ID) {
    return {
      ...node,
      type: 'image',
      data: {
        color: state.color,
        title: state.title,
        imageUrl: resolveAsset(state.imageFile ?? state.imageUrl, assets),
      },
    };
  }
  if (seed.canvasTypeId === LINK_CANVAS_TYPE_ID) {
    return {
      ...node,
      type: 'link',
      data: {
        ...state,
        imageUrl: resolveAsset(state.imageUrl, assets),
        unfurlStatus: 'ready',
      },
    };
  }
  return;
}

/** Nodes ready for a read-only preview of a bundled template. */
export function templatePreviewNodes(source: TemplatePreviewSource): Node[] {
  const nodes = (source.nodes ?? []) as Node[];
  return nodes.map((node) => {
    if (node.type === 'card') {
      return previewCard(node, source) ?? node;
    }
    if (node.type === 'extension') {
      return previewExtension(node, source) ?? node;
    }
    return node;
  });
}
