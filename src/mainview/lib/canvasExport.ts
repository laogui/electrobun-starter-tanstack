import type {
  Edge,
  Node,
  ReactFlowInstance,
  Rect,
  Viewport,
} from '@xyflow/react';
import { getViewportForBounds } from '@xyflow/react';
import {
  CARD_H,
  CARD_W,
  FOLDER_H,
  FOLDER_W,
  IMAGE_H,
  IMAGE_W,
  STICKY_H,
  STICKY_W,
} from '@/lib/canvasConstants';
import { isColorDark } from '@/lib/colorUtils';
import { rpcExportPng } from '@/lib/rpc';

const EXPORT_PADDING = 64;
const EXPORT_MIN_ZOOM = 0.1;
const EXPORT_MAX_ZOOM = 2;
const CARD_RADIUS = 24;
const FOLDER_RADIUS = 28;
const TRAILING_DOTS_RE = /\.{3}$/u;
const GROUP_COLORS: Record<string, { background: string; border: string }> = {
  blue: { background: '#DBEAFE', border: '#93C5FD' },
  green: { background: '#DCFCE7', border: '#86EFAC' },
  yellow: { background: '#FEF9C3', border: '#FDE047' },
  pink: { background: '#FCE7F3', border: '#F9A8D4' },
  orange: { background: '#FFEDD5', border: '#FDBA74' },
};

interface ExportCanvasOptions {
  backgroundColor: string;
  fileName: string;
  instance: ReactFlowInstance<any, any>;
  pixelRatio?: number;
}

interface ExportDimensions {
  height: number;
  width: number;
}

interface PreparedExport {
  dimensions: ExportDimensions;
  nodeBounds: Rect;
  viewport: Viewport;
}

interface FileSavePicker {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      accept: Record<string, string[]>;
      description: string;
    }>;
  }) => Promise<{
    createWritable: () => Promise<{
      close: () => Promise<void>;
      write: (data: Blob) => Promise<void>;
    }>;
  }>;
}

type BrowserSaveHandle = Awaited<
  ReturnType<NonNullable<FileSavePicker['showSaveFilePicker']>>
>;

type CanvasNodeData = Record<string, unknown>;

export function getVisibleExportNodes(instance: ReactFlowInstance<any, any>) {
  return instance.getNodes().filter((node: Node) => {
    const data = node.data as CanvasNodeData | undefined;
    return !(data?.detached || data?.isHidden);
  });
}

export function sanitizeExportFileName(name: string) {
  const sanitized = name
    .trim()
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return sanitized || 'ghostboard-canvas';
}

export function prepareCanvasExport(
  instance: ReactFlowInstance<any, any>,
  nodes: Node[]
): PreparedExport | null {
  if (nodes.length === 0) {
    return null;
  }

  const nodeBounds = instance.getNodesBounds(nodes);
  const dimensions = {
    width: Math.ceil(nodeBounds.width + EXPORT_PADDING * 2),
    height: Math.ceil(nodeBounds.height + EXPORT_PADDING * 2),
  };
  const viewport = getViewportForBounds(
    nodeBounds,
    dimensions.width,
    dimensions.height,
    EXPORT_MIN_ZOOM,
    EXPORT_MAX_ZOOM,
    EXPORT_PADDING / Math.max(dimensions.width, dimensions.height)
  );

  return { dimensions, nodeBounds, viewport };
}

function getNodeSize(node: Node) {
  const style = node.style as
    | { height?: number | string; width?: number | string }
    | undefined;
  const measured = node.measured as
    | { height?: number; width?: number }
    | undefined;
  const width = Number(style?.width ?? measured?.width);
  const height = Number(style?.height ?? measured?.height);

  if (Number.isFinite(width) && Number.isFinite(height)) {
    return { width, height };
  }

  switch (node.type) {
    case 'folder':
      return { width: FOLDER_W, height: FOLDER_H };
    case 'image':
      return { width: IMAGE_W, height: IMAGE_H };
    case 'sticky':
      return { width: STICKY_W, height: STICKY_H };
    default:
      return { width: CARD_W, height: CARD_H };
  }
}

function getAbsolutePosition(node: Node, nodeLookup: Map<string, Node>) {
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentId;

  while (parentId) {
    const parent = nodeLookup.get(parentId);
    if (!parent) {
      break;
    }
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
  }

  return { x, y };
}

