import * as THREE from 'three';

// Global loop & physics constants — mathematically locked for exact 12.0s seamless loop
export const LOOP_DURATION = 12.0;
export const WHEEL_RADIUS = 0.34; // meters (~26.8" vintage cruiser wheel)
export const WHEEL_CIRCUMFERENCE = 2 * Math.PI * WHEEL_RADIUS; // ~2.136283 m
export const WHEEL_REVS_PER_LOOP = 12; // 1.0 rev/sec (~7.7 km/h relaxed village pace)
export const CRANK_REVS_PER_LOOP = 8;  // 40 RPM (1.5s per full pedal stroke, gear ratio 1.5)
export const LOOP_DIST = WHEEL_REVS_PER_LOOP * WHEEL_CIRCUMFERENCE; // 25.635396 m
export const BLOCK_LEN = LOOP_DIST; // Exact street wrap period

export const BIKE_DIMS = {
  frontAxleX: -0.54,
  rearAxleX: 0.54,
  axleY: WHEEL_RADIUS,
  bbX: 0.08,
  bbY: 0.295,
  crankRadius: 0.145,
  pedalOffsetZ: 0.138,
  crankOffsetZ: 0.088,
  saddleX: 0.24,
  saddleY: 0.825,
  headTubeBottom: new THREE.Vector3(-0.42, 0.54, 0),
  headTubeTop: new THREE.Vector3(-0.34, 0.79, 0),
  gripPosL: new THREE.Vector3(-0.155, 0.965, 0.245),  // Left (+Z, camera-facing side)
  gripPosR: new THREE.Vector3(-0.155, 0.965, -0.245), // Right (-Z, far side)
};

// Deterministic PRNG (Mulberry32)
export function createPRNG(seed = 1337) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Tileable 2D value noise (period px, py) for seamless procedural PBR textures
export function makeTileableNoise(seed = 42) {
  const rand = createPRNG(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = rand();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];

  function hash(ix, iy, px, py) {
    const x = ((ix % px) + px) % px;
    const y = ((iy % py) + py) % py;
    return vals[perm[(perm[x & 255] + (y & 255)) & 255]];
  }

  function noise(x, y, px, py) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy, px, py);
    const b = hash(ix + 1, iy, px, py);
    const c = hash(ix, iy + 1, px, py);
    const d = hash(ix + 1, iy + 1, px, py);
    return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
  }

  function fbm(u, v, baseFreqX, baseFreqY, octaves = 4) {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    let fx = baseFreqX;
    let fy = baseFreqY;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(u * fx, v * fy, fx, fy);
      norm += amp;
      amp *= 0.5;
      fx *= 2;
      fy *= 2;
    }
    return sum / norm;
  }

  return { noise, fbm };
}

/**
 * Exact 2-Bone Analytical Inverse Kinematics Solver.
 * Given root (hip), target (ankle), bone lengths L1, L2, and a pole hint direction
 * (which way the knee bends), returns exact world-space knee position.
 */
const _ikDir = new THREE.Vector3();
const _ikSide = new THREE.Vector3();
const _ikBend = new THREE.Vector3();

export function solve2BoneIK(hip, target, L1, L2, poleDir, outKnee) {
  _ikDir.subVectors(target, hip);
  let dist = _ikDir.length();
  const maxReach = (L1 + L2) * 0.996;
  const minReach = Math.abs(L1 - L2) + 0.004;
  dist = clamp(dist, minReach, maxReach);

  _ikDir.normalize();

  // Compute bend plane orthogonal to hip->target pointing toward poleDir
  _ikSide.crossVectors(_ikDir, poleDir);
  if (_ikSide.lengthSq() < 1e-6) {
    _ikSide.set(0, 0, 1);
  } else {
    _ikSide.normalize();
  }
  _ikBend.crossVectors(_ikSide, _ikDir).normalize();

  // Law of cosines for angle at hip
  const cosAngle = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
  const sinAngle = Math.sqrt(Math.max(0, 1 - cosAngle * cosAngle));

  outKnee
    .copy(hip)
    .addScaledVector(_ikDir, L1 * cosAngle)
    .addScaledVector(_ikBend, L1 * sinAngle);

  return outKnee;
}

/**
 * Creates an organically sculpted curved bird feather mesh (aligned along +X from 0..length,
 * width along Z, cambered arch in +Y, slight downward droop at tip).
 * Supports subtle central rachis ridge and asymmetric vane tapering.
 */
