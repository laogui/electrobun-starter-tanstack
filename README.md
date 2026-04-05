# React + Tailwind + Vite Electrobun Template

A fast Electrobun desktop app template with React, Tailwind CSS, and Vite for hot module replacement (HMR).

## Getting Started

```bash
# Install dependencies
bun install

# Development without HMR (uses bundled assets)
bun run dev

# Development with HMR (recommended)
bun run dev:hmr

# Build for production
bun run build

# Build for production release
bun run build:prod
```

## How HMR Works

When you run `bun run dev:hmr`:

1. **Vite dev server** starts on `http://localhost:5173` with HMR enabled
2. **Electrobun** starts and detects the running Vite server
3. The app loads from the Vite dev server instead of bundled assets
4. Changes to React components update instantly without full page reload

When you run `bun run dev` (without HMR):

1. Electrobun starts and loads from `views://mainview/index.html`
2. You need to rebuild (`bun run build`) to see changes

## Project Structure

```
├── src/
│   ├── bun/
│   │   └── index.ts        # Main process (Electrobun/Bun)
│   └── mainview/
│       ├── App.tsx         # React app component
│       ├── main.tsx        # React entry point
│       ├── index.html      # HTML template
│       └── index.css       # Tailwind CSS
├── electrobun.config.ts    # Electrobun configuration
├── vite.config.ts          # Vite configuration
├── tailwind.config.js      # Tailwind configuration
└── package.json
```

## Customizing

- **React components**: Edit files in `src/mainview/`
- **Tailwind theme**: Edit `tailwind.config.js`
- **Vite settings**: Edit `vite.config.ts`
- **Window settings**: Edit `src/bun/index.ts`
- **App metadata**: Edit `electrobun.config.ts`

## Unit Testing

This project now uses **Vitest** as the recommended unit test runner.

Recommended approach for this codebase:

- **Renderer unit tests**: use `Vitest` for fast feedback and colocate tests as `*.test.ts` / `*.test.tsx` under `src/mainview/`
- **React component tests**: use `@testing-library/react` for user-facing behavior
- **Main-process code** (`src/bun/`): prefer integration or app-level tests later, because Electrobun runtime APIs are harder to isolate in unit tests

Current setup:

```bash
# Run all unit tests once
bun run test

# Run Vitest in watch mode
bun run test:watch
```

The initial example test covers `src/mainview/lib/canvasUtils.ts`, which is a good pattern to follow for pure canvas logic before expanding into component tests.
