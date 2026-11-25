import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Bundles Three.js + all procedural scene modules into ONE single, 100% self-contained
 * index.html file optimized for effortless immersive fullscreen on both PC and mobile
 * (zero external models, images, fonts, or CDN calls).
 */
async function build() {
  const result = await esbuild.build({
    entryPoints: ['src/main.js'],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2022'],
    write: false,
  });

  const bundledJs = result.outputFiles[0].text;
  const safeJs = bundledJs.replace(/<\/script/gi, '<\\/script');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="theme-color" content="#141210" />
<title>A Pelican Riding a Bicycle — Real-Time 3D Cinema</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  html, body {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100dvh;
    min-height: -webkit-fill-available;
    overflow: hidden;
    overscroll-behavior: none;
    background: #141210;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    user-select: none;
    -webkit-user-select: none;
  }

  #webgl-canvas {
    position: fixed;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: grab;
  }
  #webgl-canvas:active { cursor: grabbing; }

  /* Silky zero-hitch cinema fade-in curtain */
  #fade-curtain {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: #141210;
    pointer-events: none;
    opacity: 1;
    transition: opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1);
  }
  #fade-curtain.ready { opacity: 0; }

  /* Effortless 1-Tap Immersive Fullscreen & Sound Pill (top-center, auto-dismisses on tap) */
  #immersive-prompt {
    position: fixed;
    top: calc(18px + env(safe-area-inset-top, 0px));
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    padding: 8px 16px;
    border-radius: 999px;
    background: rgba(18, 15, 13, 0.56);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(255, 246, 232, 0.22);
    color: rgba(255, 250, 242, 0.94);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.03em;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.30);
    transition: opacity 0.4s ease, transform 0.35s ease, background 0.2s ease;
    white-space: nowrap;
  }
  #immersive-prompt:hover {
    background: rgba(28, 23, 19, 0.74);
    transform: translateX(-50%) scale(1.02);
  }
  #immersive-prompt.dismissed,
  body.ui-idle #immersive-prompt {
    opacity: 0;
    pointer-events: none;
    transform: translateX(-50%) translateY(-8px);
  }

  /* Bottom-left subtle cinema title badge */
  #title-badge {
    position: fixed;
    left: calc(20px + env(safe-area-inset-left, 0px));
    bottom: calc(22px + env(safe-area-inset-bottom, 0px));
    z-index: 20;
    padding: 7px 14px;
    border-radius: 999px;
    background: rgba(16, 14, 12, 0.50);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 246, 232, 0.14);
    color: rgba(255, 249, 240, 0.90);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    pointer-events: none;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
    transition: opacity 0.45s ease;
  }
  body.immersive-mode.ui-idle #title-badge {
    opacity: 0.35;
  }

  /* Compact auto-hiding bottom frosted-glass control bar */
  #control-bar {
    position: fixed;
    left: 50%;
    bottom: calc(20px + env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%);
    z-index: 25;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 7px;
    border-radius: 999px;
    background: rgba(18, 15, 13, 0.60);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 246, 232, 0.16);
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.36);
    transition: opacity 0.45s ease, transform 0.45s ease;
    max-width: calc(100vw - 20px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
    flex-wrap: nowrap;
    justify-content: center;
    overflow-x: auto;
    scrollbar-width: none;
  }
  #control-bar::-webkit-scrollbar { display: none; }
  #control-bar.idle-hidden {
    opacity: 0;
    transform: translateX(-50%) translateY(14px);
    pointer-events: none;
  }

  .ctrl-divider {
    width: 1px;
    height: 18px;
    background: rgba(255, 245, 230, 0.15);
    margin: 0 2px;
    flex-shrink: 0;
  }

  .ctrl-btn {
    appearance: none;
    border: none;
    background: transparent;
    color: rgba(255, 248, 238, 0.86);
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.02em;
    padding: 7px 11px;
    min-height: 34px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    transition: background 0.18s ease, color 0.18s ease, transform 0.12s ease;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .ctrl-btn:hover {
    background: rgba(255, 246, 232, 0.13);
    color: #fffdf9;
  }
  .ctrl-btn:active { transform: scale(0.96); }
  .ctrl-btn.active {
    background: rgba(255, 244, 224, 0.22);
    color: #fffef9;
    box-shadow: inset 0 0 0 1px rgba(255, 242, 218, 0.28);
  }
  .ctrl-btn.primary {
    background: rgba(196, 38, 44, 0.85);
    color: #fffdf9;
    font-weight: 600;
    padding: 7px 13px;
  }
  .ctrl-btn.primary:hover { background: rgba(216, 48, 54, 0.96); }
  .ctrl-btn.icon-only { padding: 7px 9px; min-width: 34px; }

  .preset-group {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    background: rgba(0, 0, 0, 0.22);
    padding: 2px;
    border-radius: 999px;
    flex-shrink: 0;
  }

  /* Minimal floating export progress banner (excluded from WebGL canvas) */
  #export-overlay {
    position: fixed;
    left: 50%;
    bottom: calc(28px + env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%);
    z-index: 40;
    width: min(340px, calc(100vw - 32px));
    padding: 12px 16px;
    border-radius: 14px;
    background: rgba(16, 14, 12, 0.84);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(255, 244, 224, 0.18);
    color: #fffaf2;
    font-size: 12px;
    display: none;
    flex-direction: column;
    gap: 8px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  }
  #export-overlay.visible { display: flex; }
  #export-bar {
    width: 100%;
    height: 5px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.14);
    overflow: hidden;
  }
  #export-fill {
    width: 0%;
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #d8363c, #f2a154);
    transition: width 0.08s linear;
  }

  /* Responsive Mobile & Tablet Immersion Layout */
  @media (max-width: 1040px) {
    #title-badge {
      bottom: auto;
      top: calc(14px + env(safe-area-inset-top, 0px));
      left: calc(14px + env(safe-area-inset-left, 0px));
      font-size: 10px;
      padding: 6px 11px;
    }
    #immersive-prompt {
      top: auto;
      bottom: calc(74px + env(safe-area-inset-bottom, 0px));
      font-size: 11px;
      padding: 7px 13px;
    }
  }
  @media (max-width: 720px) {
    #control-bar {
      padding: 4px 6px;
      gap: 3px;
      bottom: calc(14px + env(safe-area-inset-bottom, 0px));
    }
    .ctrl-divider { display: none; }
    .ctrl-btn {
      font-size: 11px;
      padding: 7px 7px;
      min-height: 36px;
      gap: 4px;
    }
    .ctrl-btn.icon-only { padding: 7px 7px; min-width: 34px; }
    .ctrl-btn.primary { padding: 7px 9px; }
    .btn-text, .export-full-label, .preset-full { display: none; }
    .export-short-label, .preset-short { display: inline; }
  }
  @media (min-width: 721px) {
    .export-short-label, .preset-short { display: none; }
  }
