import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';

import { buildLlmsIndex, toPages } from '../../lib/docs';

export const GET: APIRoute = async ({ site, url }) => {
  const origin = (site ?? url).origin;
  const pages = toPages(await getCollection('docs'));
  return new Response(buildLlmsIndex(pages, { origin }), {
    headers: {
      'cache-control': 'public, max-age=300',
      'content-type': 'text/plain; charset=utf-8',
    },
  });
};
