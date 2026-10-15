// Serves the production build the way the hosting rules do (public/_redirects, public/_headers):
// pre-rendered files as-is, /book and /t/* via the app shell, everything else 404.html with a 404
// status. /api is proxied to the local API so booking and tracking work.
// Usage: node scripts/serve-dist.mjs   (PORT, HOST, SERVICEPRO_API override the defaults)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT ?? 5193);
// Local only by default: on a public deployment, Cloudflare Tunnel is the way in.
const host = process.env.HOST ?? '127.0.0.1';
const api = new URL(process.env.SERVICEPRO_API ?? 'http://localhost:5180');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
};

function send(res, file, status = 200, headers = {}) {
  res.writeHead(status, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', ...headers });
  fs.createReadStream(file).pipe(res);
}

function resolveFile(urlPath) {
  const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  for (const candidate of [clean, path.join(clean, 'index.html')]) {
    const file = path.join(dist, candidate);
    if (file.startsWith(dist) && fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

http
  .createServer((req, res) => {
    const { pathname, search } = new URL(req.url, 'http://local');

    // One URL per page: /services/ → /services (canonical tags already point at the slashless form).
    if (pathname.length > 1 && pathname.endsWith('/')) {
      res.writeHead(301, { location: pathname.replace(/\/+$/, '') + search }).end();
      return;
    }

    if (pathname.startsWith('/api/')) {
      const upstream = http.request({ host: api.hostname, port: api.port, path: req.url, method: req.method, headers: req.headers }, (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      });
      upstream.on('error', () => res.writeHead(502).end('API unavailable'));
      req.pipe(upstream);
      return;
    }

    if (pathname === '/book' || pathname === '/account' || pathname.startsWith('/account/') || pathname.startsWith('/t/')) {
      return send(res, path.join(dist, 'app.html'), 200, { 'x-robots-tag': pathname === '/book' ? 'noindex' : 'noindex, nofollow' });
    }

    const file = resolveFile(pathname);
    if (file) {
      const immutable = pathname.startsWith('/assets/') ? { 'cache-control': 'public, max-age=31536000, immutable' } : {};
      return send(res, file, 200, immutable);
    }

    return send(res, path.join(dist, '404.html'), 404);
  })
  .listen(port, host, () => console.log(`Production build on http://${host}:${port}`));