</style>
</head>
<body>
<canvas id="webgl-canvas"></canvas>
<div id="fade-curtain"></div>

<div id="ui-root">
  <button id="immersive-prompt" aria-label="Enter immersive fullscreen with audio">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
    <span>Tap for Immersive Fullscreen &amp; Sound</span>
  </button>

  <div id="title-badge">A PELICAN RIDING A BICYCLE</div>

  <div id="control-bar" role="toolbar" aria-label="Scene Controls">
    <button id="btn-play" class="ctrl-btn" title="Play / Pause (Space)"></button>

    <div class="ctrl-divider"></div>

    <div class="preset-group" role="group" aria-label="Camera Presets">
      <button class="ctrl-btn active" data-preset="side"><span class="preset-full">Side Track</span><span class="preset-short">Side</span></button>
      <button class="ctrl-btn" data-preset="hero34"><span class="preset-full">3/4 Hero</span><span class="preset-short">3/4</span></button>
      <button class="ctrl-btn" data-preset="closeup"><span class="preset-full">Close-Up</span><span class="preset-short">Close</span></button>
      <button class="ctrl-btn" data-preset="orbit"><span class="preset-full">Free Orbit</span><span class="preset-short">Orbit</span></button>
    </div>

    <div class="ctrl-divider"></div>

    <button id="btn-mute" class="ctrl-btn icon-only" title="Toggle Ambient Audio (M)"></button>
    <button id="btn-fullscreen" class="ctrl-btn icon-only" title="Immersive Fullscreen (F)"></button>

    <button id="btn-export" class="ctrl-btn primary" title="Render deterministic 12s 1080p 60fps video">
      <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="5"/></svg>
      <span class="export-full-label">Record Smooth 60fps Video</span>
      <span class="export-short-label">60fps</span>
    </button>
  </div>
</div>

<div id="export-overlay" aria-live="polite">
  <div id="export-label">Preparing 1080p 60fps render…</div>
  <div id="export-bar"><div id="export-fill"></div></div>
</div>

<script>${safeJs}</script>
</body>
</html>`;

  const outPath = path.resolve('index.html');
  fs.writeFileSync(outPath, html, 'utf8');
  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`Built self-contained PC & Mobile index.html (${kb} KB)`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
