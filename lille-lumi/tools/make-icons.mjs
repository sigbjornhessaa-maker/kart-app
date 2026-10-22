// Lager app-ikonene (PNG) fra tools/icon.html med en hodeløs nettleser.
// Kjør fra lille-lumi-mappen:  node tools/make-icons.mjs   (krever Playwright)
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, '..', 'icons');
const page = pathToFileURL(path.join(dir, 'icon.html')).href;

const icons = [
  { file: 'icon-32.png', size: 32, grid: 32 },
  { file: 'icon-192.png', size: 192, grid: 32 },
  { file: 'icon-512.png', size: 512, grid: 32 },
  { file: 'apple-touch-icon.png', size: 180, grid: 30 },
  // Maskerbart ikon: mer luft rundt Lumi, så Android kan klippe det rundt/ovalt.
  { file: 'icon-maskable-512.png', size: 512, grid: 40 },
];

const browser = await chromium.launch();
const tab = await browser.newPage();
for (const icon of icons) {
  await tab.setViewportSize({ width: icon.size, height: icon.size });
  await tab.goto(`${page}?size=${icon.size}&grid=${icon.grid}`);
  await tab.waitForFunction(() => document.title === 'ready');
  await tab.locator('#c').screenshot({ path: path.join(out, icon.file) });
  console.log('Laget', icon.file);
}
await browser.close();
