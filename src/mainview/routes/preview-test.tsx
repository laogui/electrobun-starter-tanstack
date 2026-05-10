/**
 * Temporary dev route — DELETE when P0 visual verification is done.
 *
 * Exercises every read-only node type (`readOnlyNodeTypes`) in a real
 * ReactFlow canvas, without touching canvasStore, RPC, or the main app's
 * persistence layer. Pan and zoom are enabled so you can inspect rendering
 * at different scales (including the zoomed-out placeholder variants).
 *
 * Navigate to: #/preview-test
 */

import '@xyflow/react/dist/style.css';

import { createFileRoute, Link } from '@tanstack/react-router';
import type { Edge, Node } from '@xyflow/react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import { useTheme } from 'better-themes';
import { ArrowLeft } from 'lucide-react';

import { edgeTypes, readOnlyNodeTypes } from '@/lib/canvasConstants';

export const Route = createFileRoute('/preview-test')({
  component: PreviewTestRoute,
});

/** Inline SVG data URL — works offline, no network dependency. */
const DEMO_IMAGE_DATA_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#6366F1"/>
          <stop offset="1" stop-color="#A78BFA"/>
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#g)"/>
      <text x="200" y="150" text-anchor="middle" dominant-baseline="middle"
        fill="white" font-family="system-ui, sans-serif"
        font-size="28" font-weight="700">Demo image</text>
    </svg>`
  );

const demoNodes: Node[] = [
  // ─── Row 1: four Cards ─────────────────────────────────────────────────
  {
    id: 'card-text',
    type: 'card',
    position: { x: 80, y: 80 },
    style: { width: 320, height: 380 },
    data: {
      type: 'text',
      title: 'Default Card',
      color: '#FFFFFF',
      content:
        'A plain text card rendered via NotePreview in read-only mode. Any rich-text preview HTML is honored without editing affordances.',
      previewHtml:
        '<p>A plain text card rendered via <strong>NotePreview</strong> in read-only mode. Any rich-text preview HTML is honored without editing affordances.</p>',
    },
  },
  {
    id: 'card-checklist',
    type: 'card',
    position: { x: 440, y: 80 },
    style: { width: 320, height: 380 },
    data: {
      type: 'checklist',
      title: 'Checklist Card',
      tag: 'Todo',
      tagColor: '#FBCFE8',
      color: '#FDF2F8',
      items: [
        { text: 'Release prep', isHeader: true },
        { text: 'Write release notes', checked: true },
        { text: 'Tag release in git', checked: false },
        { text: 'Publish announcement', checked: false },
      ],
    },
  },
  {
    id: 'card-pie',
    type: 'card',
    position: { x: 800, y: 80 },
    style: { width: 320, height: 380 },
    data: {
      type: 'image',
      title: 'Pie Chart Card',
      color: '#1A1A1A',
      pieData: [
        { label: 'Design', color: '#6366F1' },
        { label: 'Engineering', color: '#8B5CF6' },
        { label: 'Research', color: '#A78BFA' },
      ],
    },
  },
  {
    id: 'card-dark',
    type: 'card',
    position: { x: 1160, y: 80 },
    style: { width: 320, height: 380 },
    data: {
      type: 'text',
      title: 'Dark Card',
      color: '#111827',
      content: 'Dark background — text color auto-inverts to white.',
      previewExcerpt: 'Dark background — text color auto-inverts to white.',
    },
  },

  // ─── Row 2: Stickies · Folder · Images ─────────────────────────────────
  {
    id: 'sticky-yellow',
    type: 'sticky',
    position: { x: 80, y: 520 },
    style: { width: 200, height: 200 },
    data: {
      color: '#FEF08A',
      content: 'Review onboarding flow before the next sprint!',
    },
  },
  {
    id: 'sticky-green',
    type: 'sticky',
    position: { x: 320, y: 520 },
    style: { width: 200, height: 200 },
    data: {
      color: '#BBF7D0',
      content: 'Ask design team about the palette 🎨',
    },
  },
  {
    id: 'folder',
    type: 'folder',
    position: { x: 560, y: 520 },
    style: { width: 280, height: 280 },
    data: {
      title: 'Research',
      subtitle: '12 items',
      footer: 'Updated 2d ago',
    },
  },
  {
    id: 'image-with',
    type: 'image',
    position: { x: 880, y: 520 },
    style: { width: 320, height: 280 },
    data: {
      imageUrl: DEMO_IMAGE_DATA_URL,
      title: 'Image with URL',
      color: '#FFFFFF',
    },
  },
  {
    id: 'image-empty',
    type: 'image',
    position: { x: 1240, y: 520 },
    style: { width: 320, height: 280 },
    data: {
      imageUrl: '',
      color: '#F3F4F6',
    },
  },

  // ─── Row 3: Group with 2 child stickies ────────────────────────────────
  {
    id: 'group-1',
    type: 'group',
    position: { x: 80, y: 860 },
    style: { width: 720, height: 320 },
    data: {
      label: 'Design Sprint',
      color: 'blue',
    },
  },
  {
    id: 'group-sticky-1',
    type: 'sticky',
    parentId: 'group-1',
    extent: 'parent',
    position: { x: 40, y: 60 },
    style: { width: 200, height: 200 },
    data: {
      color: '#FEF08A',
      content: 'Child sticky inside the group.',
    },
  },
  {
    id: 'group-sticky-2',
    type: 'sticky',
    parentId: 'group-1',
    extent: 'parent',
    position: { x: 280, y: 60 },
    style: { width: 200, height: 200 },
    data: {
      color: '#E0E7FF',
      content: 'Another child sticky — different color.',
    },
  },
  {
    id: 'group-card-1',
    type: 'card',
    parentId: 'group-1',
    extent: 'parent',
    position: { x: 500, y: 40 },
    style: { width: 200, height: 240 },
    data: {
      type: 'text',
      title: 'Nested card',
      color: '#FFFFFF',
      content: 'A card living inside a group node.',
      previewExcerpt: 'A card living inside a group node.',
    },
  },
];

const demoEdges: Edge[] = [
  {
    id: 'e1',
    source: 'card-text',
    target: 'card-checklist',
    type: 'labeledEdge',
    data: { label: 'flows into' },
  },
  {
    id: 'e2',
    source: 'card-checklist',
    target: 'card-pie',
    type: 'labeledEdge',
  },
  {
    id: 'e3',
    source: 'sticky-yellow',
    target: 'folder',
    type: 'labeledEdge',
    data: { label: 'references' },
  },
  {
    id: 'e4',
    source: 'folder',
    target: 'image-with',
    type: 'labeledEdge',
  },
];

function PreviewTestRoute() {
  const { theme, systemTheme } = useTheme();
  const isDark =
    theme === 'dark' || (theme === 'system' && systemTheme === 'dark');
  const bg = isDark ? '#141414' : '#EFF3F4';
  const grid = isDark ? 'rgba(255,255,255,0.14)' : '#D8DCDF';

  return (
    <ReactFlowProvider>
      <div
        className="fixed inset-x-0 bottom-0"
        style={{
          top: 'var(--app-titlebar-height, 40px)',
          backgroundColor: bg,
        }}
      >
        {/* Overlay: back link + legend */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4">
          <Link
            className="pointer-events-auto flex items-center gap-2 rounded-xl bg-white/85 px-3 py-2 font-medium text-gray-700 text-sm shadow-sm backdrop-blur-md transition-colors hover:bg-white dark:bg-neutral-800/85 dark:text-gray-200 dark:hover:bg-neutral-700/85"
            to="/"
          >
            <ArrowLeft size={14} />
            Back to canvas
          </Link>
          <div className="pointer-events-auto max-w-sm rounded-xl bg-white/85 p-3 text-gray-600 text-xs shadow-sm backdrop-blur-md dark:bg-neutral-800/85 dark:text-gray-300">
            <div className="mb-1 flex items-center gap-2 font-semibold text-gray-900 text-sm dark:text-white">
              <span aria-hidden="true">🧪</span>
              Read-only nodes preview
            </div>
            <p>
              Temporary dev route. Renders every <em>readOnlyNodeTypes</em>{' '}
              variant in a live React Flow canvas.
            </p>
            <p className="mt-1.5">
              Pan &amp; zoom are enabled (try zoom &lt; 0.4 to trigger the
              zoomed-out placeholder layouts). Nodes should have zero edit
              affordances and make no store / RPC calls.
            </p>
          </div>
        </div>

        <ReactFlow
          defaultEdgeOptions={{ type: 'labeledEdge', zIndex: 1 }}
          edges={demoEdges}
          edgeTypes={edgeTypes}
          elementsSelectable={false}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          maxZoom={4}
          minZoom={0.1}
          nodes={demoNodes}
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
          <MiniMap
            maskColor={isDark ? 'rgba(20,20,20,0.7)' : 'rgba(240,239,237,0.7)'}
            nodeColor="#ddd"
            nodeStrokeColor="#999"
            pannable
            position="bottom-right"
            style={{
              backgroundColor: isDark
                ? 'rgba(28,28,28,0.92)'
                : 'rgba(255,255,255,0.92)',
              border: isDark
                ? '1px solid rgba(255,255,255,0.08)'
                : '1px solid rgba(0,0,0,0.08)',
              borderRadius: 8,
            }}
            zoomable
          />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}