function toExportPoint(point: { x: number; y: number }, viewport: Viewport) {
  return {
    x: point.x * viewport.zoom + viewport.x,
    y: point.y * viewport.zoom + viewport.y,
  };
}

function getNodeExportRect(
  node: Node,
  nodeLookup: Map<string, Node>,
  viewport: Viewport
) {
  const position = getAbsolutePosition(node, nodeLookup);
  const size = getNodeSize(node);
  const topLeft = toExportPoint(position, viewport);

  return {
    x: topLeft.x,
    y: topLeft.y,
    width: size.width * viewport.zoom,
    height: size.height * viewport.zoom,
  };
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function getText(data: CanvasNodeData, ...keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return '';
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return [];
  }

  const words = normalized.split(' ');
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;
    if (context.measureText(nextLine).width <= maxWidth) {
      line = nextLine;
      continue;
    }

    if (line) {
      lines.push(line);
      line = word;
    } else {
      lines.push(word);
    }

    if (lines.length >= maxLines) {
      break;
    }
  }

  if (line && lines.length < maxLines) {
    lines.push(line);
  }

  if (lines.length === maxLines && words.length > lines.length) {
    const lastIndex = lines.length - 1;
    lines[lastIndex] = `${lines[lastIndex]!.replace(TRAILING_DOTS_RE, '')}…`;
  }

  return lines;
}

function drawWrappedText({
  color,
  context,
  font,
  lineHeight,
  maxLines,
  text,
  width,
  x,
  y,
}: {
  color: string;
  context: CanvasRenderingContext2D;
  font: string;
  lineHeight: number;
  maxLines: number;
  text: string;
  width: number;
  x: number;
  y: number;
}) {
  context.fillStyle = color;
  context.font = font;
  context.textBaseline = 'top';

  const lines = wrapText(context, text, width, maxLines);
  for (const [index, line] of lines.entries()) {
    context.fillText(line, x, y + index * lineHeight);
  }
}

function drawCard(
  context: CanvasRenderingContext2D,
  rect: { height: number; width: number; x: number; y: number },
  data: CanvasNodeData
) {
  const background = typeof data.color === 'string' ? data.color : '#FFFFFF';
  const textColor = isColorDark(background) ? '#FFFFFF' : '#1F2937';
  roundedRect(context, rect.x, rect.y, rect.width, rect.height, CARD_RADIUS);
  context.fillStyle = background;
  context.fill();
  context.strokeStyle = 'rgba(0, 0, 0, 0.08)';
  context.lineWidth = 1;
  context.stroke();

  const padding = Math.max(18, rect.width * 0.06);
  const title = getText(data, 'title');
  const body = getText(data, 'content', 'body');
  const titleLines = title ? 3 : 0;
  drawWrappedText({
    color: textColor,
    context,
    font: '700 22px Inter, system-ui, sans-serif',
    lineHeight: 28,
    maxLines: titleLines,
    text: title,
    width: rect.width - padding * 2,
    x: rect.x + padding,
    y: rect.y + padding,
  });
  drawWrappedText({
    color: isColorDark(background) ? 'rgba(255, 255, 255, 0.82)' : '#4B5563',
    context,
    font: '400 15px Inter, system-ui, sans-serif',
    lineHeight: 22,
    maxLines: Math.max(
      1,
      Math.floor((rect.height - padding * 2 - titleLines * 28) / 22)
    ),
    text: body,
    width: rect.width - padding * 2,
    x: rect.x + padding,
    y: rect.y + padding + titleLines * 32,
  });
}

function drawSticky(
  context: CanvasRenderingContext2D,
  rect: { height: number; width: number; x: number; y: number },
  data: CanvasNodeData
) {
  const background = typeof data.color === 'string' ? data.color : '#FEF08A';
  roundedRect(context, rect.x, rect.y, rect.width, rect.height, 10);
  context.fillStyle = background;
  context.fill();
  context.strokeStyle = 'rgba(0, 0, 0, 0.08)';
  context.stroke();
  drawWrappedText({
    color: isColorDark(background) ? '#FFFFFF' : '#1F2937',
    context,
    font: '500 16px Inter, system-ui, sans-serif',
    lineHeight: 22,
    maxLines: Math.max(1, Math.floor((rect.height - 28) / 22)),
    text: getText(data, 'content', 'title'),
    width: rect.width - 28,
    x: rect.x + 14,
    y: rect.y + 14,
  });
}

