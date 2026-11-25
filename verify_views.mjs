import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright-core';

const outDir = path.resolve('.verify');
fs.mkdirSync(outDir, { recursive: true });

// Minimal local static server for index.html (avoids any file:// CORS quirks)
function startServer() {
  const html = fs.readFileSync(path.resolve('index.html'));
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

async function run() {
  const { server, url } = await startServer();
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--no-sandbox',
    ],
  });

  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    errors.push(`[pageerror] ${err.message}`);
  });

  // 1. Capture deterministic verification shots with ?capture=1
  await page.goto(`${url}/?capture=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__PELICAN_READY__ === true, null, { timeout: 20000 });

  const shots = [
    { name: '01_side_hero.png', preset: 'side', t: 0.35 },
    { name: '02_foreground_lamppost.png', preset: 'side', t: 1.92 },
    { name: '03_closeup_head_wing.png', preset: 'closeup', t: 3.10 },
    { name: '04_low_pedals_contact.png', preset: 'lowpedals', t: 0.55 },
    { name: '05_wide_street_dof.png', preset: 'wide', t: 4.50 },
    { name: '06_hero34.png', preset: 'hero34', t: 7.40 },
  ];

  for (const s of shots) {
    const t0 = Date.now();
    await page.evaluate(({ preset, t }) => {
      window.setCameraPreset(preset);
      window.renderAt(t);
    }, s);
    await page.screenshot({ path: path.join(outDir, s.name) });
    console.log(`Captured ${s.name} (${Date.now() - t0} ms)`);
  }

  // 2. Also verify normal interactive mode (UI badge & glass bar visible, zero errors)
  const uiPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  uiPage.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[ui console.error] ${msg.text()}`);
  });
  uiPage.on('pageerror', (err) => {
    errors.push(`[ui pageerror] ${err.message}`);
  });
  await uiPage.goto(`${url}/`, { waitUntil: 'load' });
  await uiPage.waitForFunction(() => window.__PELICAN_READY__ === true, null, { timeout: 20000 });
  await uiPage.waitForTimeout(300);
  await uiPage.screenshot({ path: path.join(outDir, '07_ui_interactive.png') });
  console.log('Captured 07_ui_interactive.png');

  await browser.close();
  server.close();

  if (errors.length > 0) {
    console.error('ERRORS DETECTED:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log('All verification shots rendered cleanly with ZERO console/page errors!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
