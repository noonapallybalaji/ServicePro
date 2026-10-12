# SEO, indexing and Search Console

How the customer site (`apps/web-public`) is made discoverable, what is indexed, and how to keep it that way.

## How it works

The public site is a React app. Pages that should rank are **pre-rendered to static HTML at build time** and then hydrated in the browser. Crawlers and link previews (WhatsApp, Facebook, X) get the full content and `<head>` without running JavaScript. Visually, the site is unchanged.

```
pnpm --filter @servicepro/web-public build
  1. vite build                     → dist/ (browser bundle)
  2. vite build --ssr entry-server  → dist-server/ (build-time renderer, not deployed)
  3. node scripts/prerender.mjs     → dist/<page>/index.html, 404.html, app.html, sitemap.xml, robots.txt
```

| Source | What it owns |
|---|---|
| `src/site.ts` | **The one business/site config**: name, URL, description, phone, email, city/region/country, optional street address, social profiles, Search Console token, logo/OG image, theme colour. Read from `VITE_*` variables (see `.env.example`). |
| `src/content/services.ts` | Service pages: copy, common problems, FAQs, related services. Problems are the issue types customers can actually book (service catalogue). |
| `src/seo/pages.ts` | The page registry: title, description, canonical path, indexability, breadcrumbs, JSON-LD for every URL. |
| `src/seo/schema.ts` | JSON-LD builders: `LocalBusiness`, `WebSite`, `Service`, `BreadcrumbList`, `FAQPage`. |
| `src/seo/head.ts` | Renders the registry entry into `<head>` (build time) and keeps it in sync on client navigation (`usePageMeta`). |
| `src/seo/crawl.ts` | `sitemap.xml` and `robots.txt`, generated from the registry. |
| `src/routes.tsx` | One route table for the browser and the pre-renderer. |

## Configure for production

Create `apps/web-public/.env.production` from `.env.example`. Required:

- `VITE_SITE_URL`: the production origin, e.g. `https://www.yourdomain.in`. Canonical URLs, `og:url` and the sitemap use it. The build warns if it is still `localhost`.
- `VITE_BUSINESS_NAME`.

Optional facts are only published when set; **nothing is invented**:

- `VITE_SUPPORT_PHONE`, `VITE_SUPPORT_EMAIL`
- `VITE_BUSINESS_STREET_ADDRESS` / `VITE_BUSINESS_POSTAL_CODE`. Without them the business is described as a service-area business in Hyderabad (`areaServed`), with no `address`.
- `VITE_SOCIAL_PROFILES` (comma-separated; becomes `sameAs`), `VITE_TWITTER_HANDLE`
- `VITE_GOOGLE_SITE_VERIFICATION`

After changing the brand name or colours, regenerate the share image and icons (`public/og-image.png`, `logo.png`, `apple-touch-icon.png`, `favicon*.{svg,png}`). Run `scripts/make-images.mjs` against the dev server; the header of the script shows how.

## Deploy

Serve `dist/` as static files with these rules (already in `public/_redirects` and `public/_headers` for Netlify / Cloudflare Pages):

| Path | Serve | Status | Header |
|---|---|---|---|
| pre-rendered pages (`/`, `/services`, `/ac-repair`, …) | `<path>/index.html` | 200 | |
| `/book` | `app.html` | 200 | `X-Robots-Tag: noindex` |
| `/t/*` (tracking) | `app.html` | 200 | `X-Robots-Tag: noindex, nofollow` |
| `/account` (My bookings) | `app.html` | 200 | `X-Robots-Tag: noindex, nofollow` |
| `/api/*` | proxy to the API | | API adds `X-Robots-Tag: noindex, nofollow` itself |
| `/<path>/` | 301 → `/<path>` | 301 | |
| anything else | `404.html` | **404** | |
| `/assets/*` | file | 200 | `Cache-Control: public, max-age=31536000, immutable` |

nginx equivalent:

```nginx
location = /book   { add_header X-Robots-Tag "noindex" always; try_files /app.html =404; }
location ^~ /t/    { add_header X-Robots-Tag "noindex, nofollow" always; try_files /app.html =404; }
location = /account { add_header X-Robots-Tag "noindex, nofollow" always; try_files /app.html =404; }
location ^~ /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
rewrite ^/(.+)/$ /$1 permanent;
location / { try_files $uri $uri/index.html =404; }
error_page 404 /404.html;
```

To check a build locally with these exact rules: `pnpm --filter @servicepro/web-public preview` serves `dist/` on http://localhost:5193.

The staff (`apps/admin`) and technician (`apps/tech`) apps ship `<meta name="robots" content="noindex, nofollow">` and a `robots.txt` with `Disallow: /`. Keep them on their own hosts (e.g. `ops.` and `tech.` subdomains).

## Google Search Console

1. Add a **Domain** property (DNS verification, recommended) or a **URL-prefix** property.
   - For the HTML-tag method, put only the token in `VITE_GOOGLE_SITE_VERIFICATION` and redeploy. It is emitted on every page.
2. Submit `https://<your-domain>/sitemap.xml`.
3. Use **URL Inspection** on `/` and one service page to confirm they are indexable and the rendered HTML has content.
4. Validate structured data with the Rich Results Test and validator.schema.org.
5. Set up the **Google Business Profile** for the business separately, then add its URL to `VITE_SOCIAL_PROFILES`.