function drawFolder(
  context: CanvasRenderingContext2D,
  rect: { height: number; width: number; x: number; y: number },
  data: CanvasNodeData
) {
  roundedRect(
    context,
    rect.x + 10,
    rect.y + 8,
    rect.width - 20,
    rect.height - 10,
    FOLDER_RADIUS
  );
  context.fillStyle = 'rgba(255, 255, 255, 0.45)';
  context.fill();
  roundedRect(
    context,
    rect.x + 4,
    rect.y + 4,
    rect.width - 12,
    rect.height - 8,
    FOLDER_RADIUS
  );
  context.fillStyle = 'rgba(255, 255, 255, 0.7)';
  context.fill();
  roundedRect(
    context,
    rect.x,
    rect.y,
    rect.width - 10,
    rect.height - 12,
    FOLDER_RADIUS
  );
  context.fillStyle = '#FFFFFF';
  context.fill();
  context.strokeStyle = 'rgba(0, 0, 0, 0.08)';
  context.stroke();

  drawWrappedText({
    color: '#111827',
    context,
    font: '700 24px Inter, system-ui, sans-serif',
    lineHeight: 30,
    maxLines: 2,
    text: getText(data, 'title', 'label') || 'Folder',
    width: rect.width - 56,
    x: rect.x + 28,
    y: rect.y + rect.height / 2 - 28,
  });
  drawWrappedText({
    color: '#6B7280',
    context,
    font: '400 15px Inter, system-ui, sans-serif',
    lineHeight: 22,
    maxLines: 1,
    text: getText(data, 'subtitle'),
    width: rect.width - 56,
    x: rect.x + 28,
    y: rect.y + rect.height / 2 + 32,
  });
}

function drawGroup(
  context: CanvasRenderingContext2D,
  rect: { height: number; width: number; x: number; y: number },
  data: CanvasNodeData
) {
  const colorKey = typeof data.color === 'string' ? data.color : 'blue';
  const colors = GROUP_COLORS[colorKey] ?? GROUP_COLORS.blue!;
  roundedRect(context, rect.x, rect.y, rect.width, rect.height, 8);
  context.fillStyle = colors.background;
  context.fill();
  context.setLineDash([8, 7]);
  context.strokeStyle = colors.border;
  context.lineWidth = 2;
  context.stroke();
  context.setLineDash([]);
  drawWrappedText({
    color: '#374151',
    context,
    font: '700 16px Inter, system-ui, sans-serif',
    lineHeight: 22,
    maxLines: 1,
    text: getText(data, 'label', 'title'),
    width: rect.width - 32,
    x: rect.x + 16,
    y: rect.y + 14,
  });
}

function drawImageNode(
  context: CanvasRenderingContext2D,
  rect: { height: number; width: number; x: number; y: number },
  data: CanvasNodeData
) {
  roundedRect(context, rect.x, rect.y, rect.width, rect.height, CARD_RADIUS);
  context.fillStyle = typeof data.color === 'string' ? data.color : '#FFFFFF';
  context.fill();
  context.strokeStyle = 'rgba(0, 0, 0, 0.08)';
  context.stroke();
  context.fillStyle = '#E5E7EB';
  roundedRect(
    context,
    rect.x + 18,
    rect.y + 18,
    rect.width - 36,
    rect.height - 84,
    16
  );
  context.fill();
  drawWrappedText({
    color: '#374151',
    context,
    font: '600 18px Inter, system-ui, sans-serif',
    lineHeight: 24,
    maxLines: 2,
    text: getText(data, 'title') || 'Image',
    width: rect.width - 44,
    x: rect.x + 22,
    y: rect.y + rect.height - 54,
  });
}

function drawNode(
  context: CanvasRenderingContext2D,
  node: Node,
  nodeLookup: Map<string, Node>,
  viewport: Viewport
) {
  const rect = getNodeExportRect(node, nodeLookup, viewport);
  const data = (node.data ?? {}) as CanvasNodeData;

  context.save();
  if (node.type === 'group') {
    drawGroup(context, rect, data);
  } else if (node.type === 'folder') {
    drawFolder(context, rect, data);
  } else if (node.type === 'sticky') {
    drawSticky(context, rect, data);
  } else if (node.type === 'image') {
    drawImageNode(context, rect, data);
  } else {
    drawCard(context, rect, data);
  }
  context.restore();
}

