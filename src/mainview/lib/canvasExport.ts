import type {
  Edge,
  Node,
  ReactFlowInstance,
  Rect,
  Viewport,
} from '@xyflow/react';
import { getViewportForBounds } from '@xyflow/react';
import { toBlob } from 'html-to-image';
import { sanitizeForPersistence } from '@/lib/canvasNodeSerialization';
import { rpcExportJson, rpcExportPng } from '@/lib/rpc';

export const CANVAS_EXPORT_SCHEMA = 'ghostboard-canvas-export/v1' as const;

export interface CanvasExportDocument {
  edges: Record<string, unknown>[];
  exportedAt: string;
  nodes: Record<string, unknown>[];
  schema: typeof CANVAS_EXPORT_SCHEMA;
  viewId?: string;
  viewName?: string;
  viewport?: Viewport;
}

const EXPORT_PADDING = 64;
const EXPORT_MIN_ZOOM = 0.1;
const EXPORT_MAX_ZOOM = 2;

/**
 * Fixed 2x pixel ratio for screenshot-style exports.
 * This produces sharp output on standard screens while keeping file sizes reasonable.
 */
const EXPORT_SCREENSHOT_PIXEL_RATIO = 2;

/**
 * Padding ratio for fitView when capturing the screenshot export.
 * Gives a small margin around all nodes in the captured frame.
 */
const EXPORT_FIT_VIEW_PADDING = 0.08;

/**
 * Time in ms to wait after programmatic viewport changes before capturing.
 * React Flow applies transforms synchronously but the browser needs a
 * repaint cycle to commit the CSS changes to the rendered layer.
 */
const VIEWPORT_RENDER_DELAY_MS = 150;

const HIDDEN_REACT_FLOW_CLASSES = [
  'react-flow__minimap',
  'react-flow__controls',
  'react-flow__attribution',
  'react-flow__panel',
];

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

function findReactFlowContainerElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.react-flow');
}

function findReactFlowViewportElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.react-flow__viewport');
}

function shouldIncludeNodeInSnapshot(node: HTMLElement): boolean {
  const className =
    typeof node.className === 'string'
      ? node.className
      : (node.getAttribute?.('class') ?? '');
  for (const hidden of HIDDEN_REACT_FLOW_CLASSES) {
    // react-doctor-disable-next-line react-doctor/js-set-map-lookups
    if (className.includes(hidden)) {
      return false;
    }
  }
  return true;
}

/**
 * Wait for a specified number of milliseconds.
 */
function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Screenshot-style capture: captures the `.react-flow` container element
 * as it is currently rendered on screen, at 2x pixel ratio for sharpness.
 * This avoids the shadow/ghosting artifacts caused by re-computing transforms.
 */
async function screenshotContainerToPngBlob({
  backgroundColor,
  pixelRatio = EXPORT_SCREENSHOT_PIXEL_RATIO,
}: {
  backgroundColor: string;
  pixelRatio?: number;
}) {
  const containerEl = findReactFlowContainerElement();
  if (!containerEl) {
    throw new Error('Unable to locate React Flow container for export.');
  }

  const { width, height } = containerEl.getBoundingClientRect();

  const blob = await toBlob(containerEl, {
    backgroundColor,
    width,
    height,
    pixelRatio,
    cacheBust: true,
    filter: (domNode) => {
      if (!(domNode instanceof HTMLElement)) {
        return true;
      }
      return shouldIncludeNodeInSnapshot(domNode);
    },
  });

  if (!blob) {
    throw new Error('Unable to encode canvas export as PNG.');
  }
  return blob;
}

/**
 * Legacy viewport-transform-based capture. Used by the thumbnail pipeline
 * where we need specific output dimensions regardless of what's on screen.
 */
