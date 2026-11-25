import * as THREE from 'three';
import { createPRNG, clamp, lerp, smoothstep, makeTileableNoise } from './utils.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Converts a normalized [0..1] Float32Array heightmap (w x h, tileable) into a THREE.CanvasTexture normal map.
 */
function heightToNormalTexture(height, w, h, strength = 2.8) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const data = img.data;

  const idx = (x, y) => ((y + h) % h) * w + ((x + w) % w);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sobel 3x3 filter for smooth, artifact-free normals
      const tl = height[idx(x - 1, y - 1)];
      const t  = height[idx(x,     y - 1)];
      const tr = height[idx(x + 1, y - 1)];
      const l  = height[idx(x - 1, y)];
      const r  = height[idx(x + 1, y)];
      const bl = height[idx(x - 1, y + 1)];
      const b  = height[idx(x,     y + 1)];
      const br = height[idx(x + 1, y + 1)];

      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const dz = 1.0;
      const invLen = 1.0 / Math.sqrt(dx * dx + dy * dy + dz * dz);

      const p = (y * w + x) * 4;
      data[p]     = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      data[p + 1] = Math.round((dy * invLen * 0.5 + 0.5) * 255);
      data[p + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function arrayToGrayTexture(arr, w, h) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const data = img.data;
  for (let i = 0; i < w * h; i++) {
    const v = clamp(Math.round(arr[i] * 255), 0, 255);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function finalizeColorTex(canvas, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

/**
 * 1. European Fan-Pattern Cobblestone (Pavé) — 1024x1024 seamlessly tileable Albedo + Normal + Roughness
 * Uses authentic overlapping peacock-tail / fan arches (éventail) with warm Provençal granite tones.
 */
export function createCobblestoneTextures() {
  const S = 1024;
  const cAlb = makeCanvas(S, S);
  const ctxAlb = cAlb.getContext('2d');
  const imgAlb = ctxAlb.createImageData(S, S);
  const alb = imgAlb.data;

  const height = new Float32Array(S * S);
  const rough = new Float32Array(S * S);
  const noise = makeTileableNoise(701);
  const rand = createPRNG(702);

  // Precompute warm Mediterranean stone palette (limestone, rose porphyry, warm grey granite, ochre)
  const palette = [
    [186, 173, 154],
    [168, 155, 138],
    [195, 178, 152],
    [156, 147, 136],
    [179, 157, 139],
    [144, 137, 129],
    [203, 187, 162],
    [164, 146, 132],
    [174, 166, 151],
  ];

  // Fill background with warm dusty Provençal sandy mortar (NOT dark charcoal stripes!)
  const mortarR = 114, mortarG = 104, mortarB = 92;
  for (let i = 0; i < S * S; i++) {
    const x = i % S;
    const y = (i - x) / S;
    const n = noise.fbm(x / S, y / S, 16, 16, 3);
    const mv = 0.86 + n * 0.28;
    alb[i * 4]     = clamp(Math.round(mortarR * mv), 0, 255);
    alb[i * 4 + 1] = clamp(Math.round(mortarG * mv), 0, 255);
    alb[i * 4 + 2] = clamp(Math.round(mortarB * mv), 0, 255);
    alb[i * 4 + 3] = 255;
    height[i] = 0.08 + n * 0.06;
    rough[i] = 0.94;
  }

  // Dense wall-to-wall interlocking European fan pavé (éventail) — ZERO bare gaps between rows!
  // 2 fan columns x 3 staggered fan rows per 1024 tile -> overlaps tightly everywhere!
  const fanCols = 2;
  const fanRows = 3;
  const colStep = S / fanCols;
  const rowStep = S / fanRows;
  const stones = [];

  for (let fr = -1; fr <= fanRows + 2; fr++) {
    for (let fc = -1; fc <= fanCols + 1; fc++) {
      const ox = (fc + (fr & 1 ? 0.5 : 0.0)) * colStep;
      const oy = fr * rowStep;

      // 8 tightly packed concentric fan rings radiating outward until interlocking cleanly with next fan!
      const rings = 8;
      const maxR = colStep * 0.78;
      const ringThickness = maxR / rings;

      for (let rIdx = 1; rIdx <= rings; rIdx++) {
        const radius = rIdx * ringThickness;
        const halfSpan = rIdx <= 2 ? Math.PI * 0.49 : Math.PI * 0.43;
        const arcLen = 2 * halfSpan * radius;
        const stoneW = 36 + (rIdx % 2) * 4;
        const count = Math.max(3, Math.round(arcLen / stoneW));
        const dAng = (2 * halfSpan) / count;

        for (let k = 0; k < count; k++) {
          const ang = -Math.PI * 0.5 - halfSpan + (k + 0.5) * dAng + (rand() - 0.5) * 0.014;
          const cx = ox + Math.cos(ang) * radius;
          const cy = oy + Math.sin(ang) * radius;

          if (cx < -70 || cx > S + 70 || cy < -70 || cy > S + 70) continue;

          const col = palette[Math.floor(rand() * palette.length)];
          const shade = 0.86 + rand() * 0.26;
          // Higher rings render cleanly over lower fan tails so arches interlock authentically!
          const stoneHeight = 0.70 + rand() * 0.25 + (fr * 0.002);
          const stoneRough = 0.40 + rand() * 0.18;

          stones.push({
            cx,
            cy,
            ang: ang + Math.PI * 0.5,
            halfW: (arcLen / count) * 0.455,
            halfH: ringThickness * 0.455,
            r: clamp(col[0] * shade, 0, 255),
            g: clamp(col[1] * shade, 0, 255),
            b: clamp(col[2] * shade, 0, 255),
            h: stoneHeight,
            rough: stoneRough,
            tiltX: (rand() - 0.5) * 0.10,
            tiltY: (rand() - 0.5) * 0.10,
            seed: rand() * 10,
          });
        }
      }
    }
  }

  // Rasterize each cobble with tileable wrap-around and smooth rounded pillow bevel
  for (let s = 0; s < stones.length; s++) {
    const st = stones[s];
    const cos = Math.cos(-st.ang);
    const sin = Math.sin(-st.ang);
    const pad = Math.ceil(Math.max(st.halfW, st.halfH) * 1.45) + 4;
    const x0 = Math.floor(st.cx - pad);
    const x1 = Math.ceil(st.cx + pad);
    const y0 = Math.floor(st.cy - pad);
    const y1 = Math.ceil(st.cy + pad);

    for (let py = y0; py <= y1; py++) {
      const wy = ((py % S) + S) % S;
      const dy = py - st.cy;
      for (let px = x0; px <= x1; px++) {
        const wx = ((px % S) + S) % S;
        const dx = px - st.cx;

        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;

        const nx = Math.abs(lx) / st.halfW;
        const ny = Math.abs(ly) / st.halfH;
        const d = Math.pow(Math.pow(nx, 3.6) + Math.pow(ny, 3.6), 1 / 3.6);

        if (d < 1.0) {
          const micro = noise.noise((wx / S) * 32 + st.seed, (wy / S) * 32, 32, 32);
          const edgeD = d + (micro - 0.5) * 0.07;
          if (edgeD >= 1.0) continue;

          const bevel = smoothstep(1.0, 0.72, edgeD);
          const dome = 1.0 - 0.15 * (nx * nx + ny * ny);
          const grain = (noise.fbm(wx / S, wy / S, 24, 24, 3) - 0.5) * 0.14;
          const hVal = clamp(st.h * bevel * dome + (lx / st.halfW) * st.tiltX + (ly / st.halfH) * st.tiltY + grain, 0.14, 1.0);

          const pIdx = wy * S + wx;
          if (hVal > height[pIdx] * 0.92) {
            height[pIdx] = hVal;
            const edgeAO = 0.74 + 0.26 * smoothstep(1.0, 0.65, edgeD);
            const speckle = 0.90 + grain * 0.9;
            const mult = edgeAO * speckle;
            alb[pIdx * 4]     = clamp(Math.round(st.r * mult), 0, 255);
            alb[pIdx * 4 + 1] = clamp(Math.round(st.g * mult), 0, 255);
            alb[pIdx * 4 + 2] = clamp(Math.round(st.b * mult), 0, 255);
            rough[pIdx] = clamp(st.rough + (1 - bevel) * 0.35 - grain * 0.2, 0.30, 0.92);
          }
        }
      }
    }
  }

  ctxAlb.putImageData(imgAlb, 0, 0);
  const map = finalizeColorTex(cAlb);
  const normalMap = heightToNormalTexture(height, S, S, 4.6);
  const roughnessMap = arrayToGrayTexture(rough, S, S);

  return { map, normalMap, roughnessMap };
}

/**
 * 2. Pale Limestone Flagstone Sidewalk — 512x512 seamless (warm sunlit buff limestone)
 */
export function createFlagstoneTextures() {
  const S = 512;
  const cAlb = makeCanvas(S, S);
  const ctx = cAlb.getContext('2d');
  const img = ctx.createImageData(S, S);
  const alb = img.data;
  const height = new Float32Array(S * S);
  const rough = new Float32Array(S * S);
  const noise = makeTileableNoise(811);
  const rand = createPRNG(812);

  // 4 rows x 3 cols running-bond flagstones
  const rows = 4;
  const cols = 3;
  const cellTint = [];
  for (let i = 0; i < rows * cols; i++) {
    cellTint.push([
      196 + (rand() - 0.5) * 20,
      182 + (rand() - 0.5) * 18,
      158 + (rand() - 0.5) * 18,
      0.74 + rand() * 0.14,
    ]);
  }

  for (let y = 0; y < S; y++) {
    const v = y / S;
    const row = Math.floor(v * rows);
    const rv = (v * rows) - row;
    const shift = (row & 1) ? 0.5 : 0.0;

    for (let x = 0; x < S; x++) {
      const u = x / S;
      const su = (u * cols + shift) % cols;
      const col = Math.floor(su);
      const cu = su - col;

      const idx = y * S + x;
      const n = noise.fbm(u, v, 8, 8, 4);
      const fine = noise.fbm(u, v, 24, 24, 3);

      const distEdge = Math.min(cu, 1 - cu, rv * (cols / rows), (1 - rv) * (cols / rows));
      const joint = smoothstep(0.018, 0.045, distEdge + (fine - 0.5) * 0.012);

      const t = cellTint[(row % rows) * cols + (col % cols)];
      const grain = 0.88 + n * 0.18 + (fine - 0.5) * 0.08;
      const r = lerp(115, t[0] * grain, joint);
      const g = lerp(108, t[1] * grain, joint);
      const b = lerp(96,  t[2] * grain, joint);

      alb[idx * 4] = clamp(Math.round(r), 0, 255);
      alb[idx * 4 + 1] = clamp(Math.round(g), 0, 255);
      alb[idx * 4 + 2] = clamp(Math.round(b), 0, 255);
      alb[idx * 4 + 3] = 255;

      height[idx] = lerp(0.15, 0.72 + (fine - 0.5) * 0.18, joint);
      rough[idx] = lerp(0.95, t[3] + (0.5 - n) * 0.15, joint);
    }
  }

  ctx.putImageData(img, 0, 0);
  return {
    map: finalizeColorTex(cAlb),
    normalMap: heightToNormalTexture(height, S, S, 2.2),
    roughnessMap: arrayToGrayTexture(rough, S, S),
  };
}

/**
 * 3. Mediterranean Stucco Plaster (with trowel relief + subtle bottom plinth AO weathering)
 */
export function createStuccoTextures(baseHex = 0xeee0c8, seed = 901) {
  const S = 512;
  const cAlb = makeCanvas(S, S);
  const ctx = cAlb.getContext('2d');
  const img = ctx.createImageData(S, S);
  const alb = img.data;
  const height = new Float32Array(S * S);
  const rough = new Float32Array(S * S);
  const noise = makeTileableNoise(seed);

  const base = new THREE.Color(baseHex);
  const br = base.r * 255;
  const bg = base.g * 255;
  const bb = base.b * 255;

  for (let y = 0; y < S; y++) {
    const v = y / S; // 0 = top, 1 = bottom in canvas coordinates (flipY=true -> bottom is y=S-1!)
    // Ground moisture / plinth ambient occlusion near bottom of wall
    const bottomDist = 1.0 - v;
    const plinthAO = lerp(0.76, 1.0, smoothstep(0.0, 0.18, bottomDist));
    // Subtle eave shadow near top
    const topAO = lerp(0.88, 1.0, smoothstep(0.0, 0.10, v));

    for (let x = 0; x < S; x++) {
      const u = x / S;
      const idx = y * S + x;
      const broad = noise.fbm(u, v, 4, 4, 3);
      const trowel = noise.fbm(u, v, 12, 8, 4);
      const grit = noise.fbm(u, v, 32, 32, 2);

      // Subtle vertical rain patina streaks
      const streak = noise.fbm(u * 2.5, v * 0.4, 8, 2, 3);
      const patina = 0.92 + broad * 0.13 + (trowel - 0.5) * 0.08 - (1 - streak) * 0.04;
      const mult = patina * plinthAO * topAO;

      // Slight warm ochre shift in weathered spots
      alb[idx * 4]     = clamp(Math.round(br * mult), 0, 255);
      alb[idx * 4 + 1] = clamp(Math.round(bg * mult * (0.985 + broad * 0.02)), 0, 255);
      alb[idx * 4 + 2] = clamp(Math.round(bb * mult * (0.96 + broad * 0.04)), 0, 255);
      alb[idx * 4 + 3] = 255;

      height[idx] = clamp(0.5 + (trowel - 0.5) * 0.45 + (grit - 0.5) * 0.28, 0, 1);
      rough[idx] = clamp(0.82 + (grit - 0.5) * 0.16, 0.65, 0.98);
    }
  }

  ctx.putImageData(img, 0, 0);
  const map = finalizeColorTex(cAlb);
  map.wrapT = THREE.ClampToEdgeWrapping; // Preserve vertical plinth AO gradient
  const normalMap = heightToNormalTexture(height, S, S, 1.8);
  const roughnessMap = arrayToGrayTexture(rough, S, S);
  return { map, normalMap, roughnessMap };
}

/**
 * 4. High-Res Woven Wicker Basket Texture — 512x512 Albedo + Normal + Roughness
 */
export function createWickerTextures() {
  const S = 512;
  const cAlb = makeCanvas(S, S);
  const ctx = cAlb.getContext('2d');
  const img = ctx.createImageData(S, S);
  const alb = img.data;
  const height = new Float32Array(S * S);
  const rough = new Float32Array(S * S);
  const noise = makeTileableNoise(303);

  const hWeaves = 16; // horizontal rattan strands
  const vWeaves = 12; // vertical ribs

  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const idx = y * S + x;

      const fx = u * vWeaves;
      const fy = v * hWeaves;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix; // 0..1 across vertical rib
      const ty = fy - iy; // 0..1 across horizontal cane

      const parity = (ix + iy) & 1;

      // Cross-sectional roundness of cane strands
      const hRound = Math.sin(clamp((ty - 0.06) / 0.88, 0, 1) * Math.PI);
      const vRound = Math.sin(clamp((tx - 0.10) / 0.80, 0, 1) * Math.PI);

      // Wave height of over-under interlace
      const hWave = 0.5 + 0.42 * Math.sin((fx + (iy & 1 ? 0.5 : 0.0)) * Math.PI);
      const vWave = 0.5 + 0.42 * Math.sin((fy + (ix & 1 ? 0.0 : 0.5)) * Math.PI);

      const hProfile = hRound * (0.35 + 0.65 * hWave);
      const vProfile = vRound * (0.35 + 0.65 * vWave);

      const isH = hProfile >= vProfile;
      const strandH = Math.max(hProfile, vProfile);
      const gap = smoothstep(0.06, 0.26, strandH);

      // Fibrous reed micro-grain along the dominant strand direction
      const fiber = isH
        ? noise.fbm(u * 2, v * 14, 4, 24, 3)
        : noise.fbm(u * 14, v * 2, 24, 4, 3);
      const strandVar = noise.noise(isH ? iy * 1.7 : ix * 1.7, 0.5, 32, 32);

      // Warm honey-straw wicker palette
      const baseR = lerp(178, 212, strandVar) * (0.86 + fiber * 0.24);
      const baseG = lerp(132, 166, strandVar) * (0.86 + fiber * 0.24);
      const baseB = lerp(74,  102, strandVar) * (0.85 + fiber * 0.22);

      // Deep dark occlusion in interlace crevices
      const ao = lerp(0.24, 1.0, smoothstep(0.12, 0.85, strandH));
      alb[idx * 4]     = clamp(Math.round(baseR * ao * gap + 42 * (1 - gap)), 0, 255);
      alb[idx * 4 + 1] = clamp(Math.round(baseG * ao * gap + 28 * (1 - gap)), 0, 255);
      alb[idx * 4 + 2] = clamp(Math.round(baseB * ao * gap + 15 * (1 - gap)), 0, 255);
      alb[idx * 4 + 3] = 255;

      height[idx] = clamp(strandH * 0.88 + fiber * 0.12, 0, 1);
      rough[idx] = clamp(0.68 + (1 - strandH) * 0.28 + (fiber - 0.5) * 0.12, 0.52, 0.96);
    }
  }

  ctx.putImageData(img, 0, 0);
  return {
    map: finalizeColorTex(cAlb),
    normalMap: heightToNormalTexture(height, S, S, 3.8),
    roughnessMap: arrayToGrayTexture(rough, S, S),
  };
}

/**
 * 5. Stitched Vintage Brown Leather Saddle — 512x512
 */
export function createLeatherTextures() {
  const S = 512;
  const cAlb = makeCanvas(S, S);
  const ctx = cAlb.getContext('2d');
  const img = ctx.createImageData(S, S);
  const alb = img.data;
  const height = new Float32Array(S * S);
  const rough = new Float32Array(S * S);
  const noise = makeTileableNoise(404);

  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const idx = y * S + x;
      const patina = noise.fbm(u, v, 4, 4, 3);
      const pebble = noise.fbm(u, v, 28, 28, 3);
      const pore = noise.noise(u * 48, v * 48, 48, 48);

      // Rich saddle chestnut with warm worn highlights
      const shade = 0.78 + patina * 0.34 + (pebble - 0.5) * 0.14;
      alb[idx * 4]     = clamp(Math.round(126 * shade), 0, 255);
      alb[idx * 4 + 1] = clamp(Math.round(68 * shade), 0, 255);
      alb[idx * 4 + 2] = clamp(Math.round(36 * shade), 0, 255);
      alb[idx * 4 + 3] = 255;

      height[idx] = clamp(0.55 + (pebble - 0.5) * 0.32 - (pore < 0.2 ? 0.18 : 0), 0, 1);
      rough[idx] = clamp(0.46 + (1 - patina) * 0.22 + (0.5 - pebble) * 0.12, 0.30, 0.78);
    }
  }
  ctx.putImageData(img, 0, 0);
  return {
    map: finalizeColorTex(cAlb),
    normalMap: heightToNormalTexture(height, S, S, 1.8),
    roughnessMap: arrayToGrayTexture(rough, S, S),
  };
}

