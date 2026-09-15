# GhostBoard plugin docs site (drop-in for `react-starter-kit/apps/web`)

This directory holds the T5 documentation site as it was authored for the
`react-starter-kit` repository, which hosts the GhostBoard marketing site
(Astro 5, `srcDir: "."`, Paraglide `en`/`zh`, Cloudflare Workers). The files
are laid out with the same relative paths as that repository. Nothing here is
imported by the GhostBoard app.

**Status (2026-09-13): applied.** Everything below landed in `react-starter-kit`
on branch `feat/plugin-docs-site` (commit `12fe8bc`), where `bun run check`,
`bun run build`, `vitest --project @repo/web` and the pre-commit lint pass.
From now on `react-starter-kit/apps/web` is the source of truth for the site
code; this directory is kept as the authoring copy of the Markdown content and
for the `lib/docs.test.ts` gate that runs in this repository's `bun run test`.
Differences between the two copies are listed under "Applied deltas".

```text
apps/web/
├── content.config.ts                 # `docs` content collection (glob loader, frontmatter schema)
├── content/docs/{en,zh}/<section>/*.md
├── lib/docs.ts                       # locale/slug parsing, sidebar, fallback, prev/next, llms text
├── lib/docs.test.ts                  # vitest coverage for the helpers above
├── components/DocsSidebar.astro
├── layouts/DocsLayout.astro          # wraps the site's BaseLayout with sidebar, TOC, pagination
├── pages/docs/index.astro            # /docs/ and /zh/docs/
├── pages/docs/[...slug].astro        # /docs/<section>/<slug>/ and /zh/docs/...
├── pages/docs/llms.txt.ts            # page index for agents
├── pages/docs/llms-full.txt.ts       # every English page in one file
└── scripts/sync-sdk-reference.ts     # generates content/docs/en/reference/sdk.md from @ghostboard/sdk
packages/core/messages/docs.{en,zh}.json  # message keys to merge into the site's Paraglide catalogs
```

## Applied deltas (what differs in `react-starter-kit`)

- Imports use the site's `@/` alias (`@/lib/docs`, `@/layouts/DocsLayout.astro`, `@/src/paraglide/runtime.js`) and `import * as m from "@/src/paraglide/messages.js"`, matching `BaseLayout.astro` there.
- `@ghostboard/sdk` is not on npm yet, so `apps/web/package.json` points the devDependency at `file:./vendor/ghostboard-sdk-0.1.0.tgz` (packed from `packages/plugin-sdk`). Swap to the registry version and delete `vendor/` after `sdk-v0.1.0` is published.
- `content/docs/en/reference/sdk.md` **is committed** there (with `/apps/web/content/docs/en/reference/sdk.md` in `.prettierignore`); `bun run check` runs `sync-sdk-reference.ts --check` first so a stale copy fails CI, and `prebuild` regenerates it.
- `tailwind.config.css` gained `@plugin "@tailwindcss/typography";` and a `@source` for `components/`; `DocsLayout.astro` disables typography's backtick pseudo-elements and styles inline code via a scoped `<style>`.
- `tsconfig.json` includes `.astro/types.d.ts` so `getCollection("docs")` is typed; `@astrojs/check` was added so the pre-existing `check` script actually runs.
- `pages/sitemap.xml.ts` lists `/docs/` plus every English docs slug per locale (the `llms*.txt` endpoints are intentionally not in the sitemap).
- Root `vitest.config.ts` adds the `apps/web` project (`apps/web/vitest.config.ts`, `lib/**/*.test.ts`).
- `BaseLayout.astro` locale switcher got `isLocale()` narrowing (two pre-existing `astro check` errors).

## Original apply guide (kept for reference)

