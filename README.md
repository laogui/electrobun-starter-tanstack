# GhostBoard

GhostBoard is a local-first spatial canvas for visual knowledge management. Instead of linear notes, you organize ideas the way you would on a whiteboard — by position, distance, and grouping — on an infinite, zoomable canvas. It is a desktop app built with Electrobun (Bun runtime) and a React 19 renderer.

Your content stays on your machine, inside a workspace folder you choose. Each note's source of truth is a BlockNote JSON sidecar (`content/.ghostboard/blocknote/<noteId>.json`); canvas layout lives in separate manifest files. Markdown is an import/export format, not the storage format: you can import `.md` files and export notes or canvases to Markdown, but editing files in the workspace with an external editor is not synced back into GhostBoard.

## Features

- Infinite pan/zoom canvas powered by React Flow (`@xyflow/react`).
- Multiple content node types: text cards, checklists, images, local file attachments, link cards with metadata unfurling, sticky notes, and topics.
- Lightweight mind mapping with Topic nodes: `Tab` adds a subtopic, `Enter` adds a sibling, branches lay out to the right automatically, move and detach as a whole, and the outline exports to Markdown.
- Two complementary grouping models: open Groups (children stay visible on the canvas) and stacked Folders (children collapse into a summary stack).
- Immersive focused view with a BlockNote (Notion-style) block editor for long-form writing, plus image zoom/pan.
- Node-to-node edges with labels, colors, and animated flow.
- Multi-canvas views within a single workspace, with the same note reusable across canvases by `noteId`.
- Global search (`Cmd/Ctrl+K`), a browsable note library, tag management with filtering, and undo/redo.
- Context menus, multi-select batch actions, drag-and-drop file import, and Markdown import/export.
- Settings with workspace management, trash, unlinked-file cleanup, keyboard cheatsheet, and update checks.
- Internationalized UI (English and Chinese) via Paraglide/Inlang.

## Getting Started

```bash
# Install dependencies
bun install

# Development with HMR (recommended for UI work)
bun run dev:hmr

# Development without HMR (Electrobun watch mode)
bun run dev

# Renderer-only Vite dev server
bun run hmr

# Build the renderer, then launch Electrobun
bun run start

# Create a canary desktop build
bun run build:canary
```

Treat `package.json` as the source of truth for available scripts.

## How HMR Works

When you run `bun run dev:hmr`:

1. Vite builds the renderer and starts a dev server on `http://localhost:5173` with HMR enabled.
2. Electrobun starts and detects the running Vite server.
3. The app loads from the Vite dev server instead of bundled assets.
4. Changes to React components update instantly without a full reload.

When you run `bun run dev` (without HMR), Electrobun loads bundled assets and you rebuild to see renderer changes.

## Project Structure

```
├── src/
│   ├── bun/                # Main process (Electrobun/Bun): workspace, search,
│   │                       # preview, cleanup, attachments, built-in templates
│   ├── mainview/           # React renderer
│   │   ├── routes/         # TanStack Router file-based routes
│   │   ├── components/     # Canvas nodes, UI primitives, editor, library, search, settings
│   │   ├── hooks/          # Custom hooks (canvas keyboard, persistence, drag, etc.)
│   │   ├── store/          # Zustand store (canvasStore.ts)
│   │   └── lib/            # Utilities, RPC, undo/redo, query client, sanitize
│   ├── shared/markdown/    # Shared Markdown helpers
│   └── test/               # Test setup and helpers
├── messages/               # i18n message files (en, zh)
├── docs/                   # PRD, tech spec, planning docs
├── electrobun.config.ts    # Electrobun configuration and build targets
├── vite.config.ts          # Vite configuration
└── package.json
```

## Tech Stack

React 19, TypeScript (strict), TanStack Router/Query, Tailwind CSS v4, @xyflow/react, BlockNote, markdown-it + DOMPurify, Zustand, Motion, Vite, Bun, and Electrobun.

## Development

- Type-check: `bun run type-check`
- Lint/format check: `bun run check`
- Auto-fix: `bun run fix`
- Combined non-mutating checks (type-check, lint, format check): `bun run ci`
- Format check (no writes): `bun run format:check`
- Tests: `bun run test` (single run), `bun run test:watch`, `bun run test:coverage` (V8 coverage report in `coverage/`)

Run `bun run check && bun run test` before submitting changes. See `AGENTS.md` for full contributor guidelines and `docs/` for the PRD and technical specification.

## License

MIT — see [LICENSE](./LICENSE).