async function renderViewportToPngBlob({
  backgroundColor,
  dimensions,
  pixelRatio = EXPORT_SCREENSHOT_PIXEL_RATIO,
  viewport,
}: {
  backgroundColor: string;
  dimensions: ExportDimensions;
  pixelRatio?: number;
  viewport: Viewport;
}) {
  const viewportEl = findReactFlowViewportElement();
  if (!viewportEl) {
    throw new Error('Unable to locate React Flow viewport for export.');
  }

  const blob = await toBlob(viewportEl, {
    backgroundColor,
    width: dimensions.width,
    height: dimensions.height,
    pixelRatio,
    cacheBust: true,
    style: {
      width: `${dimensions.width}px`,
      height: `${dimensions.height}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
    filter: (domNode) => {
      if (!(domNode instanceof HTMLElement)) {
        return true;
      }
      return shouldIncludeNodeInSnapshot(domNode);
    },
  });

  if (!blob) {
    throw new Error('Unable to encode canvas export as PNG.');
  }
  return blob;
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
  // FileSystemWritableFileStream must be created, written, then closed in sequence.
  // react-doctor-disable-next-line react-doctor/async-parallel
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
  if (nodes.length === 0) {
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

  // Screenshot-style export: fit all nodes into the visible viewport,
  // wait for render, then capture what's actually on screen at 2x.
  const savedViewport = instance.getViewport();

  // Fit all visible nodes into view with padding
  instance.fitView({
    nodes,
    padding: EXPORT_FIT_VIEW_PADDING,
    duration: 0,
  });

  // Wait for the viewport change to be painted
  await waitMs(VIEWPORT_RENDER_DELAY_MS);

  const pngBlob = await screenshotContainerToPngBlob({
    backgroundColor,
    pixelRatio: pixelRatio ?? EXPORT_SCREENSHOT_PIXEL_RATIO,
  });

  // Restore the original viewport so the user doesn't see a jump
  instance.setViewport(savedViewport, { duration: 0 });

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

interface CaptureThumbnailOptions {
  backgroundColor: string;
  height: number;
  instance: ReactFlowInstance<any, any>;
  width: number;
}

/**
 * Capture the current ReactFlow canvas as a PNG data URL with **fixed**
 * output dimensions, fitting all visible nodes into the frame. This is the
 * thumbnail-pipeline counterpart to {@link exportReactFlowCanvasToPng};
 * unlike the user-facing PNG export it does not invoke save dialogs and
 * always returns a base64 PNG ready to send back over RPC.
 *
 * Returns `null` when there is nothing to capture (empty canvas) or when
 * the ReactFlow viewport element cannot be located in the DOM.
 */
export async function captureCanvasThumbnailDataUrl({
  backgroundColor,
  height,
  instance,
  width,
}: CaptureThumbnailOptions): Promise<string | null> {
  const nodes = getVisibleExportNodes(instance);
  if (nodes.length === 0) {
    return null;
  }

  const nodeBounds = instance.getNodesBounds(nodes);
  const padding = Math.max(Math.round(Math.min(width, height) * 0.06), 24);
  const viewport = getViewportForBounds(
    nodeBounds,
    width,
    height,
    EXPORT_MIN_ZOOM,
    EXPORT_MAX_ZOOM,
    padding / Math.max(width, height)
  );

  const blob = await renderViewportToPngBlob({
    backgroundColor,
    dimensions: { width, height },
    pixelRatio: 2,
    viewport,
  });
  return await blobToDataUrl(blob);
}

interface BuildCanvasExportJsonInput {
  edges: Edge[];
  nodes: Node[];
  viewId?: string;
  viewName?: string;
  viewport?: Viewport;
}

/**
 * Build a serializable canvas export document from the live in-memory
 * nodes/edges. Card / folder nodes already carry hydrated content (title,
 * body, color, children) in `data`, so the export is self-contained — no need
 * to roundtrip through the .md files on disk.
 */
export function buildCanvasExportJson({
  edges,
  nodes,
  viewId,
  viewName,
  viewport,
}: BuildCanvasExportJsonInput): CanvasExportDocument {
  const visibleNodes = nodes.filter((node) => {
    const data = node.data as CanvasNodeData | undefined;
    return !(data?.detached || data?.isHidden);
  });
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = edges.filter(
    (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
  );

  const sanitized = sanitizeForPersistence(visibleNodes, visibleEdges);

  return {
    schema: CANVAS_EXPORT_SCHEMA,
    exportedAt: new Date().toISOString(),
    ...(viewId ? { viewId } : {}),
    ...(viewName ? { viewName } : {}),
    ...(viewport ? { viewport } : {}),
    nodes: sanitized.nodes,
    edges: sanitized.edges,
  };
}

interface JsonFileSavePicker {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      accept: Record<string, string[]>;
      description: string;
    }>;
  }) => Promise<{
    createWritable: () => Promise<{
      close: () => Promise<void>;
      write: (data: Blob | string) => Promise<void>;
    }>;
  }>;
}

async function requestBrowserSaveHandleForJson(fileName: string) {
  const picker = globalThis as typeof globalThis & JsonFileSavePicker;
  if (!picker.showSaveFilePicker) {
    return null;
  }

  return await picker.showSaveFilePicker({
    suggestedName: fileName.endsWith('.json') ? fileName : `${fileName}.json`,
    types: [
      {
        description: 'Canvas JSON export',
        accept: { 'application/json': ['.json'] },
      },
    ],
  });
}

interface ExportCanvasJsonOptions {
  edges: Edge[];
  fileName: string;
  nodes: Node[];
  viewId?: string;
  viewName?: string;
  viewport?: Viewport;
}

/**
 * Serialize the current canvas to JSON and offer it for download.
 *
 * Order of attempts:
 *   1. `showSaveFilePicker` (modern browsers / Electrobun browser context)
 *   2. Native Bun-side save dialog via {@link rpcExportJson}
 *   3. `<a download>` fallback (legacy browsers, headless Electrobun)
 *
 * Returns `true` when a file was written, `false` when the user canceled.
 */
export async function exportReactFlowCanvasToJson({
  edges,
  fileName,
  nodes,
  viewId,
  viewName,
  viewport,
}: ExportCanvasJsonOptions) {
  const document_ = buildCanvasExportJson({
    edges,
    nodes,
    viewId,
    viewName,
    viewport,
  });

  if (document_.nodes.length === 0) {
    throw new Error('Canvas has no visible nodes to export.');
  }

  const json = JSON.stringify(document_, null, 2);

  let browserSaveHandle: Awaited<
    ReturnType<NonNullable<JsonFileSavePicker['showSaveFilePicker']>>
  > | null = null;
  try {
    browserSaveHandle = await requestBrowserSaveHandleForJson(fileName);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return false;
    }
    throw error;
  }

  if (browserSaveHandle) {
    // FileSystemWritableFileStream must be created, written, then closed in sequence.
    // react-doctor-disable-next-line react-doctor/async-parallel
    const writable = await browserSaveHandle.createWritable();
    await writable.write(
      new Blob([json], { type: 'application/json;charset=utf-8' })
    );
    await writable.close();
    return true;
  }

  const nativeResult = await rpcExportJson(json, fileName);
  if (nativeResult !== null) {
    return nativeResult.success;
  }

  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}
