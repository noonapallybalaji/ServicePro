import { useEffect } from 'react';

import { SITE, absoluteUrl } from '../site';
import type { PageMeta } from './pages';

/*
 * <head> tags for a page, described once and output two ways:
 *   renderHeadHtml — at build time, into each pre-rendered HTML file (what crawlers and link
 *                    previews read);
 *   usePageMeta    — in the browser, so client-side navigation updates the same tags.
 */

type HeadTag =
  | { kind: 'title'; text: string }
  | { kind: 'meta'; attrs: Record<string, string> }
  | { kind: 'link'; attrs: Record<string, string> }
  | { kind: 'jsonld'; json: unknown };

export function headTags(page: PageMeta): HeadTag[] {
  const url = absoluteUrl(page.path);
  const image = absoluteUrl(SITE.ogImagePath);
  const tags: HeadTag[] = [
    { kind: 'title', text: page.title },
    { kind: 'meta', attrs: { name: 'description', content: page.description } },
    { kind: 'meta', attrs: { name: 'robots', content: page.indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow' } },
  ];

  if (page.indexable) {
    tags.push(
      { kind: 'link', attrs: { rel: 'canonical', href: url } },
      { kind: 'meta', attrs: { property: 'og:type', content: 'website' } },
      { kind: 'meta', attrs: { property: 'og:site_name', content: SITE.name } },
      { kind: 'meta', attrs: { property: 'og:locale', content: SITE.locale } },
      { kind: 'meta', attrs: { property: 'og:title', content: page.title } },
      { kind: 'meta', attrs: { property: 'og:description', content: page.description } },
      { kind: 'meta', attrs: { property: 'og:url', content: url } },
      { kind: 'meta', attrs: { property: 'og:image', content: image } },
      { kind: 'meta', attrs: { property: 'og:image:width', content: String(SITE.ogImageWidth) } },
      { kind: 'meta', attrs: { property: 'og:image:height', content: String(SITE.ogImageHeight) } },
      { kind: 'meta', attrs: { property: 'og:image:alt', content: `${SITE.name} — appliance repair in ${SITE.city}` } },
      { kind: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
      { kind: 'meta', attrs: { name: 'twitter:title', content: page.title } },
      { kind: 'meta', attrs: { name: 'twitter:description', content: page.description } },
      { kind: 'meta', attrs: { name: 'twitter:image', content: image } },
    );
    if (SITE.twitterHandle) tags.push({ kind: 'meta', attrs: { name: 'twitter:site', content: SITE.twitterHandle } });
  }

  if (SITE.googleSiteVerification) {
    tags.push({ kind: 'meta', attrs: { name: 'google-site-verification', content: SITE.googleSiteVerification } });
  }

  for (const json of page.jsonLd) tags.push({ kind: 'jsonld', json });
  return tags;
}

const escapeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** JSON inside <script> must not be able to close the tag. */
const safeJson = (json: unknown) => JSON.stringify(json).replace(/</g, '\\u003c');
const attrs = (record: Record<string, string>) =>
  Object.entries(record)
    .map(([key, value]) => `${key}="${escapeAttr(value)}"`)
    .join(' ');

/** Marks tags this module owns, so client navigation can replace them. */
const OWNED = 'data-seo';

export function renderHeadHtml(page: PageMeta): string {
  return headTags(page)
    .map((tag) => {
      switch (tag.kind) {
        case 'title':
          return `<title>${escapeText(tag.text)}</title>`;
        case 'meta':
          return `<meta ${OWNED} ${attrs(tag.attrs)} />`;
        case 'link':
          return `<link ${OWNED} ${attrs(tag.attrs)} />`;
        case 'jsonld':
          return `<script ${OWNED} type="application/ld+json">${safeJson(tag.json)}</script>`;
      }
    })
    .join('\n    ');
}

function applyHead(page: PageMeta) {
  document.head.querySelectorAll(`[${OWNED}]`).forEach((el) => el.remove());
  for (const tag of headTags(page)) {
    if (tag.kind === 'title') {
      document.title = tag.text;
      continue;
    }

    const el = document.createElement(tag.kind === 'jsonld' ? 'script' : tag.kind);
    el.setAttribute(OWNED, '');
    if (tag.kind === 'jsonld') {
      el.setAttribute('type', 'application/ld+json');
      el.textContent = safeJson(tag.json);
    } else {
      for (const [key, value] of Object.entries(tag.attrs)) el.setAttribute(key, value);
    }
    document.head.appendChild(el);
  }
}

/** Keeps <head> in sync with the current page during client-side navigation. */
export function usePageMeta(page: PageMeta) {
  useEffect(() => applyHead(page), [page]);
}
