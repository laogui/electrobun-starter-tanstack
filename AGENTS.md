# AGENTS.md

## Development commands

- `bun install`
- `bun run dev` — start Electrobun in watch mode without Vite HMR
- `bun run dev:hmr` — recommended local workflow; runs the Vite dev server and Electrobun together
- `bun run hmr` — renderer-only Vite dev server on `http://localhost:5173`
- `bun run start` — build the renderer with Vite, then launch `electrobun dev`
- `bun run build:canary` — build the renderer and package with Electrobun's canary env
- `bun run type-check` — runs `tsgo --noEmit`
- `bun run lint` — runs ESLint with `--fix` and may modify files
- `bun run format` — runs `oxfmt --write .` and may modify files
- `bun run ci` — runs type-check, lint, and format concurrently
- Tests: there is currently no `test` script and no committed test files. `vitest` is installed, so use `bunx vitest run` for all tests or `bunx vitest run src/path/to/file.test.tsx` for a single test file when tests are added.

Use `package.json` as the source of truth for scripts: `README.md` still mentions `bun run build` and `bun run build:prod`, but those scripts are not present.

## Architecture

- The app is split into two runtime sides:
  - `src/bun/` is the Electrobun main process.
  - `src/mainview/` is the React renderer loaded into the desktop window.
- `src/bun/index.ts` decides whether to load the packaged view (`views://mainview/index.html`) or the Vite dev server. In the `dev` channel it polls `http://localhost:5173`; if that server is up, HMR is enabled automatically.
- `vite.config.ts` sets the Vite root to `src/mainview` and emits the renderer build into `dist/`. `electrobun.config.ts` then copies `dist/index.html` and `dist/assets` into `views/mainview/` for Electrobun packaging. `watchIgnore: ["dist/**"]` avoids rebuild loops while using HMR.
- The renderer is a TanStack Router app. Routes are file-based under `src/mainview/routes/`, and `@tanstack/router-plugin` generates `src/mainview/routeTree.gen.ts`. Treat `routeTree.gen.ts` as generated output, not a hand-edited source file.
- `src/mainview/main.tsx` mounts `RouterProvider`, and `src/mainview/router.tsx` creates the router, injects the shared React Query client into router context, and switches to `createHashHistory()` outside `http:`/`https:` so routing works inside the packaged desktop app.
- `src/mainview/routes/__root.tsx` is the global shell: it renders the route outlet, wires up the Sonner toaster, and mounts TanStack Devtools for Router, Query, and Form state.
- `src/mainview/lib/queryClient.ts` centralizes React Query behavior. Query failures surface as Sonner toasts with a built-in retry action, so network/data errors are expected to be handled through that shared client instead of per-screen ad hoc notifications.
- Imports use the TS path alias `@/* -> src/mainview/*`. `components.json` also defines the shadcn/ui aliases, so shared UI primitives live under `@/components/ui`.
- Styling is Tailwind v4 via `@tailwindcss/vite`; there is no separate Tailwind config file in the repo right now.
