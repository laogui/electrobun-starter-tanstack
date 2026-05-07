import type { Node, ReactFlowInstance, Rect, Viewport } from '@xyflow/react';
import { getViewportForBounds } from '@xyflow/react';
import { toBlob } from 'html-to-image';
import { rpcExportPng } from '@/lib/rpc';

const EXPORT_PADDING = 64;
const EXPORT_MIN_ZOOM = 0.1;
const EXPORT_MAX_ZOOM = 2;
/**
 * Oversampling factor for hi-DPI ("retina") PNG exports.
 * The final bitmap dimensions are
 *   logicalWidth  * max(devicePixelRatio * MULTIPLIER, MIN)
 *   logicalHeight * max(devicePixelRatio * MULTIPLIER, MIN)
 * so a Retina (dpr=2) screen exports at ~4x and a standard screen at 3x.
 */
const EXPORT_PIXEL_RATIO_MULTIPLIER = 2;
const EXPORT_PIXEL_RATIO_MIN = 3;

function getDefaultExportPixelRatio() {
  const dpr =
    typeof window === 'undefined' ? 1 : Math.max(window.devicePixelRatio, 1);
  return Math.max(dpr * EXPORT_PIXEL_RATIO_MULTIPLIER, EXPORT_PIXEL_RATIO_MIN);
}

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

function findReactFlowViewportElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.react-flow__viewport');
}

function shouldIncludeNodeInSnapshot(node: HTMLElement): boolean {
  const className =
    typeof node.className === 'string'
      ? node.className
      : (node.getAttribute?.('class') ?? '');
  for (const hidden of HIDDEN_REACT_FLOW_CLASSES) {
    if (className.includes(hidden)) {
      return false;
    }
  }
  return true;
}

async function renderViewportToPngBlob({
  backgroundColor,
  dimensions,
  pixelRatio = getDefaultExportPixelRatio(),
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

  const pngBlob = await renderViewportToPngBlob({
    backgroundColor,
    dimensions: prepared.dimensions,
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