/**
 * 6. Crusty Golden-Brown French Baguette — 512x512 (caramelized crust + flour dusting)
 */
export function createBaguetteTextures() {
  const S = 512;
  const cAlb = makeCanvas(S, S);
  const ctx = cAlb.getContext('2d');
  const img = ctx.createImageData(S, S);
  const alb = img.data;
  const height = new Float32Array(S * S);
  const rough = new Float32Array(S * S);
  const noise = makeTileableNoise(505);

  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S; // along baguette length
      const idx = y * S + x;

      const bake = noise.fbm(u, v, 5, 5, 3);
      const blister = noise.fbm(u, v, 22, 22, 4);
      const flour = smoothstep(0.60, 0.85, noise.fbm(u + 0.3, v + 0.2, 6, 6, 4));

      // Diagonal bakery score slashes along top side (v around 0.25..0.75)
      const diag = (u * 5.0 + v * 0.9) % 1.0;
      const inSlashBand = smoothstep(0.18, 0.32, v) * smoothstep(0.82, 0.68, v);
      const slashMask = smoothstep(0.14, 0.04, Math.abs(diag - 0.5)) * inSlashBand;

      // Rich golden-amber crust transitioning to pale creamy-gold inside slashes + white flour dust
      let r = lerp(188, 224, bake) * (0.9 + blister * 0.18);
      let g = lerp(120, 158, bake) * (0.9 + blister * 0.16);
      let b = lerp(52,  78,  bake) * (0.88 + blister * 0.15);

      // Inside scored slash: lighter golden-cream bread crumb
      r = lerp(r, 238, slashMask * 0.85);
      g = lerp(g, 206, slashMask * 0.85);
      b = lerp(b, 148, slashMask * 0.85);

      // Subtle artisanal flour dusting
      const flourAmt = flour * 0.35 * (1 - slashMask * 0.6);
      r = lerp(r, 248, flourAmt);
      g = lerp(g, 243, flourAmt);
      b = lerp(b, 232, flourAmt);

      alb[idx * 4] = clamp(Math.round(r), 0, 255);
      alb[idx * 4 + 1] = clamp(Math.round(g), 0, 255);
      alb[idx * 4 + 2] = clamp(Math.round(b), 0, 255);
      alb[idx * 4 + 3] = 255;

      height[idx] = clamp(0.65 + (blister - 0.5) * 0.35 - slashMask * 0.42, 0, 1);
      rough[idx] = clamp(0.62 + flourAmt * 0.32 + slashMask * 0.22 + (0.5 - blister) * 0.12, 0.48, 0.96);
    }
  }
  ctx.putImageData(img, 0, 0);
  return {
    map: finalizeColorTex(cAlb),
    normalMap: heightToNormalTexture(height, S, S, 2.6),
    roughnessMap: arrayToGrayTexture(rough, S, S),
  };
}