1. Copy `apps/web/**` into `apps/web/` of the site repository. `content/docs/en/reference/sdk.md` is **generated**; do not commit it there either (add it to `apps/web/.gitignore`).
2. Merge the keys from `packages/core/messages/docs.en.json` and `docs.zh.json` into `packages/core/messages/en.json` and `zh.json`. Keys: `web_nav_docs`, `docs_title`, `docs_landing_description`, `docs_landing_intro`, `docs_landing_cta`, `docs_fallback_badge`, `docs_fallback_notice`, `docs_source_version` (`{version}`), `docs_on_this_page`, `docs_previous`, `docs_next`.
3. `apps/web/package.json`:
   - `devDependencies`: `"@ghostboard/sdk": "0.1.0"` (exact pin — bumping it is how the reference page is upgraded), `"@tailwindcss/typography"`.
   - `scripts`: `"prebuild": "bun scripts/sync-sdk-reference.ts"`, `"sync:sdk": "bun scripts/sync-sdk-reference.ts"`, and add `bun scripts/sync-sdk-reference.ts --check` to the CI step that runs `astro check`.
4. Tailwind: add `@plugin "@tailwindcss/typography";` to the site's global CSS (Tailwind v4) so the `prose` classes in `DocsLayout.astro` resolve.
5. `layouts/BaseLayout.astro`: add `{ href: localizeHref('/docs/'), label: m.web_nav_docs() }` to `navLinks` and the footer links. `DocsLayout.astro` passes `title` and `description` to `BaseLayout`; adjust the prop names if the real `BaseLayout` differs. The paraglide imports in these files use `../src/paraglide/runtime.js` and `../src/paraglide/messages.js` (`import { m } from ...`), matching Paraglide JS 2 output with `outdir: ./src/paraglide`.
6. `pages/sitemap.xml.ts`: include every `docs` entry (`/docs/<slug>/` and `/zh/docs/<slug>/`, use `toPages` + `buildSidebar` from `lib/docs.ts`) plus `/docs/llms.txt` and `/docs/llms-full.txt`.
7. `worker.ts`: nothing to change as long as `/docs/*` is not routed to a service binding; `/zh/docs/*` is handled by the Paraglide middleware stripping the prefix before Astro routing.
8. Root `vitest.config.ts`: add `apps/web/lib/**/*.test.ts` to the web project so `lib/docs.test.ts` runs in `bun test`.
9. Run `bun run format`, `bun run check`, `bun test`, `astro check`, `bun run build` in `apps/web`, then deploy. Replace the placeholder `example.com`/`PUBLIC_APP_ORIGIN` values in `apps/web/wrangler.jsonc` and `.env` with the production domain; the docs assume `https://ghostboard.app/docs/`.

## Behavior

- Locale comes from Paraglide's `getLocale()`; the same page file serves `/docs/*` and `/zh/docs/*`.
- A Chinese page that does not exist falls back to the English entry and shows the `docs_fallback_notice` banner; the sidebar marks such items with an `EN` badge.
- Sections and order are fixed by `DOCS_SECTIONS` in `lib/docs.ts` and the `section`/`order` frontmatter.
- `/docs/llms.txt` lists every English page with absolute URLs; `/docs/llms-full.txt` concatenates all English bodies (including the generated SDK reference) so an agent can read the whole site in one fetch without external links.

## Verification performed in this repository

- `bun run test` runs `apps/web/lib/docs.test.ts` (11 cases: id parsing, ordering, zh→en fallback, sidebar badges, prev/next, llms output).
- The Astro files were compiled in a scratch Astro 5 project with the Node adapter, stub `BaseLayout`, stub Paraglide runtime/messages and a `/zh` prefix-stripping middleware: `astro check` reported 0 errors, `astro build` succeeded, and the built server returned 200 for `/docs/`, `/docs/start/first-plugin/`, `/zh/docs/start/first-plugin/` (localized), `/zh/docs/reference/sdk/` (English fallback with banner), `/docs/llms.txt`, `/docs/llms-full.txt` (18 pages) and 404 for `/docs/nope/`.
- `scripts/sync-sdk-reference.ts` was run against the packed `@ghostboard/sdk` 0.1.0 tarball and `--check` passed.

The real site's `BaseLayout` props, Tailwind setup and Paraglide output paths could not be verified from this repository; items 4–6 above are the places to look if `astro check` fails after copying.
