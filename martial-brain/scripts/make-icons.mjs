/**
 * Rasterise the PWA icons from public/icons/icon.svg.
 *
 * Android reads the manifest's 192/512 PNGs and iOS needs apple-touch-icon.png;
 * neither accepts an SVG. Uses the Chromium that Playwright already provides
 * rather than adding an image-processing dependency for three files.
 *
 * Run manually after changing the SVG: `node scripts/make-icons.mjs`.
 * The PNGs are committed, so a normal build does not need a browser.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const icons = join(root, 'public/icons');
const svg = await readFile(join(icons, 'icon.svg'), 'utf8');

const SIZES = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath });

for (const { file, size } of SIZES) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<body style="margin:0">${svg.replace('<svg', `<svg width="${size}" height="${size}"`)}</body>`,
  );
  await writeFile(join(icons, file), await page.screenshot({ omitBackground: true }));
  await page.close();
  console.log(`${file} (${size}×${size})`);
}

await browser.close();