/**
 * 7. Subtle Downy Feather Micro-Relief Normal & Roughness Map — 512x512
 */
export function createFeatherMicroTextures() {
  const S = 512;
  const height = new Float32Array(S * S);
  const rough = new Float32Array(S * S);
  const noise = makeTileableNoise(606);

  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const idx = y * S + x;

      // Overlapping soft scalloped plumage rows + fine barb streaks
      const row = v * 18;
      const col = u * 14 + (Math.floor(row) & 1 ? 0.5 : 0.0);
      const fu = col - Math.floor(col) - 0.5;
      const fv = row - Math.floor(row);
      const scallop = Math.sqrt(fu * fu * 2.2 + fv * fv);
      const plume = smoothstep(0.95, 0.25, scallop);
      const barbs = noise.fbm(u * 2.0, v * 12.0, 12, 32, 3);

      height[idx] = clamp(0.35 + plume * 0.42 + (barbs - 0.5) * 0.24, 0, 1);
      rough[idx] = clamp(0.76 + (1 - plume) * 0.14 + (barbs - 0.5) * 0.08, 0.68, 0.95);
    }
  }
  return {
    normalMap: heightToNormalTexture(height, S, S, 1.35),
    roughnessMap: arrayToGrayTexture(rough, S, S),
  };
}

