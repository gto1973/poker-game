// Renders public/icons/icon.svg to the PNG sizes iOS and the manifest need.
// Usage: node scripts/make-icons.mjs   (uses the preinstalled Playwright Chromium)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Playwright is preinstalled globally in the dev container; set NODE_PATH to its location.
const { chromium } = require('playwright');
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [size, name] of [[180, 'apple-touch-icon.png'], [192, 'icon-192.png'], [512, 'icon-512.png']]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
  await page.screenshot({ path: new URL(`../public/icons/${name}`, import.meta.url).pathname, omitBackground: false });
  console.log('wrote', name);
}
await browser.close();
