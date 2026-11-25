import * as THREE from 'three';
import {
  LOOP_DURATION,
  WHEEL_RADIUS,
  CRANK_REVS_PER_LOOP,
  LOOP_DIST,
  clamp,
  lerp,
} from './utils.js';
import { createBicycle } from './bicycle.js';
import { createPelican } from './pelican.js';
import { createStreet } from './street.js';
import { setupLighting } from './lighting.js';
import { createPostPipeline } from './postprocess.js';
import { createSoundscape } from './audio.js';
import { exportSmooth60fpsVideo } from './exporter.js';

const urlParams = new URLSearchParams(window.location.search);
const isCaptureMode = urlParams.get('capture') === '1';

// =========================================================================
// 1. RENDERER, SCENE, CAMERA & HALF-FLOAT PIPELINE
// =========================================================================
const canvas = document.getElementById('webgl-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false, // Inline Hero FXAA + HalfFloat pipeline delivers crisp anti-aliasing with DepthTexture
  powerPreference: 'high-performance',
  preserveDrawingBuffer: isCaptureMode,
});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;

function getViewportSize() {
  const vv = window.visualViewport;
  const w = Math.max(1, Math.round(vv ? vv.width : window.innerWidth || 1280));
  const h = Math.max(1, Math.round(vv ? vv.height : window.innerHeight || 720));
  return { w, h };
}

const initSize = getViewportSize();
// Full crisp DPR on all screens (capped cleanly at 2.0 so 3x Retina mobile GPUs don't waste 2.25x redundant fillrate while looking 100% razor-sharp!)
let currentDpr = isCaptureMode ? 1 : Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(currentDpr);
renderer.setSize(initSize.w, initSize.h, false);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(24.5, initSize.w / initSize.h, 0.15, 95);
camera.position.set(0.0, 1.05, 6.25);

const { sunDirection } = setupLighting(scene, renderer);
const post = createPostPipeline(
  renderer,
  Math.round(initSize.w * currentDpr),
  Math.round(initSize.h * currentDpr)
);

// =========================================================================
// 2. HERO CHARACTER, VINTAGE BICYCLE & SEAMLESS MEDITERRANEAN STREET
// =========================================================================
const street = createStreet();
scene.add(street.root);

const bicycle = createBicycle();
scene.add(bicycle.root);

const pelican = createPelican(sunDirection);
scene.add(pelican.root);

// =========================================================================
// 3. CAMERA PRESETS + PORTRAIT-AWARE CINEMA FOV + MULTI-TOUCH FREE ORBIT
// =========================================================================
const CAMERA_PRESETS = {
  side: {
    pos: new THREE.Vector3(0.0, 1.05, 6.25),
    target: new THREE.Vector3(-0.08, 0.90, 0.0),
    fov: 24.5,
    breathAmp: 1.0,
    dof: { enabled: true, deadZone: 0.68, bgRange: 3.6, fgRange: 2.0, maxBlurBg: 11.0, maxBlurFg: 58.0 },
  },
  hero34: {
    pos: new THREE.Vector3(-3.35, 1.32, 4.45),
    target: new THREE.Vector3(-0.08, 0.92, 0.0),
    fov: 27.0,
    breathAmp: 0.65,
    dof: { enabled: true, deadZone: 0.85, bgRange: 4.5, fgRange: 2.2, maxBlurBg: 7.5, maxBlurFg: 16.0 },
  },
  closeup: {
    pos: new THREE.Vector3(-1.85, 1.44, 2.25),
    target: new THREE.Vector3(-0.06, 1.24, 0.04),
    fov: 26.5,
    breathAmp: 0.25,
    dof: { enabled: true, deadZone: 0.55, bgRange: 3.2, fgRange: 1.4, maxBlurBg: 8.5, maxBlurFg: 12.0 },
  },
  lowpedals: {
    pos: new THREE.Vector3(0.08, 0.44, 2.55),
    target: new THREE.Vector3(0.08, 0.36, 0.02),
    fov: 25.0,
    breathAmp: 0.0,
    dof: { enabled: true, deadZone: 0.55, bgRange: 3.0, fgRange: 1.2, maxBlurBg: 7.0, maxBlurFg: 10.0 },
  },
  wide: {
    pos: new THREE.Vector3(0.35, 1.52, 8.2),
    target: new THREE.Vector3(-0.05, 1.42, -0.8),
    fov: 32.0,
    breathAmp: 0.0,
    dof: { enabled: true, deadZone: 1.15, bgRange: 5.5, fgRange: 2.8, maxBlurBg: 6.5, maxBlurFg: 18.0 },
  },
};