## Adding a page

- **New service:** add an entry to `SERVICES` in `src/content/services.ts`. Use a `code` that matches `service_categories.code` so the illustration and booking pre-selection work. The route, sitemap, footer links, services index, related links and `Service` JSON-LD all follow automatically.
- **Other public page:** add it to `PAGES` (and `indexablePages()` if it should be indexed), add a route in `src/routes.tsx`, and call `usePageMeta(PAGES.yourPage)` in the component.
- Only create location pages (e.g. a specific neighbourhood) when they have genuinely different, useful content. Thin near-duplicate pages hurt rankings.

## What is (and isn't) indexed

| Indexed (in sitemap) | Not indexed |
|---|---|
| `/`, `/services`, `/ac-repair`, `/refrigerator-repair`, `/washing-machine-repair`, `/tv-repair`, `/microwave-repair`, `/about`, `/contact`, `/faq` | `/book` (noindex, crawlable so the tag is seen), `/t/*` tracking and `/account` (noindex + robots-disallowed), `/api/*`, 404, staff and technician apps, any query-string variant (canonical points to the clean URL) |

## Audit: 6 Oct 2026

Run against the production build (`scripts/serve-dist.mjs`), with a real browser at 320, 375, 390, 768, 1024 and 1440 px, axe-core (WCAG 2.0/2.1/2.2 A+AA and best practices), and a check of the raw HTML crawlers receive. Brand: "ServicePro Appliance Care"; URL: `https://www.example.in`.

| Page | Status | Title (chars) | Description (chars) | Canonical | H1 | OG/Twitter | Schema | Indexable | Mobile 320–1440 | Accessibility |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` | 200 | 71 | 150 | ✓ | 1 | ✓ | LocalBusiness, WebSite | yes | ✓ | ✓ |
| `/services` | 200 | 66 | 155 | ✓ | 1 | ✓ | BreadcrumbList | yes | ✓ | ✓ |
| `/ac-repair` | 200 | 60 | 129 | ✓ | 1 | ✓ | Service, BreadcrumbList | yes | ✓ | ✓ ¹ |
| `/refrigerator-repair` | 200 | 60 | 123 | ✓ | 1 | ✓ | Service, BreadcrumbList | yes | ✓ | ✓ ¹ |
| `/washing-machine-repair` | 200 | 63 | 121 | ✓ | 1 | ✓ | Service, BreadcrumbList | yes | ✓ | ✓ ¹ |
| `/tv-repair` | 200 | 50 | 121 | ✓ | 1 | ✓ | Service, BreadcrumbList | yes | ✓ | ✓ ¹ |
| `/microwave-repair` | 200 | 57 | 111 | ✓ | 1 | ✓ | Service, BreadcrumbList | yes | ✓ | ✓ ¹ |
| `/about` | 200 | 68 | 159 | ✓ | 1 | ✓ | BreadcrumbList | yes | ✓ | ✓ |
| `/contact` | 200 | 54 | 145 | ✓ | 1 | ✓ | BreadcrumbList | yes | ✓ | ✓ |
| `/faq` | 200 | 54 | 149 | ✓ | 1 | ✓ | FAQPage, BreadcrumbList | yes | ✓ | ✓ |
| `/book` | 200 | — | — | none (noindex) | 1 ² | — | — | no | ✓ | ✓ |
| `/t/{token}` | 200 | — | — | none (noindex) | 1 ² | — | — | no | ✓ | ✓ |
| unknown URL | **404** | — | — | none (noindex) | 1 | — | — | no | ✓ | ✓ |

¹ The "FAQ page" link sits inside a sentence. That is exempt from the 24 px target-size rule (WCAG 2.5.8, inline exception).
² Rendered in the browser (client-only route); the H1 is present once the page loads.

No horizontal scrolling at any width, and no console or hydration errors on any route. The title length includes the brand name, so a shorter brand gives shorter titles.

### Fixed during the audit

- Muted and secondary text on the brand hero failed contrast (white at 68% = 4.15:1). Raised it to 80% (5.1:1) and 90% (5.96:1). The coral overline (2.69:1) now uses the light coral tint (4.71:1).
- Breadcrumb and contact links were under 24 px tall; they now meet the target size.
- The booking progress bar had no accessible name; booking and tracking-error views had no H1.
- Three meta descriptions were over 160 characters.
- Copy claimed "you approve the estimate before any repair starts". Estimate approval isn't enforced by the system yet (planned for Phase 3), so it now says "the technician explains the cost before any repair starts".
- Status filters on the staff request list were broken (fixed in the online-booking change).

### Performance notes

- Pages arrive as complete HTML, so the largest element (hero text and illustration) paints without waiting for JavaScript. The illustration is inline SVG: no image request and no layout shift.
- The Latin subset of the body font is preloaded. The Telugu and Hindi fonts download only when that script appears on the page.
- Booking and tracking code, plus the data-fetching library, are split out of the landing bundle (main JS: 131 KB gzipped, mostly React and React Router).
- Hashed assets are cacheable for a year.

## Please confirm with the business

These statements appear on the site; they describe how the product works, but the business should confirm them before launch:

- The technician explains the cost before starting any repair.
- Payment after the visit by UPI or cash.
- If an appliance can't be repaired, only the visiting charge applies.
- Service area: Hyderabad, checked by pincode at booking.
