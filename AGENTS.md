# Repository Guidelines

## Project Structure & Module Organization

GhostBoard is a Bun/Electrobun desktop app with a React renderer. Main-process code lives in `src/bun/`, including workspace, search, preview, cleanup, attachments, and built-in templates under `src/bun/templates/<id>/`. Renderer code lives in `src/mainview/`: routes in `routes/`, UI in `components/`, hooks in `hooks/`, state in `store/`, and utilities in `lib/`. Shared markdown helpers are in `src/shared/markdown/`. Test helpers are in `src/test/`, planning docs in `docs/`, and localization files in `messages/`.

## Companion checkout

GhostBoard's backend and official website live in `/Users/laogui/Projects/react-starter-kit/`. Edit that checkout when a change touches the API, database, accounts, billing, licensing server, marketing pages, or the docs site. Read its `AGENTS.md` before editing, and run its own commands from that root.

- `apps/api/` and `db/` are the backend.
- `apps/web/` is the official site (Astro marketing and docs, served at `https://ghostboard.app`). It is the source of truth for site code.
- `apps/app/` is the signed-in web app in the same checkout.

## Build, Test, and Development Commands

- `bun install` installs dependencies.
- `bun run dev:hmr` starts Vite on `http://localhost:5173` with Electrobun; use it for UI work.
- `bun run dev` runs Electrobun watch mode without Vite HMR.
- `bun run hmr` starts the renderer-only Vite server.
- `bun run start` builds the renderer, then launches `electrobun dev`.
- `bun run build:canary` creates a canary desktop build.
- `bun run test` and `bun run test:watch` run the curated Vitest suite (see Testing Guidelines).
- `bun run type-check`, `bun run check`, `bun run fix`, and `bun run ci` run TypeScript and Ultracite/Biome validation. Treat `package.json` as the command source of truth.

## Coding Style & Naming Conventions

Use strict TypeScript and React function components. Follow Biome/Ultracite formatting: 2-space indentation, single quotes, semicolons, and formatter-ordered imports. Prefer the `@/*` alias for renderer imports from `src/mainview/*`. Do not hand-edit generated files such as `src/mainview/routeTree.gen.ts`. Components use `PascalCase.tsx`; hooks use `useThing.ts`; utilities and stores use descriptive camelCase names.

## Testing Guidelines

Unit tests are a deliberately small curated suite (~20 files) covering two categories only: security trust boundaries (local HTTP auth) and data-integrity invariants (import/export round-trips, corruption recovery, undo history). Do not add test files beyond these categories unless the user explicitly asks. Validate all other changes with `bun run type-check`, `bun run check`, builds, or manual verification.

Shared helpers live in `src/test/` (`setup-node.ts`); config is `vitest.config.ts`.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit-style subjects such as `feat: add demo template` and `refactor: replace saveAssetFile...`; keep the `type: summary` format. PRs should describe the user-visible change, list verification commands, link issues or docs, and include screenshots or recordings for UI changes. Note localization updates when editing `messages/*.json`.

## Security & Configuration Tips

Treat file paths, imported assets, and rendered markdown as untrusted input. Reuse sanitization and validation helpers in `src/mainview/lib/`, `src/shared/markdown/`, and `src/bun/attachments.ts`. Do not commit `dist/`, `build/`, `coverage/`, credentials, or local workspace data.
