import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';

import { buildLlmsFull } from '../../lib/docs';

export const GET: APIRoute = async ({ site, url }) => {
  const origin = (site ?? url).origin;
  const entries = await getCollection('docs');
  return new Response(buildLlmsFull(entries, { origin }), {
    headers: {
      'cache-control': 'public, max-age=300',
      'content-type': 'text/plain; charset=utf-8',
    },
  });
};