/**
 * 8. Aged Wood Grain (for shutters, doors, benches)
 */
export function createWoodTextures(baseHex = 0x8b6748, seed = 777) {
  const S = 512;
  const cAlb = makeCanvas(S, S);
  const ctx = cAlb.getContext('2d');
  const img = ctx.createImageData(S, S);
  const alb = img.data;
  const height = new Float32Array(S * S);
  const rough = new Float32Array(S * S);
  const noise = makeTileableNoise(seed);

  const base = new THREE.Color(baseHex);
  const br = base.r * 255, bg = base.g * 255, bb = base.b * 255;

  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const idx = y * S + x;
      const warp = noise.fbm(u, v, 3, 6, 3) * 0.18;
      const ring = Math.sin((u * 14 + warp * 10) * Math.PI * 2) * 0.5 + 0.5;
      const grain = noise.fbm(u * 12, v * 2, 16, 4, 3);
      const shade = 0.80 + ring * 0.16 + (grain - 0.5) * 0.14;

      alb[idx * 4] = clamp(Math.round(br * shade), 0, 255);
      alb[idx * 4 + 1] = clamp(Math.round(bg * shade), 0, 255);
      alb[idx * 4 + 2] = clamp(Math.round(bb * shade), 0, 255);
      alb[idx * 4 + 3] = 255;

      height[idx] = clamp(0.45 + ring * 0.28 + (grain - 0.5) * 0.25, 0, 1);
      rough[idx] = clamp(0.68 + (1 - ring) * 0.18, 0.52, 0.92);
    }
  }
  ctx.putImageData(img, 0, 0);
  return {
    map: finalizeColorTex(cAlb),
    normalMap: heightToNormalTexture(height, S, S, 1.6),
    roughnessMap: arrayToGrayTexture(rough, S, S),
  };
}