const ORBIT_DOF = { enabled: true, deadZone: 1.0, bgRange: 4.5, fgRange: 2.0, maxBlurBg: 6.0, maxBlurFg: 12.0 };

// Preserves heroic horizontal framing on vertical mobile screens so bicycle wheels & bill are never cropped!
function computeResponsiveFov(baseFovDeg) {
  const aspect = camera.aspect || 1.777;
  if (aspect >= 1.15) return baseFovDeg;
  const targetMinAspect = 1.15;
  const baseRad = THREE.MathUtils.degToRad(baseFovDeg);
  const horizTan = Math.tan(baseRad * 0.5) * targetMinAspect;
  const vertRad = 2.0 * Math.atan(horizTan / Math.max(aspect, 0.48));
  return clamp(THREE.MathUtils.radToDeg(vertRad), baseFovDeg, 54.0);
}

let activePreset = urlParams.get('preset') || 'side';
if (!CAMERA_PRESETS[activePreset] && activePreset !== 'orbit') activePreset = 'side';
let customCameraOverride = null;

// Smooth Damped Spherical Free Orbit + Multi-Touch Pinch-to-Zoom State
const orbit = {
  target: new THREE.Vector3(-0.06, 0.90, 0.0),
  theta: 0.0,
  phi: 1.52,
  radius: 5.6,
  goalTheta: 0.0,
  goalPhi: 1.52,
  goalRadius: 5.6,
};

const _orbitOffset = new THREE.Vector3();
function syncOrbitFromCurrentCamera() {
  _orbitOffset.copy(camera.position).sub(orbit.target);
  const r = Math.max(1.2, _orbitOffset.length());
  orbit.radius = orbit.goalRadius = r;
  orbit.theta = orbit.goalTheta = Math.atan2(_orbitOffset.x, _orbitOffset.z);
  orbit.phi = orbit.goalPhi = clamp(Math.acos(clamp(_orbitOffset.y / r, -0.99, 0.99)), 0.18, Math.PI * 0.485);
}

// Multi-Touch & Pointer Orbit Controls (1-finger drag + 2-finger pinch-zoom + double-tap Play/Pause)
const activePointers = new Map();
let lastPinchDist = 0;
let lastTapTime = 0;
let dragMoved = false;

function getPinchDistance() {
  const pts = Array.from(activePointers.values());
  if (pts.length < 2) return 0;
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
}

canvas.addEventListener('pointerdown', (e) => {
  if (isExporting || isCaptureMode) return;
  soundscape.start();
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  dragMoved = false;
  try { canvas.setPointerCapture(e.pointerId); } catch {}

  if (activePointers.size === 2) {
    lastPinchDist = getPinchDistance();
    if (activePreset !== 'orbit') setPreset('orbit');
  } else if (activePointers.size === 1 && !isPlaying && activePreset !== 'orbit') {
    setPreset('orbit');
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!activePointers.has(e.pointerId) || isExporting) return;
  const prev = activePointers.get(e.pointerId);
  const dx = e.clientX - prev.x;
  const dy = e.clientY - prev.y;
  prev.x = e.clientX;
  prev.y = e.clientY;

  if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;

  if (activePointers.size === 2) {
    const dist = getPinchDistance();
    if (lastPinchDist > 0 && dist > 0) {
      const scale = lastPinchDist / dist;
      orbit.goalRadius = clamp(orbit.goalRadius * scale, 1.65, 11.5);
    }
    lastPinchDist = dist;
    return;
  }

  if (activePointers.size === 1) {
    if (activePreset !== 'orbit' && dragMoved) {
      // Smoothly allow direct drag-to-orbit on touch or mouse when paused or in orbit mode
      if (!isPlaying) setPreset('orbit');
      else return;
    }
    if (activePreset === 'orbit') {
      orbit.goalTheta -= dx * 0.0065;
      orbit.goalPhi = clamp(orbit.goalPhi - dy * 0.0055, 0.18, Math.PI * 0.485);
    }
  }
});

