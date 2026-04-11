# Project knowledge

This file gives Codebuff context about your project: goals, commands, conventions, and gotchas.

## What is this project?

An **Electrobun desktop app** built with React 19, TanStack Router/Query, Tailwind v4, Vite, and xyflow (React Flow). It features a spatial canvas UI with nodes (cards, folders, groups, images, stickies).

## Quickstart

- **Install:** `bun install`
- **Dev (with HMR, recommended):** `bun run dev:hmr`
- **Dev (no HMR):** `bun run dev`
- **Build (canary):** `bun run build:canary`
- **Type-check:** `bun run type-check` (uses `tsgo --noEmit`)
- **Lint:** `bun run lint` (ESLint with `--fix`, modifies files)
- **Format:** `bun run format` (oxfmt, modifies files)
- **All checks:** `bun run ci` (type-check + lint + format concurrently)
- **Test:** `bun run test` (vitest, single run)
- **Test (watch):** `bun run test:watch`
- **Ultracite check:** `bun run check`
- **Ultracite fix:** `bun run fix`

## Architecture

- **`src/bun/`** — Electrobun main process (Bun runtime). Handles window creation, note/workspace persistence, and decides whether to load packaged view or Vite dev server.
- **`src/mainview/`** — React renderer loaded into the desktop window.
  - `routes/` — TanStack Router file-based routes. `routeTree.gen.ts` is auto-generated (do not edit).
  - `components/canvas/` — xyflow canvas: node types (Card, Folder, Group, Image, Sticky), context menu, create menu, focused/folder views.
  - `components/ui/` — Shared UI primitives (shadcn/ui style via `components.json`).
  - `hooks/` — Custom hooks for canvas keyboard, persistence, context menu, helper lines, node creation, node drag.
  - `store/` — Zustand store (`canvasStore.ts`).
  - `lib/` — Utilities, constants, RPC, undo/redo, query client, sanitize, color utils.
  - `data/` — Initial node data.
- **`messages/`** — i18n message files (en, zh). Uses `@inlang/paraglide-js`.

### Data flow

- Zustand store manages canvas state (nodes, edges, selections).
- TanStack Query handles async data via a shared query client (`queryClient.ts`) with Sonner toast error handling.
- RPC (`lib/rpc.ts`) bridges renderer ↔ main process communication.
- Persistence hooks sync canvas state to the main process.

## Key conventions

- **Package manager:** `bun` for everything (including ultracite/lefthook).
- **Import alias:** `@/*` → `src/mainview/*`
- **Styling:** Tailwind v4 via `@tailwindcss/vite` plugin (no standalone tailwind config file).
- **Formatting/linting:** Ultracite (oxlint + oxfmt). Pre-commit hook via Lefthook runs `bunx ultracite fix`.
- **TypeScript:** Strict mode, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`. Use `tsgo` for type-checking.
- **React:** Function components only, React 19+ (use ref as prop, no forwardRef).
- **State:** Zustand for local state, TanStack Query for server/async state.
- **Routing:** TanStack Router with file-based routes and `createHashHistory()` for packaged app.
- **UI components:** shadcn/ui (new-york style), lucide-react icons, motion for animations, sonner for toasts.
- **Code style:** Arrow functions for callbacks, `const`/`let` only (no `var`), prefer `for...of`, optional chaining, nullish coalescing, template literals.

## Gotchas

- `bun run build` and `bun run build:prod` are mentioned in README but **do not exist** in package.json.
- `bun run lint` and `bun run format` **modify files** in place.
- Vite root is `src/mainview`, not the project root. Vite builds output to `dist/`.
- `routeTree.gen.ts` is generated — never edit manually.
- `dist/` is copied into `views/mainview/` by Electrobun at build time. `watchIgnore: ["dist/**"]` prevents rebuild loops.
- The dev server polls `localhost:5173` — if Vite is running, HMR is auto-enabled.
- No `any` casts — use `unknown` when type is genuinely unknown.
- Tests live alongside source as `*.test.ts` / `*.test.tsx` under `src/mainview/`.