/**
 * 9. Striped Provençal Café Awning Canvas
 */
export function createAwningTexture(stripeHex1 = '#b94c38', stripeHex2 = '#f5ebd9', stripes = 8) {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const wStripe = S / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? stripeHex1 : stripeHex2;
    ctx.fillRect(i * wStripe, 0, wStripe + 1, S);
  }
  // Subtle canvas weave shading
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const weave = ((x + y) & 2) ? 0.97 : 1.02;
      const fade = 0.92 + 0.08 * (1 - y / S);
      const p = (y * S + x) * 4;
      d[p] = clamp(Math.round(d[p] * weave * fade), 0, 255);
      d[p + 1] = clamp(Math.round(d[p + 1] * weave * fade), 0, 255);
      d[p + 2] = clamp(Math.round(d[p + 2] * weave * fade), 0, 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return finalizeColorTex(c);
}

/**
 * 10. French Gingham Linen Cloth (for inside wicker basket)
 */
export function createGinghamTexture() {
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f6efe4';
  ctx.fillRect(0, 0, S, S);
  const step = 32;
  ctx.fillStyle = 'rgba(186, 46, 52, 0.34)';
  for (let x = 0; x < S; x += step * 2) ctx.fillRect(x, 0, step, S);
  for (let y = 0; y < S; y += step * 2) ctx.fillRect(0, y, S, step);
  return finalizeColorTex(c, 2, 2);
}