function handlePointerEnd(e) {
  const wasSingle = activePointers.size === 1;
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) lastPinchDist = 0;
  try { canvas.releasePointerCapture(e.pointerId); } catch {}

  // Quick double-tap on canvas toggles Play/Pause effortlessly on mobile & desktop!
  if (wasSingle && !dragMoved && !isExporting && !isCaptureMode) {
    const now = performance.now();
    if (now - lastTapTime < 310) {
      togglePlay();
      lastTapTime = 0;
    } else {
      lastTapTime = now;
    }
    bumpUIActivity();
  }
}
canvas.addEventListener('pointerup', handlePointerEnd);
canvas.addEventListener('pointercancel', handlePointerEnd);

canvas.addEventListener('wheel', (e) => {
  if (isExporting || isCaptureMode) return;
  if (activePreset !== 'orbit') {
    if (!isPlaying) setPreset('orbit');
    else return;
  }
  e.preventDefault();
  orbit.goalRadius = clamp(orbit.goalRadius * (1 + e.deltaY * 0.0011), 1.65, 11.5);
}, { passive: false });

// =========================================================================
// 4. DETERMINISTIC STATE EVALUATION (EXACT 12.0s SEAMLESS LOOP, ZERO GC!)
// =========================================================================
const _pedalL = new THREE.Vector3();
const _pedalR = new THREE.Vector3();
const _gripL = new THREE.Vector3();
const _gripR = new THREE.Vector3();
const _focusPoint = new THREE.Vector3(-0.04, 0.96, 0.0);
const _pelicanArgs = {
  t: 0,
  timePhase: 0,
  crankAngle: 0,
  frameRoll: 0,
  cobbleBounce: 0,
  pedalTargetL: _pedalL,
  pedalTargetR: _pedalR,
  gripTargetL: _gripL,
  gripTargetR: _gripR,
};

