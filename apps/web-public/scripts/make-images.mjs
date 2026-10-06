// Generates the social preview image, favicons and logo from the site's own artwork, so they always
// match the brand. Re-run after changing the brand name or colours, then commit public/*.png.
//
// Needs the dev server running (pnpm --filter @servicepro/web-public dev) and puppeteer-core:
//   PUPPETEER=<path to puppeteer-core ESM entry> CHROME=<chrome.exe> node scripts/make-images.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const SITE = process.env.SITE_ORIGIN ?? 'http://localhost:5192';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const entry = process.env.PUPPETEER ?? 'puppeteer-core';
const { default: puppeteer } = await import(entry.includes(':') || entry.startsWith('/') ? pathToFileURL(entry).href : entry);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${SITE}/`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);

  // Artwork and copy straight from the rendered home page.
  const art = await page.evaluate(() => ({
    mark: document.querySelector('header a svg')?.outerHTML ?? '',
    scene: document.querySelector('main svg[viewBox="0 0 400 320"]')?.outerHTML ?? '',
    name: document.querySelector('header a')?.textContent?.trim() ?? '',
    city: document.querySelector('main section p')?.textContent?.replace(/^.* in /, '').trim() ?? '',
  }));

  async function shot(file, width, height, html, transparent = false) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.evaluate((markup) => {
      document.body.innerHTML = markup;
    }, html);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(out, file), omitBackground: transparent, clip: { x: 0, y: 0, width, height } });
    console.log(`  public/${file}`);
  }

  const fill = (size) => `<div style="width:${size}px;height:${size}px;display:flex">${art.mark.replace(/class="[^"]*"/, 'width="100%" height="100%"')}</div>`;

  await shot(
    'og-image.png',
    1200,
    630,
    `<div data-surface="brand" class="surface-hero" style="width:1200px;height:630px;display:flex;align-items:center;gap:40px;padding:72px;box-sizing:border-box">
       <div style="flex:1;display:flex;flex-direction:column;gap:28px">
         <div style="display:flex;align-items:center;gap:16px"><div style="width:64px;height:64px;display:flex">${art.mark.replace(/class="[^"]*"/, 'width="100%" height="100%"')}</div>
           <span style="font-size:34px;font-weight:800;color:#fff">${art.name}</span></div>
         <div style="font-size:64px;line-height:1.05;font-weight:800;color:#fff;letter-spacing:-0.02em">Appliance repair at your doorstep</div>
         <div style="font-size:28px;color:rgba(255,255,255,.88)">AC · Fridge · Washing machine · TV · Microwave${art.city ? ` — ${art.city}` : ''}</div>
       </div>
       <div style="width:440px;display:flex">${art.scene.replace(/class="[^"]*"/, 'width="100%"')}</div>
     </div>`,
  );
  await shot('logo.png', 512, 512, fill(512), true);
  await shot('apple-touch-icon.png', 180, 180, `<div style="background:#0b6276;width:180px;height:180px;display:flex">${fill(180)}</div>`);
  await shot('favicon-32.png', 32, 32, fill(32), true);

  // SVG favicon: the same mark with the brand colours resolved (favicons can't read CSS variables).
  const colours = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    return { primary: css.getPropertyValue('--primary').trim(), accent: css.getPropertyValue('--accent').trim() };
  });
  const svg = art.mark
    .replace(/ class="[^"]*"/, '')
    .replace(/ aria-hidden="true"| focusable="false"/g, '')
    .replace(/var\(--primary\)/g, colours.primary)
    .replace(/var\(--accent\)/g, colours.accent)
    .replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  fs.writeFileSync(path.join(out, 'favicon.svg'), `${svg}\n`);
  console.log('  public/favicon.svg');
} finally {
  await browser.close();
}
