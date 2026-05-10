import '@xyflow/react/dist/style.css';

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { Edge, Node } from '@xyflow/react';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import { useTheme } from 'better-themes';
import { ArrowLeft, Loader2, Play } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { useTemplate } from '@/hooks/useTemplates';
import { edgeTypes, readOnlyNodeTypes } from '@/lib/canvasConstants';
import { rpcCreateViewFromTemplate } from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';

export const Route = createFileRoute('/templates/$templateId')({
  component: TemplatePreviewRoute,
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function TemplatePreviewRoute() {
  const { templateId } = Route.useParams();
  const navigate = useNavigate();
  const { data: template, isLoading, isError } = useTemplate(templateId);
  const [creating, setCreating] = useState(false);

  const views = useCanvasStore((s) => s.views);
  const setViews = useCanvasStore((s) => s.setViews);
  const setActiveView = useCanvasStore((s) => s.setActiveView);

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
      setActiveView(result.id);
      await navigate({ to: '/' });
    } finally {
      setCreating(false);
    }
  }, [templateId, views, setViews, setActiveView, navigate]);

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
  const nodes = (template.nodes ?? []) as Node[];
  const edges = (template.edges ?? []) as Edge[];

  return (
    <ReactFlowProvider>
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

          {/* Use template button */}
          <button
            className="pointer-events-auto flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 font-medium text-sm text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
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

        <ReactFlow
          defaultEdgeOptions={{ type: 'labeledEdge', zIndex: 1 }}
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
    </ReactFlowProvider>
  );
}
