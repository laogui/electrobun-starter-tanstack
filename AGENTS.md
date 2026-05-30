# Repository Guidelines

## Project Structure & Module Organization

GhostBoard is a Bun/Electrobun desktop app with a React renderer. Main-process code lives in `src/bun/`, including workspace, search, preview, cleanup, attachments, and built-in templates under `src/bun/templates/<id>/`. Renderer code lives in `src/mainview/`: routes in `routes/`, UI in `components/`, hooks in `hooks/`, state in `store/`, and utilities in `lib/`. Shared markdown helpers are in `src/shared/markdown/`. Test helpers are in `src/test/`, planning docs in `docs/`, and localization files in `messages/`.

## Build, Test, and Development Commands

- `bun install` installs dependencies.
- `bun run dev:hmr` starts Vite on `http://localhost:5173` with Electrobun; use it for UI work.
- `bun run dev` runs Electrobun watch mode without Vite HMR.
- `bun run hmr` starts the renderer-only Vite server.
- `bun run start` builds the renderer, then launches `electrobun dev`.
- `bun run build:canary` creates a canary desktop build.
- `bun run test`, `bun run test:watch`, and `bun run test:coverage` run Vitest once, in watch mode, or with coverage.
- `bun run type-check`, `bun run check`, `bun run fix`, and `bun run ci` run TypeScript and Ultracite/Biome validation. Treat `package.json` as the command source of truth.

## Coding Style & Naming Conventions

Use strict TypeScript and React function components. Follow Biome/Ultracite formatting: 2-space indentation, single quotes, semicolons, and formatter-ordered imports. Prefer the `@/*` alias for renderer imports from `src/mainview/*`. Do not hand-edit generated files such as `src/mainview/routeTree.gen.ts`. Components use `PascalCase.tsx`; hooks use `useThing.ts`; utilities and stores use descriptive camelCase names.

## Testing Guidelines

Vitest covers `src/mainview/**/*.{test,spec}.{ts,tsx}` and `src/bun/**/*.{test,spec}.{ts,tsx}` with setup from `src/test/`. Place tests beside source files, for example `canvasStore.ts` and `canvasStore.test.ts`. Use Testing Library for React behavior and direct unit tests for pure logic. Add or update tests whenever behavior changes, and run `bun run test` before submitting.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit-style subjects such as `feat: add demo template` and `refactor: replace saveAssetFile...`; keep the `type: summary` format. PRs should describe the user-visible change, list verification commands, link issues or docs, and include screenshots or recordings for UI changes. Note localization updates when editing `messages/*.json`.

## Security & Configuration Tips

Treat file paths, imported assets, and rendered markdown as untrusted input. Reuse sanitization and validation helpers in `src/mainview/lib/`, `src/shared/markdown/`, and `src/bun/attachments.ts`. Do not commit `dist/`, `build/`, `coverage/`, credentials, or local workspace data.