function getNodeCenter(
  node: Node,
  nodeLookup: Map<string, Node>,
  viewport: Viewport
) {
  const rect = getNodeExportRect(node, nodeLookup, viewport);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function drawEdges(
  context: CanvasRenderingContext2D,
  edges: Edge[],
  nodeLookup: Map<string, Node>,
  viewport: Viewport
) {
  context.save();
  context.strokeStyle = '#9CA3AF';
  context.lineWidth = 2;
  for (const edge of edges) {
    const source = nodeLookup.get(edge.source);
    const target = nodeLookup.get(edge.target);
    if (!(source && target)) {
      continue;
    }
    const start = getNodeCenter(source, nodeLookup, viewport);
    const end = getNodeCenter(target, nodeLookup, viewport);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }
  context.restore();
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error('Unable to encode canvas export as PNG.'));
      }, 'image/png');
    } catch (error) {
      reject(error);
    }
  });
}

async function renderCanvasToPngBlob({
  backgroundColor,
  dimensions,
  edges,
  nodes,
  pixelRatio = Math.max(window.devicePixelRatio || 1, 1),
  viewport,
}: {
  backgroundColor: string;
  dimensions: ExportDimensions;
  edges: Edge[];
  nodes: Node[];
  pixelRatio?: number;
  viewport: Viewport;
}) {
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.width * pixelRatio;
  canvas.height = dimensions.height * pixelRatio;
  canvas.style.width = `${dimensions.width}px`;
  canvas.style.height = `${dimensions.height}px`;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create canvas export context.');
  }

  context.scale(pixelRatio, pixelRatio);
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, dimensions.width, dimensions.height);

  const nodeLookup = new Map(nodes.map((node) => [node.id, node]));
  drawEdges(context, edges, nodeLookup, viewport);
  for (const node of nodes) {
    drawNode(context, node, nodeLookup, viewport);
  }

  return await canvasToPngBlob(canvas);
}

async function requestBrowserSaveHandle(fileName: string) {
  const picker = globalThis as typeof globalThis & FileSavePicker;
  if (!picker.showSaveFilePicker) {
    return null;
  }

  return await picker.showSaveFilePicker({
    suggestedName: fileName.endsWith('.png') ? fileName : `${fileName}.png`,
    types: [
      {
        description: 'PNG image',
        accept: { 'image/png': ['.png'] },
      },
    ],
  });
}

async function writeBlobToBrowserHandle(blob: Blob, handle: BrowserSaveHandle) {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Unable to serialize PNG export.'));
    };
    reader.onerror = () => {
      reject(new Error('Unable to serialize PNG export.'));
    };
    reader.readAsDataURL(blob);
  });
}

async function writeBlobWithNativeDialog(blob: Blob, fileName: string) {
  const result = await rpcExportPng(await blobToDataUrl(blob), fileName);
  if (!result) {
    return null;
  }
  return result.success;
}

export async function exportReactFlowCanvasToPng({
  backgroundColor,
  fileName,
  instance,
  pixelRatio,
}: ExportCanvasOptions) {
  const nodes = getVisibleExportNodes(instance);
  const prepared = prepareCanvasExport(instance, nodes);
  if (!prepared) {
    throw new Error('Canvas has no visible nodes to export.');
  }

  let browserSaveHandle: BrowserSaveHandle | null = null;
  try {
    browserSaveHandle = await requestBrowserSaveHandle(fileName);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return false;
    }
    throw error;
  }

  const getEdges = instance.getEdges?.bind(instance) as
    | (() => Edge[])
    | undefined;
  const edges = getEdges?.() ?? [];
  const pngBlob = await renderCanvasToPngBlob({
    backgroundColor,
    dimensions: prepared.dimensions,
    edges,
    nodes,
    pixelRatio,
    viewport: prepared.viewport,
  });

  if (browserSaveHandle) {
    await writeBlobToBrowserHandle(pngBlob, browserSaveHandle);
    return true;
  }

  const nativeDialogSaved = await writeBlobWithNativeDialog(pngBlob, fileName);
  if (nativeDialogSaved !== null) {
    return nativeDialogSaved;
  }

  const url = URL.createObjectURL(pngBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}