function applySceneAt(tRaw) {
  const t = ((tRaw % LOOP_DURATION) + LOOP_DURATION) % LOOP_DURATION;
  const u = t / LOOP_DURATION;
  const timePhase = u * Math.PI * 2.0;

  const distance = u * LOOP_DIST;
  const wheelAngle = distance / WHEEL_RADIUS;
  const crankAngle = u * CRANK_REVS_PER_LOOP * Math.PI * 2.0;

  const steerAngle = Math.sin(crankAngle + 0.35) * 0.032 + Math.sin(timePhase * 2.0) * 0.012;
  const frameRoll = Math.sin(crankAngle - 0.15) * 0.022;
  const cobbleBounce = Math.sin(timePhase * 24.0) * 0.0022 + Math.sin(timePhase * 36.0 + 1.1) * 0.0012;

  street.update(distance);
  bicycle.update(wheelAngle, crankAngle, steerAngle, frameRoll, cobbleBounce, timePhase);

  bicycle.getPedalTargets(_pedalL, _pedalR);
  bicycle.getGripTargets(_gripL, _gripR);
  _pelicanArgs.t = t;
  _pelicanArgs.timePhase = timePhase;
  _pelicanArgs.crankAngle = crankAngle;
  _pelicanArgs.frameRoll = frameRoll;
  _pelicanArgs.cobbleBounce = cobbleBounce;
  pelican.update(_pelicanArgs);

  if (customCameraOverride) {
    camera.position.copy(customCameraOverride.pos);
    if (camera.fov !== customCameraOverride.fov) {
      camera.fov = customCameraOverride.fov;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(customCameraOverride.target);
    return customCameraOverride.focusDist ?? camera.position.distanceTo(customCameraOverride.target);
  }

  if (activePreset === 'orbit') {
    orbit.theta = lerp(orbit.theta, orbit.goalTheta, 0.14);
    orbit.phi = lerp(orbit.phi, orbit.goalPhi, 0.14);
    orbit.radius = lerp(orbit.radius, orbit.goalRadius, 0.14);

    camera.position.set(
      orbit.target.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
      orbit.target.y + orbit.radius * Math.cos(orbit.phi),
      orbit.target.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta)
    );
    const desiredFov = computeResponsiveFov(30.0);
    if (Math.abs(camera.fov - desiredFov) > 0.05) {
      camera.fov = desiredFov;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(orbit.target);
    return camera.position.distanceTo(_focusPoint);
  }

  const preset = CAMERA_PRESETS[activePreset] || CAMERA_PRESETS.side;
  const desiredFov = isCaptureMode ? preset.fov : computeResponsiveFov(preset.fov);
  if (Math.abs(camera.fov - desiredFov) > 0.01) {
    camera.fov = desiredFov;
    camera.updateProjectionMatrix();
  }

  const b = preset.breathAmp;
  const breathX = b * (Math.sin(timePhase * 1.0) * 0.055 + Math.sin(timePhase * 2.0 + 0.6) * 0.018);
  const breathY = b * (Math.sin(timePhase * 2.0 + 0.3) * 0.022 + Math.cos(timePhase * 1.0) * 0.012);
  const breathZ = b * (Math.sin(timePhase * 1.0 + 1.2) * 0.045);

  camera.position.set(preset.pos.x + breathX, preset.pos.y + breathY, preset.pos.z + breathZ);
  camera.lookAt(preset.target.x + breathX * 0.35, preset.target.y + breathY * 0.45, preset.target.z);

  return camera.position.distanceTo(activePreset === 'lowpedals' ? preset.target : _focusPoint);
}

function getActiveDofConfig() {
  if (customCameraOverride && customCameraOverride.dof) return customCameraOverride.dof;
  if (activePreset === 'orbit') return ORBIT_DOF;
  return (CAMERA_PRESETS[activePreset] || CAMERA_PRESETS.side).dof;
}

function renderExactAt(t, opts = {}) {
  const dofCfg = getActiveDofConfig();
  if (opts.subframes && opts.subframes >= 2) {
    post.renderShutterBlended(scene, camera, applySceneAt, t, opts.dt || (1 / 60), dofCfg);
  } else {
    const focusDist = applySceneAt(t);
    post.render(scene, camera, focusDist, t, dofCfg);
  }
}

// =========================================================================
// 5. DETERMINISTIC CAPTURE HOOKS
// =========================================================================
window.renderAt = (t, opts = {}) => renderExactAt(t, opts);

window.setCameraPreset = (name) => {
  customCameraOverride = null;
  if (name === 'orbit' || CAMERA_PRESETS[name]) activePreset = name;
};

window.setCustomCamera = (pos, target, fov = 26, focusDist = null, dof = null) => {
  customCameraOverride = {
    pos: new THREE.Vector3(...pos),
    target: new THREE.Vector3(...target),
    fov,
    focusDist,
    dof,
  };
};

// =========================================================================
// 6. EFFORTLESS IMMERSIVE FULLSCREEN, GLASS UI, AUDIO & 60FPS EXPORT
// =========================================================================
const uiRoot = document.getElementById('ui-root');
const controlBar = document.getElementById('control-bar');
const btnPlay = document.getElementById('btn-play');
const btnMute = document.getElementById('btn-mute');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnExport = document.getElementById('btn-export');
const immersivePrompt = document.getElementById('immersive-prompt');
const presetButtons = Array.from(document.querySelectorAll('[data-preset]'));
const exportOverlay = document.getElementById('export-overlay');
const exportFill = document.getElementById('export-fill');
const exportLabel = document.getElementById('export-label');
const fadeCurtain = document.getElementById('fade-curtain');

const soundscape = createSoundscape();
let isPlaying = !isCaptureMode;
let isExporting = false;
let isTabHidden = false;
let immersiveActive = false;
let simTime = parseFloat(urlParams.get('t') || '0') || 0;
let lastFrameMs = performance.now();
let hideTimer = null;

if (isCaptureMode) {
  if (uiRoot) uiRoot.style.display = 'none';
  if (fadeCurtain) fadeCurtain.style.display = 'none';
}

function isNativeFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

async function enterImmersiveFullscreen() {
  soundscape.start();
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' });
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    }
  } catch {
    // iOS Safari fallback: smoothly activates edge-to-edge zero-chrome immersive mode!
  }
  immersiveActive = true;
  document.body.classList.add('immersive-mode');
  if (immersivePrompt) immersivePrompt.classList.add('dismissed');
  updateFullscreenButtonUI();
  bumpUIActivity();
  setTimeout(handleResize, 120);
}