export function createFeatherGeometry({
  length = 0.22,
  width = 0.055,
  arch = 0.018,
  droop = 0.025,
  camber = 0.008,
  asymmetry = 0.12,
  segL = 10,
  segW = 4,
  tipSharpness = 0.6,
  colorRoot = new THREE.Color(0xf7f1e5),
  colorTip = new THREE.Color(0xffffff),
} = {}) {
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  const cTmp = new THREE.Color();

  for (let i = 0; i <= segL; i++) {
    const u = i / segL; // 0 = quill base, 1 = feather tip
    // Natural feather width envelope: narrow quill base -> full vane -> graceful rounded/tapered tip
    const baseExpand = smoothstep(0.0, 0.22, u);
    const tipTaper = Math.pow(1 - Math.pow(u, 2.2), tipSharpness);
    const halfW = 0.5 * width * (0.14 + 0.86 * baseExpand) * tipTaper;

    // Longitudinal centerline arch and tip droop
    const x = u * length;
    const centerY = Math.sin(u * Math.PI) * arch - u * u * droop;

    cTmp.copy(colorRoot).lerp(colorTip, smoothstep(0.15, 0.9, u));

    for (let j = 0; j <= segW; j++) {
      const v = j / segW; // 0..1 across width
      const s = (v - 0.5) * 2; // -1..1
      // Asymmetric leading/trailing vane
      const z = (s + asymmetry * (1 - s * s) * Math.sin(u * Math.PI)) * halfW;
      // Convex feather camber + subtle central shaft ridge
      const shaftRidge = (1 - Math.min(1, Math.abs(s) * 4)) * 0.003 * (1 - u * 0.6);
      const y = centerY + (1 - s * s) * camber * (0.3 + 0.7 * (1 - u)) + shaftRidge;

      positions.push(x, y, z);
      uvs.push(u, v);
      colors.push(cTmp.r, cTmp.g, cTmp.b);
    }
  }

  const stride = segW + 1;
  for (let i = 0; i < segL; i++) {
    for (let j = 0; j < segW; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, d, b, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Helper: build a smooth tapered tube along a 3D CatmullRomCurve3 with custom radius(t)
 */
export function createTaperedTube(curve, tubularSegments, radialSegments, radiusFn, closedCaps = true) {
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions = [];
  const uvs = [];
  const indices = [];
  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const u = i / tubularSegments;
    curve.getPointAt(u, P);
    N.copy(frames.normals[i]);
    B.copy(frames.binormals[i]);
    const r = radiusFn(u);

    for (let j = 0; j <= radialSegments; j++) {
      const v = j / radialSegments;
      const theta = v * Math.PI * 2;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const vx = P.x + r * (cos * N.x + sin * B.x);
      const vy = P.y + r * (cos * N.y + sin * B.y);
      const vz = P.z + r * (cos * N.z + sin * B.z);
      positions.push(vx, vy, vz);
      uvs.push(u, v);
    }
  }

  const stride = radialSegments + 1;
  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, b, d, b, c, d);
    }
  }

  if (closedCaps) {
    // Start cap
    curve.getPointAt(0, P);
    const startCenter = positions.length / 3;
    positions.push(P.x, P.y, P.z);
    uvs.push(0, 0.5);
    for (let j = 0; j < radialSegments; j++) {
      indices.push(startCenter, j + 1, j);
    }
    // End cap
    curve.getPointAt(1, P);
    const endCenter = positions.length / 3;
    positions.push(P.x, P.y, P.z);
    uvs.push(1, 0.5);
    const base = tubularSegments * stride;
    for (let j = 0; j < radialSegments; j++) {
      indices.push(endCenter, base + j, base + j + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Orient a cylinder/mesh aligned along +Y from point A to point B, scaling Y to length.
 */
const _upVec = new THREE.Vector3(0, 1, 0);
const _diffVec = new THREE.Vector3();

export function alignBetween(obj, a, b, scaleY = true) {
  _diffVec.subVectors(b, a);
  const len = _diffVec.length();
  obj.position.copy(a).addScaledVector(_diffVec, 0.5);
  if (len > 1e-6) {
    _diffVec.divideScalar(len);
    obj.quaternion.setFromUnitVectors(_upVec, _diffVec);
  }
  if (scaleY) {
    obj.scale.y = len;
  }
}
