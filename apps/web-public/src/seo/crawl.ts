import { SITE, absoluteUrl } from '../site';
import { indexablePages } from './pages';

/** sitemap.xml: indexable, canonical pages only — generated from the page registry. */
export function buildSitemap(lastModified: string): string {
  const urls = indexablePages()
    .map(
      (page) =>
        `  <url>\n    <loc>${absoluteUrl(page.path)}</loc>\n    <lastmod>${lastModified}</lastmod>\n` +
        (page.sitemap ? `    <changefreq>${page.sitemap.changefreq}</changefreq>\n    <priority>${page.sitemap.priority.toFixed(1)}</priority>\n` : '') +
        '  </url>',
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * Private and transactional paths are blocked. The staff and technician apps live on their own
 * hosts and ship their own "Disallow: /" robots.txt; the paths below cover reverse-proxy setups
 * where they share this domain.
 * /book is deliberately NOT blocked: it carries a noindex tag, which crawlers can only see if allowed in.
 */
const DISALLOW = ['/api/', '/t/', '/admin', '/technician', '/account', '/dashboard', '/login', '/signup', '/search'];

export function buildRobots(): string {
  return ['User-agent: *', 'Allow: /', ...DISALLOW.map((path) => `Disallow: ${path}`), '', `Sitemap: ${SITE.url}/sitemap.xml`, ''].join('\n');
}
