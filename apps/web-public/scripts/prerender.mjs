// Writes static HTML for every public page, plus sitemap.xml, robots.txt, 404.html and the
// app shell used by client-only routes. Runs after `vite build` and the SSR build (see package.json).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const server = await import(pathToFileURL(path.join(root, 'dist-server', 'entry-server.js')).href);
const { render, prerenderTargets, renderHeadHtml, buildSitemap, buildRobots, PAGES, SITE } = server;

if (/localhost|127\.0\.0\.1/.test(SITE.url)) {
  console.warn(`⚠ VITE_SITE_URL is ${SITE.url}. Set the production origin before deploying, or canonical URLs and the sitemap will point at it.`);
}

const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
if (!template.includes('<!--app-head-->') || !template.includes('<!--app-html-->')) {
  throw new Error('dist/index.html is missing the <!--app-head--> / <!--app-html--> placeholders.');
}

// Preload the Latin subset of the body font: it is referenced from CSS, so the browser would
// otherwise discover it late (better LCP, no late font swap).
const assets = fs.readdirSync(path.join(dist, 'assets'));
const font = assets.find((file) => /^manrope-latin-wght-normal.*\.woff2$/.test(file));
const fontPreload = font ? `<link rel="preload" href="/assets/${font}" as="font" type="font/woff2" crossorigin />\n    ` : '';

const page = (head, html) => template.replace('<!--app-head-->', fontPreload + head).replace('<!--app-html-->', html);
const write = (file, contents) => {
  const target = path.join(dist, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
};

// The empty shell for client-only routes (/book, /t/:token): noindex until the page sets its own tags.
write('app.html', page(renderHeadHtml(PAGES.appShell), ''));

for (const target of prerenderTargets()) {
  const { html, status } = await render(target.url);
  // The 404 page renders normally; hosting serves 404.html with the 404 status (public/_redirects).
  if (status !== 200) throw new Error(`${target.url} rendered with status ${status}`);
  write(target.file, page(renderHeadHtml(target.meta), html));
  console.log(`  ${target.file}`);
}

write('sitemap.xml', buildSitemap(new Date().toISOString().slice(0, 10)));
write('robots.txt', buildRobots());
console.log('  sitemap.xml, robots.txt, app.html');
