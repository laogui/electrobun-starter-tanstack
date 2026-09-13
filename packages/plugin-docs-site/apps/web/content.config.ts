import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

import { DOCS_SECTIONS } from './lib/docs';

/**
 * GhostBoard plugin documentation. Files live at
 * `content/docs/<locale>/<section>/<slug>.md`; the entry id becomes
 * `<locale>/<section>/<slug>` and is parsed by `lib/docs.ts`.
 *
 * `content/docs/en/reference/sdk.md` is generated from the installed
 * `@ghostboard/sdk` package by `scripts/sync-sdk-reference.ts` (prebuild).
 */
const docs = defineCollection({
  loader: glob({ base: './content/docs', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    section: z.enum(DOCS_SECTIONS),
    order: z.number().int().nonnegative().default(100),
    sourceVersion: z.string().optional(),
  }),
});

export const collections = { docs };
