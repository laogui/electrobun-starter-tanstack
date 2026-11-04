import '@xyflow/react/dist/style.css';

import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { Edge } from '@xyflow/react';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { useTheme } from 'better-themes';
import { ArrowLeft, Camera, Loader2, Play } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import {
  bumpTemplateThumbnailVersion,
  useTemplate,
} from '@/hooks/useTemplates';
import {
  defaultLabeledEdgeOptions,
  edgeTypes,
  readOnlyNodeTypes,
} from '@/lib/canvasConstants';
import { captureCanvasThumbnailDataUrl } from '@/lib/canvasExport';
import { resolveEdgeMarkers } from '@/lib/edgeMarkers';
import { rpcCreateViewFromTemplate, rpcSaveTemplateThumbnail } from '@/lib/rpc';
import {
  type TemplatePreviewSource,
  templatePreviewNodes,
} from '@/lib/templatePreview';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';

const THUMBNAIL_WIDTH = 800;
const THUMBNAIL_HEIGHT = 500;

export const Route = createFileRoute('/templates/$templateId')({
  component: TemplatePreviewRoute,
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function TemplatePreviewRoute() {
  // ReactFlowProvider lives at the outermost level so any inner child
  // (including the dev-only "export thumbnail" handler) can call
  // `useReactFlow` to access the live ReactFlow instance.
  return (
    <ReactFlowProvider>
      <TemplatePreviewContent />
    </ReactFlowProvider>
  );
}

function TemplatePreviewContent() {
  const { templateId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: template, isLoading, isError } = useTemplate(templateId);
  const [creating, setCreating] = useState(false);
  const [exportingThumbnail, setExportingThumbnail] = useState(false);
  const rfInstance = useReactFlow();

  const views = useCanvasStore((s) => s.views);
  const setViews = useCanvasStore((s) => s.setViews);
  const switchView = useCanvasStore((s) => s.switchView);

  const { theme, systemTheme } = useTheme();
  const isDark =
    theme === 'dark' || (theme === 'system' && systemTheme === 'dark');
  const bg = isDark ? '#141414' : '#EFF3F4';
  const grid = isDark ? 'rgba(255,255,255,0.14)' : '#D8DCDF';

  const handleUseTemplate = useCallback(async () => {
    setCreating(true);
    try {
      const name = `Canvas ${String(views.length + 1)}`;
      const result = (await rpcCreateViewFromTemplate(name, templateId)) as {
        id: string;
        name: string;
      } | null;
      if (result === null) {
        toast.error(m.template_preview_error());
        return;
      }
      setViews([...views, { id: result.id, name: result.name }]);
      const switched = await switchView(result.id);
      if (!switched) {
        toast.error(m.toast_view_switch_save_failed());
      }
      await navigate({ to: '/' });
    } finally {
      setCreating(false);
    }
  }, [templateId, views, setViews, switchView, navigate]);

  /**
   * Dev-only: snapshot the current preview at 800×500, base64-encode the
   * PNG, and ask the bun process to write it back into
   * `src/bun/templates/<templateId>/thumbnail.png`. Vite picks up the new
   * file via HMR so the templates browser refreshes without a reload.
   */
  const handleExportThumbnail = useCallback(async () => {
    if (exportingThumbnail) {
      return;
    }
    setExportingThumbnail(true);
    try {
      const dataUrl = await captureCanvasThumbnailDataUrl({
        backgroundColor: bg,
        height: THUMBNAIL_HEIGHT,
        instance: rfInstance,
        width: THUMBNAIL_WIDTH,
      });
      if (!dataUrl) {
        toast.error(m.template_thumbnail_empty());
        return;
      }
      const result = await rpcSaveTemplateThumbnail(templateId, dataUrl);
      if (!result) {
        toast.error(m.template_thumbnail_rpc_unavailable());
        return;
      }
      if (result.success) {
        // Bump the cache-buster for this template's thumbnail URL and
        // invalidate the templates query so consumers (the browser list
        // page) refetch and render the freshly written PNG instead of
        // the stale, cached one Vite served earlier.
        bumpTemplateThumbnailVersion(templateId);
        await queryClient.invalidateQueries({ queryKey: ['templates'] });
        await queryClient.invalidateQueries({
          queryKey: ['templates', templateId],
        });
        toast.success(
          m.template_thumbnail_written({ path: result.path ?? 'thumbnail.png' })
        );
      } else {
        toast.error(
          m.template_thumbnail_save_failed({
            reason: result.reason ?? m.error_unknown(),
          })
        );
      }
    } catch (error) {
      console.error('[templates] export thumbnail failed', error);
      toast.error(m.template_thumbnail_export_failed());
    } finally {
      setExportingThumbnail(false);
    }
  }, [bg, exportingThumbnail, queryClient, rfInstance, templateId]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-white dark:bg-neutral-900">
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="animate-spin" size={20} />
          {m.template_preview_loading()}
        </div>
      </div>
    );
  }

  // Error state
  if (isError || !template) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-white dark:bg-neutral-900">
        <p className="text-gray-500 text-sm dark:text-gray-400">
          {m.template_preview_error()}
        </p>
        <Link
          className="flex items-center gap-1.5 text-gray-500 text-sm transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          to="/templates"
        >
          <ArrowLeft size={16} />
          {m.template_preview_back()}
        </Link>
      </div>
    );
  }

  const meta = template.meta as {
    name: string;
    description: string;
    category: string;
    tags: string[];
  };
  const nodes = templatePreviewNodes(template as TemplatePreviewSource);
  const edges = resolveEdgeMarkers((template.edges ?? []) as Edge[], nodes);

  return (
    <div
      className="fixed inset-x-0 bottom-0"
      style={{
        top: 'var(--app-titlebar-height, 40px)',
        backgroundColor: bg,
      }}
    >
      {/* Floating overlay: header + use template button */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4">
        {/* Back + template info */}
        <div className="pointer-events-auto flex items-center gap-3 rounded-xl bg-white/85 px-4 py-2.5 shadow-sm backdrop-blur-md dark:bg-neutral-800/85">
          <Link
            className="flex items-center gap-1.5 text-gray-500 text-sm transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            to="/templates"
          >
            <ArrowLeft size={14} />
            {m.template_preview_back()}
          </Link>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="font-semibold text-gray-900 text-sm dark:text-gray-100">
            {meta.name}
          </span>
          <span className="max-w-xs truncate text-gray-500 text-xs dark:text-gray-400">
            {meta.description}
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {/* Dev-only: capture current preview as the template's thumbnail.
              Hidden in production builds via the import.meta.env.DEV guard. */}
          {import.meta.env.DEV ? (
            <button
              aria-label="Export thumbnail (dev only)"
              className="flex items-center gap-2 rounded-xl bg-white/85 px-3.5 py-2.5 font-medium text-gray-700 text-sm shadow-sm backdrop-blur-md transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-800/85 dark:text-gray-200 dark:hover:bg-neutral-700"
              disabled={exportingThumbnail}
              onClick={handleExportThumbnail}
              title="Capture current preview as thumbnail.png (dev only)"
              type="button"
            >
              {exportingThumbnail ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Camera size={16} />
              )}
              <span className="hidden sm:inline">导出缩略图</span>
            </button>
          ) : null}

          {/* Use template button */}
          <button
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 font-medium text-sm text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={creating}
            onClick={handleUseTemplate}
            type="button"
          >
            {creating ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                {m.template_preview_creating()}
              </>
            ) : (
              <>
                <Play size={16} />
                {m.template_preview_use()}
              </>
            )}
          </button>
        </div>
      </div>

      <ReactFlow
        defaultEdgeOptions={defaultLabeledEdgeOptions}
        edges={edges}
        edgeTypes={edgeTypes}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        maxZoom={1}
        minZoom={0.1}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable={false}
        nodesFocusable={false}
        nodeTypes={readOnlyNodeTypes}
        panOnDrag
        panOnScroll
        proOptions={{ hideAttribution: true }}
        style={{ backgroundColor: bg }}
        zoomOnDoubleClick={false}
        zoomOnPinch
        zoomOnScroll
      >
        <Background
          color={grid}
          gap={24}
          size={1.5}
          variant={BackgroundVariant.Dots}
        />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
