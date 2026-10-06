import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router';

import { routes } from './routes';
import { buildRobots, buildSitemap } from './seo/crawl';
import { renderHeadHtml } from './seo/head';
import { PAGES, indexablePages, type PageMeta } from './seo/pages';
import { SITE } from './site';

/*
 * Build-time renderer (used by scripts/prerender.mjs, never shipped to browsers).
 * Renders a URL to HTML exactly as the browser would, so hydration matches.
 */
export async function render(url: string): Promise<{ html: string; status: number }> {
  const { query, dataRoutes } = createStaticHandler(routes);
  const context = await query(new Request(new URL(url, 'http://prerender.local')));
  if (context instanceof Response) {
    throw new Error(`Unexpected redirect while pre-rendering ${url}`);
  }

  const router = createStaticRouter(dataRoutes, context);
  const html = renderToString(
    <StrictMode>
      <StaticRouterProvider router={router} context={context} hydrate={false} />
    </StrictMode>,
  );
  return { html, status: context.statusCode };
}

/** Pages written to disk: every indexable page plus the 404 page. */
export function prerenderTargets(): { url: string; meta: PageMeta; file: string }[] {
  return [
    ...indexablePages().map((meta) => ({ url: meta.path, meta, file: meta.path === '/' ? 'index.html' : `${meta.path.slice(1)}/index.html` })),
    { url: '/__not-found__', meta: PAGES.notFound, file: '404.html' },
  ];
}

export { buildRobots, buildSitemap, renderHeadHtml, PAGES, SITE };