async function exitImmersiveFullscreen() {
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  } catch {}
  immersiveActive = false;
  document.body.classList.remove('immersive-mode');
  updateFullscreenButtonUI();
  bumpUIActivity();
  setTimeout(handleResize, 120);
}

function toggleFullscreen() {
  if (isNativeFullscreen() || immersiveActive) {
    exitImmersiveFullscreen();
  } else {
    enterImmersiveFullscreen();
  }
}

function updateFullscreenButtonUI() {
  if (!btnFullscreen) return;
  const active = isNativeFullscreen() || immersiveActive;
  btnFullscreen.innerHTML = active
    ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>'
    : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
  btnFullscreen.title = active ? 'Exit Fullscreen (F)' : 'Immersive Fullscreen (F)';
}

function updatePlayButtonUI() {
  if (!btnPlay) return;
  btnPlay.innerHTML = isPlaying
    ? '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2.5" width="3.5" height="11" rx="1"/><rect x="9.5" y="2.5" width="3.5" height="11" rx="1"/></svg><span class="btn-text">Pause</span>'
    : '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5l9.5 5.5L4 13.5V2.5z"/></svg><span class="btn-text">Play</span>';
}

function updateMuteButtonUI() {
  if (!btnMute) return;
  btnMute.innerHTML = soundscape.isMuted
    ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>'
    : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
  btnMute.title = soundscape.isMuted ? 'Unmute ambient audio (M)' : 'Mute ambient audio (M)';
}

function setPreset(name) {
  customCameraOverride = null;
  if (name === 'orbit' && activePreset !== 'orbit') {
    syncOrbitFromCurrentCamera();
  }
  activePreset = name;
  presetButtons.forEach((b) => {
    b.classList.toggle('active', b.dataset.preset === name);
  });
}

function togglePlay() {
  soundscape.start();
  isPlaying = !isPlaying;
  if (!isPlaying) setPreset('orbit');
  updatePlayButtonUI();
}

function bumpUIActivity() {
  if (isCaptureMode || isExporting || !controlBar) return;
  controlBar.classList.remove('idle-hidden');
  document.body.classList.remove('ui-idle');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (isPlaying && !isExporting) {
      controlBar.classList.add('idle-hidden');
      document.body.classList.add('ui-idle');
    }
  }, 5500);
}