/**
 * 11. Bicycle Tire White-Wall + Charcoal Tread Albedo & Bump
 * UV.y wraps around the tire tube cross-section: 0.5 = outer road tread, 0.25/0.75 = white-wall sidewalls!
 */
export function createTireTextures() {
  const W = 512, H = 256;
  const cAlb = makeCanvas(W, H);
  const ctx = cAlb.getContext('2d');
  const img = ctx.createImageData(W, H);
  const alb = img.data;
  const height = new Float32Array(W * H);
  const rough = new Float32Array(W * H);

  for (let y = 0; y < H; y++) {
    const v = y / H; // 0..1 around torus tube angle
    // Three.js TorusGeometry: angle = v * 2pi.
    // angle = 0 (v=0 or v=1) is OUTERMOST radius (road contact tread!).
    // angle = pi (v=0.5) is INNERMOST radius (rim bead).
    // angle = pi/2 (v=0.25) and 3pi/2 (v=0.75) are the TWO SIDEWALLS!
    const distFromOuter = Math.min(v, 1 - v); // 0 at tread center, 0.25 at sidewall center, 0.5 at rim
    const isWhiteWall = smoothstep(0.135, 0.16, distFromOuter) * smoothstep(0.41, 0.38, distFromOuter);
    const isTreadZone = smoothstep(0.145, 0.11, distFromOuter);

    for (let x = 0; x < W; x++) {
      const u = x / W; // around wheel circumference
      const idx = y * W + x;

      // Subtle chevron/ribbed vintage bicycle tire tread
      const chevron = Math.sin((u * 96 + Math.abs(v > 0.5 ? v - 1 : v) * 28) * Math.PI * 2);
      const rib = Math.sin(distFromOuter * 110);
      const treadRelief = isTreadZone * (chevron * 0.28 + rib * 0.12);

      // Dark charcoal rubber vs vintage warm cream white-wall
      const r = lerp(34, 232, isWhiteWall);
      const g = lerp(33, 222, isWhiteWall);
      const b = lerp(35, 198, isWhiteWall);

      const shade = 0.94 + treadRelief * 0.08;
      alb[idx * 4] = clamp(Math.round(r * shade), 0, 255);
      alb[idx * 4 + 1] = clamp(Math.round(g * shade), 0, 255);
      alb[idx * 4 + 2] = clamp(Math.round(b * shade), 0, 255);
      alb[idx * 4 + 3] = 255;

      height[idx] = clamp(0.5 + treadRelief * 0.45, 0, 1);
      rough[idx] = lerp(0.84, 0.68, isWhiteWall);
    }
  }
  ctx.putImageData(img, 0, 0);
  return {
    map: finalizeColorTex(cAlb),
    normalMap: heightToNormalTexture(height, W, H, 2.2),
    roughnessMap: arrayToGrayTexture(rough, W, H),
  };
}