if (!isCaptureMode) {
  updatePlayButtonUI();
  updateMuteButtonUI();
  updateFullscreenButtonUI();
  setPreset(activePreset);
  bumpUIActivity();

  window.addEventListener('pointermove', bumpUIActivity, { passive: true });
  window.addEventListener('pointerdown', () => {
    soundscape.start();
    bumpUIActivity();
  }, { passive: true });

  // Effortless 1-tap immersive fullscreen entry pill!
  immersivePrompt?.addEventListener('click', (e) => {
    e.stopPropagation();
    enterImmersiveFullscreen();
  });

  document.addEventListener('fullscreenchange', () => {
    if (!isNativeFullscreen()) {
      immersiveActive = false;
      document.body.classList.remove('immersive-mode');
    }
    updateFullscreenButtonUI();
    handleResize();
  });
  document.addEventListener('webkitfullscreenchange', () => {
    if (!isNativeFullscreen()) {
      immersiveActive = false;
      document.body.classList.remove('immersive-mode');
    }
    updateFullscreenButtonUI();
    handleResize();
  });

  // Power-friendly tab visibility auto-pause (keeps mobile batteries cool!)
  document.addEventListener('visibilitychange', () => {
    isTabHidden = document.hidden;
    if (!isTabHidden) lastFrameMs = performance.now();
    soundscape.update(isPlaying && !isTabHidden);
  });

  btnPlay?.addEventListener('click', togglePlay);
  btnFullscreen?.addEventListener('click', toggleFullscreen);
  btnMute?.addEventListener('click', () => {
    soundscape.start();
    soundscape.setMuted(!soundscape.isMuted);
    updateMuteButtonUI();
  });

  presetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      soundscape.start();
      setPreset(btn.dataset.preset);
      bumpUIActivity();
    });
  });

  window.addEventListener('keydown', (e) => {
    if (isExporting) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); bumpUIActivity(); }
    else if (e.key === '1') { setPreset('side'); bumpUIActivity(); }
    else if (e.key === '2') { setPreset('hero34'); bumpUIActivity(); }
    else if (e.key === '3') { setPreset('closeup'); bumpUIActivity(); }
    else if (e.key === '4') { setPreset('orbit'); bumpUIActivity(); }
    else if (e.key === 'f' || e.key === 'F') { toggleFullscreen(); }
    else if (e.key === 'm' || e.key === 'M') {
      soundscape.start();
      soundscape.setMuted(!soundscape.isMuted);
      updateMuteButtonUI();
    }
  });

  btnExport?.addEventListener('click', async () => {
    if (isExporting) return;
    isExporting = true;
    const prevPlaying = isPlaying;
    const prevPreset = activePreset;
    isPlaying = false;

    if (uiRoot) uiRoot.style.display = 'none';
    if (exportOverlay) exportOverlay.classList.add('visible');

    try {
      await exportSmooth60fpsVideo({
        canvas,
        durationSec: LOOP_DURATION,
        fps: 60,
        width: 1920,
        height: 1080,
        beginExportResolution(w, h) {
          renderer.setPixelRatio(1);
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          post.resize(w, h);
        },
        renderFrameAt(t) {
          renderExactAt(t, { subframes: 1 });
        },
        onProgress(done, total) {
          const pct = Math.round((done / total) * 100);
          if (exportFill) exportFill.style.width = `${pct}%`;
          if (exportLabel) exportLabel.textContent = `Rendering 1080p 60fps · Frame ${done} / ${total} (${pct}%)`;
        },
        endExportResolution() {
          handleResize();
        },
      });
    } catch (err) {
      console.error('Export failed:', err);
      alert('Video export encountered an error: ' + err.message);
    } finally {
      isExporting = false;
      isPlaying = prevPlaying;
      activePreset = prevPreset;
      if (exportOverlay) exportOverlay.classList.remove('visible');
      if (uiRoot) uiRoot.style.display = '';
      updatePlayButtonUI();
      bumpUIActivity();
    }
  });
}

// =========================================================================
// 7. RESPONSIVE RESIZE (DESKTOP + MOBILE ORIENTATION + VISUAL VIEWPORT)
// =========================================================================
function handleResize() {
  if (isExporting) return;
  const { w, h } = getViewportSize();
  currentDpr = isCaptureMode ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(currentDpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  post.resize(Math.round(w * currentDpr), Math.round(h * currentDpr));
  if (isCaptureMode) renderExactAt(simTime);
}
window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', () => setTimeout(handleResize, 120));
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', handleResize);
}

// Pre-compile all WebGL shaders before first frame for zero-hitch 60fps startup on every device!
applySceneAt(simTime);
renderer.compile(scene, camera);

if (isCaptureMode) {
  renderExactAt(simTime);
  window.__PELICAN_READY__ = true;
} else {
  window.__PELICAN_READY__ = true;
  let firstFrameDone = false;
  function animate(nowMs) {
    requestAnimationFrame(animate);
    if (isExporting || isTabHidden) return;
    const dt = Math.min(0.05, (nowMs - lastFrameMs) * 0.001);
    lastFrameMs = nowMs;
    if (isPlaying) {
      simTime = (simTime + dt) % LOOP_DURATION;
    }
    soundscape.update(isPlaying);
    renderExactAt(simTime);
    if (!firstFrameDone) {
      firstFrameDone = true;
      if (fadeCurtain) fadeCurtain.classList.add('ready');
      bumpUIActivity();
    }
  }
  requestAnimationFrame(animate);
}