/**
 * 12. Soft Grounded Tire Contact Shadow Decal Texture
 */
export function createContactShadowTexture() {
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(S * 0.5, S * 0.5, S * 0.04, S * 0.5, S * 0.5, S * 0.48);
  grad.addColorStop(0.0, 'rgba(18, 12, 8, 0.82)');
  grad.addColorStop(0.32, 'rgba(22, 16, 10, 0.55)');
  grad.addColorStop(0.68, 'rgba(28, 20, 14, 0.18)');
  grad.addColorStop(1.0, 'rgba(28, 20, 14, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 13. Hand-lettered French Boulangerie Chalkboard Sign (zero external fonts)
 */
export function createChalkboardTexture() {
  const W = 256, H = 384;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#25292c';
  ctx.fillRect(0, 0, W, H);

  // Subtle chalk dust smudges
  const rand = createPRNG(999);
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(240, 238, 230, ${0.015 + rand() * 0.025})`;
    ctx.fillRect(rand() * W, rand() * H, 2 + rand() * 14, 1 + rand() * 3);
  }

  // Chalk inner border
  ctx.strokeStyle = 'rgba(242, 236, 220, 0.72)';
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, W - 28, H - 28);

  ctx.fillStyle = '#f3ecdc';
  ctx.textAlign = 'center';
  ctx.font = 'bold 24px Georgia, serif';
  ctx.fillText('BOULANGERIE', W / 2, 74);

  ctx.fillStyle = '#e8b97a';
  ctx.font = 'italic 18px Georgia, serif';
  ctx.fillText('— Matin Frais —', W / 2, 106);

  // Simple chalk baguette illustration
  ctx.save();
  ctx.translate(W / 2, 165);
  ctx.rotate(-0.18);
  ctx.strokeStyle = '#f2d39c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, 56, 15, 0, 0, Math.PI * 2);
  ctx.stroke();
  for (let s = -28; s <= 28; s += 18) {
    ctx.beginPath();
    ctx.moveTo(s - 6, -8);
    ctx.lineTo(s + 6, 8);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = '#ece6d8';
  ctx.font = '19px Georgia, serif';
  ctx.fillText('Baguettes  1.20€', W / 2, 240);
  ctx.fillText('Croissants 1.40€', W / 2, 276);
  ctx.fillText('Café Crème 2.50€', W / 2, 312);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 14. Pelican Bill / Gular Pouch Subtle Skin Micro-Normal
 */
export function createBillSkinNormal() {
  const S = 256;
  const height = new Float32Array(S * S);
  const noise = makeTileableNoise(888);
  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const folds = Math.sin(v * Math.PI * 16) * 0.16;
      const micro = noise.fbm(u, v, 14, 14, 3);
      height[y * S + x] = clamp(0.5 + folds + (micro - 0.5) * 0.25, 0, 1);
    }
  }
  return heightToNormalTexture(height, S, S, 1.4);
}
