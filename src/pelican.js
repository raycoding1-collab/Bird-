import * as THREE from 'three';
import {
  clamp,
  lerp,
  smoothstep,
  solve2BoneIK,
  createFeatherGeometry,
  alignBetween,
} from './utils.js';
import {
  createFeatherMicroTextures,
  createBillSkinNormal,
} from './textures.js';

/**
 * Creates a film-grade sculpted 3D White Pelican with:
 * - Single continuous organically lofted Torso -> S-Neck -> Head mesh (zero seams!)
 * - Real-time seamless neck bending & bird-like head stabilization
 * - Sculpted hooked pelican bill & backlit subsurface-glowing gular pouch
 * - Glossy dark eyes with sky catchlights, bare orbital skin rings, natural blinking eyelids & nape crest
 * - Multi-layered overlapping curved covert & primary flight-feather wings gripping the handlebars
 * - Fanned overlapping tail feathers
 * - Exact 2-bone analytical IK pale-orange legs & webbed feet locked onto the bicycle pedals
 */
export function createPelican(sunDirection = new THREE.Vector3(-0.6, 0.65, 0.46).normalize()) {
  const root = new THREE.Group();
  root.name = 'PelicanRoot';

  // =========================================================================
  // 1. FILM-GRADE PBR MATERIALS (Velvet Feather Sheen + Translucent SSS Bill)
  // =========================================================================
  const featherMicro = createFeatherMicroTextures();
  featherMicro.normalMap.repeat.set(4, 6);
  featherMicro.roughnessMap.repeat.set(4, 6);

  // Sculptural warm-white plumage (never flat blown-out white!)
  const bodyPlumageMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.0,
    sheen: 0.72,
    sheenRoughness: 0.62,
    sheenColor: new THREE.Color(0xfff2dc),
    normalMap: featherMicro.normalMap,
    normalScale: new THREE.Vector2(0.42, 0.42),
    roughnessMap: featherMicro.roughnessMap,
    envMapIntensity: 0.72,
  });

  const featherWhiteMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.0,
    sheen: 0.76,
    sheenRoughness: 0.58,
    sheenColor: new THREE.Color(0xfff0d8),
    normalMap: featherMicro.normalMap,
    normalScale: new THREE.Vector2(0.32, 0.32),
    side: THREE.DoubleSide,
    envMapIntensity: 0.75,
  });

  // Charcoal-slate inner primary flight feathers (authentic Great White Pelican contrast!)
  const featherDarkMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.76,
    metalness: 0.04,
    sheen: 0.55,
    sheenRoughness: 0.60,
    sheenColor: new THREE.Color(0x8a95a8),
    side: THREE.DoubleSide,
    envMapIntensity: 0.85,
  });

  // Backlit subsurface scattering shader injection for translucent pelican bill & gular pouch
  const billSkinNorm = createBillSkinNormal();
  const sssUniforms = {
    uSunDir: { value: sunDirection.clone().normalize() },
    uSssColor: { value: new THREE.Color(0xff7e2e) },
    uSssStrength: { value: 0.82 },
  };

  function applySubsurfaceGlow(mat, strengthScale = 1.0) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSunDir = sssUniforms.uSunDir;
      shader.uniforms.uSssColor = sssUniforms.uSssColor;
      shader.uniforms.uSssStrength = { value: sssUniforms.uSssStrength.value * strengthScale };

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vWorldPosSSS;
           varying vec3 vWorldNormSSS;`
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
           vec4 wpSSS = modelMatrix * vec4(transformed, 1.0);
           vWorldPosSSS = wpSSS.xyz;
           vWorldNormSSS = normalize(mat3(modelMatrix) * objectNormal);`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform vec3 uSunDir;
           uniform vec3 uSssColor;
           uniform float uSssStrength;
           varying vec3 vWorldPosSSS;
           varying vec3 vWorldNormSSS;`
        )
        .replace(
          '#include <dithering_fragment>',
          `vec3 viewDirW = normalize(cameraPosition - vWorldPosSSS);
           vec3 nW = normalize(vWorldNormSSS);
           // Wrap + backlit forward-scatter translucency for soft peach gular pouch glow
           vec3 backLightDir = normalize(uSunDir + nW * 0.42);
           float backScatter = pow(clamp(dot(viewDirW, -backLightDir), 0.0, 1.0), 2.4);
           float wrapDiffuse = clamp(dot(nW, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
           float rimThin = pow(1.0 - abs(dot(nW, viewDirW)), 1.6);
           vec3 sssGlow = uSssColor * (backScatter * 0.95 + wrapDiffuse * rimThin * 0.42) * uSssStrength;
           gl_FragColor.rgb += sssGlow;
           #include <dithering_fragment>`
        );
    };
  }

  const upperBillMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.42,
    metalness: 0.0,
    clearcoat: 0.25,
    clearcoatRoughness: 0.36,
    normalMap: billSkinNorm,
    normalScale: new THREE.Vector2(0.28, 0.28),
    envMapIntensity: 0.9,
  });
  applySubsurfaceGlow(upperBillMat, 0.38);

  const pouchMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.48,
    metalness: 0.0,
    clearcoat: 0.18,
    clearcoatRoughness: 0.44,
    sheen: 0.35,
    sheenColor: new THREE.Color(0xffcca0),
    normalMap: billSkinNorm,
    normalScale: new THREE.Vector2(0.55, 0.55),
    side: THREE.DoubleSide,
    envMapIntensity: 0.85,
  });
  applySubsurfaceGlow(pouchMat, 1.0);

  const orbitalSkinMat = new THREE.MeshPhysicalMaterial({
    color: 0xf6c9a5,
    roughness: 0.62,
    sheen: 0.25,
    sheenColor: new THREE.Color(0xffe1c6),
  });

  // Dark glossy eyes with bright sky catchlights
  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: 0x090706,
    roughness: 0.03,
    metalness: 0.02,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    envMapIntensity: 2.6,
  });

  // Pale-orange legs & webbed feet
  const legMat = new THREE.MeshPhysicalMaterial({
    color: 0xeb9b52,
    roughness: 0.56,
    metalness: 0.0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.5,
    normalMap: billSkinNorm,
    normalScale: new THREE.Vector2(0.45, 0.45),
    envMapIntensity: 0.7,
  });

  const webMat = new THREE.MeshPhysicalMaterial({
    color: 0xf1a866,
    roughness: 0.52,
    metalness: 0.0,
    side: THREE.DoubleSide,
    envMapIntensity: 0.7,
  });
  applySubsurfaceGlow(webMat, 0.55);

  const clawMat = new THREE.MeshStandardMaterial({
    color: 0x6f5542,
    roughness: 0.48,
    metalness: 0.05,
  });

  // =========================================================================
  // 2. CONTINUOUS ORGANICALLY LOFTED TORSO + S-NECK + HEAD MESH (ZERO SEAMS!)
  // =========================================================================
  const spineControlPoints = [
    new THREE.Vector3(0.485, 0.960, 0), // u=0.00 tail base / rump
    new THREE.Vector3(0.375, 0.945, 0), // u=0.14 lower back / rear pelvis over saddle
    new THREE.Vector3(0.245, 0.985, 0), // u=0.28 mid torso seated squarely on saddle
    new THREE.Vector3(0.145, 1.095, 0), // u=0.42 full rounded breast & shoulder massif
    new THREE.Vector3(0.135, 1.245, 0), // u=0.56 lower neck rising gracefully
    new THREE.Vector3(0.165, 1.385, 0), // u=0.70 classic pelican S-neck backward curve
    new THREE.Vector3(0.095, 1.505, 0), // u=0.82 upper neck sweeping forward
    new THREE.Vector3(0.015, 1.575, 0), // u=0.92 rounded cranium / occiput
    new THREE.Vector3(-0.075, 1.568, 0), // u=1.00 smooth brow / upper-bill transition
  ];
  const spineCurve = new THREE.CatmullRomCurve3(spineControlPoints, false, 'centripetal');

  const RINGS = 68;
  const RADIAL = 32;

  // Compute smooth parallel-transport frames (so zero twist along S-curve!)
  const ringData = [];
  const basePositions = new Float32Array((RINGS + 1) * (RADIAL + 1) * 3);
  const bodyUvs = new Float32Array((RINGS + 1) * (RADIAL + 1) * 2);
  const bodyColors = new Float32Array((RINGS + 1) * (RADIAL + 1) * 3);
  const bodyIndices = [];

  // Film-calibrated warm-white plumage tones (never clipped 1.0 white so ACES models 3D shadow volume!)
  const cCream = new THREE.Color(0xd5cbb9);
  const cWarmWhite = new THREE.Color(0xf2ede3);
  const cBreastBlush = new THREE.Color(0xefdac0);
  const cTmp = new THREE.Color();

  // Cross-section anatomical radius envelope function r(u, theta)
  // theta = 0 is dorsal (+Y/+X back), theta = pi is ventral (-Y/-X belly/chest/throat), theta = ±pi/2 is lateral (±Z)
  function evalCrossSection(u, theta) {
    // 1. Torso pear-shaped fullness (u in 0..0.52)
    const rumpTaper = smoothstep(0.0, 0.14, u);
    const torsoBell = Math.sin(clamp(u / 0.54, 0, 1) * Math.PI);
    const torsoBase = Math.pow(torsoBell, 0.72) * 0.168 * (0.35 + 0.65 * rumpTaper);

    // 2. Graceful S-neck slender cylinder (u in 0.44..0.85)
    const neckWeight = smoothstep(0.36, 0.56, u) * smoothstep(0.92, 0.76, u);
    const neckR = lerp(0.068, 0.048, smoothstep(0.46, 0.74, u)) + 0.010 * smoothstep(0.74, 0.85, u);

    // 3. Rounded pelican cranium & cheeks (u in 0.80..1.00)
    const headT = clamp((u - 0.80) / 0.20, 0, 1);
    const headBulb = Math.sin(headT * Math.PI);
    const headR = Math.pow(headBulb, 0.62) * 0.074;

    let r = Math.max(torsoBase, neckR * neckWeight) + headR * smoothstep(0.78, 0.88, u);
    const chestBlend = Math.exp(-Math.pow((u - 0.45) / 0.10, 2)) * 0.038;
    const napeBlend = Math.exp(-Math.pow((u - 0.84) / 0.065, 2)) * 0.022;
    r += chestBlend + napeBlend;

    if (u < 0.04) r *= smoothstep(0.0, 0.04, u) * 0.92 + 0.08 * (u / 0.04);
    if (u > 0.96) r *= smoothstep(1.0, 0.96, u);

    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const torsoMask = smoothstep(0.55, 0.25, u);
    const headMask = smoothstep(0.80, 0.92, u);

    const ventral = Math.max(0, -cosT);
    const dorsal = Math.max(0, cosT);
    const lateral = Math.abs(sinT);

    const breastKeel = torsoMask * ventral * 0.048 * Math.sin(clamp(u / 0.50, 0, 1) * Math.PI);
    const saddleSit = Math.exp(-Math.pow((u - 0.24) / 0.10, 2)) * ventral * 0.015;
    const shoulderWidth = Math.exp(-Math.pow((u - 0.34) / 0.12, 2)) * lateral * 0.020;
    const neckOval = neckWeight * (1.0 - 0.14 * lateral * lateral);
    const cheekFull = headMask * Math.exp(-Math.pow((u - 0.91) / 0.06, 2)) * lateral * 0.009;
    const crownBump = headMask * dorsal * Math.exp(-Math.pow((u - 0.88) / 0.07, 2)) * 0.013;
    const napeRidge = Math.exp(-Math.pow((u - 0.83) / 0.07, 2)) * Math.pow(dorsal, 3) * 0.016;

    const rVert = (r + breastKeel - saddleSit + crownBump + napeRidge);
    const rHoriz = (r * (neckWeight > 0.1 ? lerp(1.0, neckOval, neckWeight) : 0.92) + shoulderWidth + cheekFull);

    return {
      dn: cosT * rVert,
      db: sinT * rHoriz,
    };
  }

  for (let i = 0; i <= RINGS; i++) {
    const u = i / RINGS;
    const center = spineCurve.getPointAt(u);
    const tangent = spineCurve.getTangentAt(u).normalize();
    const binormal = new THREE.Vector3(0, 0, 1);
    const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();

    const offsets = [];
    for (let j = 0; j <= RADIAL; j++) {
      const v = j / RADIAL;
      const theta = v * Math.PI * 2;
      const { dn, db } = evalCrossSection(u, theta);
      offsets.push(dn, db);

      const idx = i * (RADIAL + 1) + j;
      const px = center.x + normal.x * dn + binormal.x * db;
      const py = center.y + normal.y * dn + binormal.y * db;
      const pz = center.z + normal.z * dn + binormal.z * db;

      basePositions[idx * 3] = px;
      basePositions[idx * 3 + 1] = py;
      basePositions[idx * 3 + 2] = pz;

      bodyUvs[idx * 2] = v;
      bodyUvs[idx * 2 + 1] = u;

      // Rich sculptural tonal variation + soft baked AO in belly, under-chin, and shoulder creases
      const cosT = Math.cos(theta);
      const dorsalFactor = cosT * 0.5 + 0.5;
      cTmp.copy(cCream).lerp(cWarmWhite, smoothstep(0.10, 0.80, dorsalFactor));
      const breastZone = Math.exp(-Math.pow((u - 0.36) / 0.14, 2)) * smoothstep(0.65, 0.1, dorsalFactor);
      cTmp.lerp(cBreastBlush, breastZone * 0.68);
      // Soft under-chin throat crease AO & lower saddle contact AO
      const chinAO = Math.exp(-Math.pow((u - 0.82) / 0.06, 2)) * (1 - dorsalFactor) * 0.10;
      const bellyAO = Math.exp(-Math.pow((u - 0.22) / 0.14, 2)) * (1 - dorsalFactor) * 0.12;
      const rumpShade = smoothstep(0.16, 0.0, u) * 0.08;
      cTmp.multiplyScalar(1.0 - rumpShade - chinAO - bellyAO);

      bodyColors[idx * 3] = cTmp.r;
      bodyColors[idx * 3 + 1] = cTmp.g;
      bodyColors[idx * 3 + 2] = cTmp.b;
    }

    ringData.push({ u, center, tangent, normal, binormal, offsets });
  }

  const stride = RADIAL + 1;
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < RADIAL; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      bodyIndices.push(a, d, b, b, d, c);
    }
  }

  const bodyGeo = new THREE.BufferGeometry();
  const bodyPosAttr = new THREE.BufferAttribute(new Float32Array(basePositions), 3);
  bodyGeo.setAttribute('position', bodyPosAttr);
  bodyGeo.setAttribute('uv', new THREE.BufferAttribute(bodyUvs, 2));
  bodyGeo.setAttribute('color', new THREE.BufferAttribute(bodyColors, 3));
  bodyGeo.setIndex(bodyIndices);
  bodyGeo.computeVertexNormals();

  const bodyMesh = new THREE.Mesh(bodyGeo, bodyPlumageMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  root.add(bodyMesh);

  // =========================================================================
  // 3. HEAD GROUP (Bill, Backlit Translucent Gular Pouch, Eyes, Eyelids, Crest)
  // =========================================================================
  const headRestAnchor = spineCurve.getPointAt(0.91);
  const headGroup = new THREE.Group();
  headGroup.position.copy(headRestAnchor);
  root.add(headGroup);

  // --- 3A. Sculpted Upper Mandible (Maxilla) with Hooked Coral Tip ---
  function buildUpperBill() {
    const segU = 26;
    const segV = 18;
    const pos = [];
    const uvs = [];
    const cols = [];
    const idx = [];

    const cBase = new THREE.Color(0xf4cfa8);
    const cMid = new THREE.Color(0xf0ad76);
    const cEdge = new THREE.Color(0xe68856);
    const cHook = new THREE.Color(0xde5e33);
    const ct = new THREE.Color();

    const billLen = 0.375;
    for (let i = 0; i <= segU; i++) {
      const u = i / segU;
      const x = -0.020 - u * billLen;

      const halfW = 0.045 * (1.0 - 0.56 * Math.pow(u, 0.85)) * (1.0 + 0.08 * Math.sin(u * Math.PI * 2.2)) * smoothstep(1.02, 0.93, u);
      const ridgeH = 0.042 * (1.0 - 0.68 * Math.pow(u, 0.72));

      const hookDrop = Math.pow(smoothstep(0.84, 1.0, u), 2.0) * 0.032;
      const baseLineY = -0.010 - u * 0.036 - hookDrop;

      for (let j = 0; j <= segV; j++) {
        const v = j / segV;
        let ly, lz;
        if (v <= 0.5) {
          const t = v * 2 * Math.PI;
          const s = Math.cos(t);
          const up = Math.sin(t);
          lz = s * halfW;
          const culmenPeak = Math.pow(up, 0.78) * ridgeH + Math.pow(up, 4.0) * 0.008 * (1 - u * 0.5);
          ly = baseLineY + culmenPeak;
        } else {
          const t = (v - 0.5) * 2 * Math.PI;
          const s = -Math.cos(t);
          const dn = Math.sin(t);
          lz = s * halfW * 0.96;
          ly = baseLineY + dn * 0.005;
        }

        pos.push(x, ly, lz);
        uvs.push(u, v);

        const isTopRidge = v <= 0.5 ? Math.sin(v * 2 * Math.PI) : 0;
        ct.copy(cBase).lerp(cMid, smoothstep(0.1, 0.75, u));
        ct.lerp(cEdge, (1 - isTopRidge) * 0.55 * smoothstep(0.08, 0.6, u));
        ct.lerp(cHook, smoothstep(0.82, 0.98, u));
        cols.push(ct.r, ct.g, ct.b);
      }
    }

    const st = segV + 1;
    for (let i = 0; i < segU; i++) {
      for (let j = 0; j < segV; j++) {
        const a = i * st + j;
        const b = (i + 1) * st + j;
        const c = (i + 1) * st + (j + 1);
        const d = i * st + (j + 1);
        idx.push(a, b, d, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, upperBillMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  headGroup.add(buildUpperBill());

  // --- 3B. Sculpted Lower Mandible & Hanging Backlit Translucent Gular Pouch ---
  const pouchGroup = new THREE.Group();
  headGroup.add(pouchGroup);

  function buildLowerBillAndPouch() {
    const segU = 26;
    const segV = 20;
    const pos = [];
    const uvs = [];
    const cols = [];
    const idx = [];

    const cThroat = new THREE.Color(0xf0af70);
    const cPouchGlow = new THREE.Color(0xf2a158);
    const cRim = new THREE.Color(0xe2864c);
    const cTip = new THREE.Color(0xdf7240);
    const ct = new THREE.Color();

    const len = 0.358;
    for (let i = 0; i <= segU; i++) {
      const u = i / segU;
      const x = 0.015 - u * (len + 0.025);
      const rimHalfW = 0.043 * (1.0 - 0.58 * Math.pow(u, 0.88)) * smoothstep(1.02, 0.92, u);
      const rimY = -0.013 - u * 0.036;

      const sagProfile = Math.sin(Math.pow(u, 0.72) * Math.PI) * smoothstep(1.0, 0.85, u);
      const pouchDepth = 0.016 + 0.120 * sagProfile;
      const bellySwell = 1.0 + 0.24 * sagProfile;

      for (let j = 0; j <= segV; j++) {
        const v = j / segV;
        const a = v * Math.PI;
        const s = Math.cos(a);
        const dn = Math.sin(a);

        const pleat = Math.sin(v * Math.PI * 6) * 0.0024 * sagProfile * dn;
        const lz = s * rimHalfW * lerp(1.0, bellySwell, dn);
        const ly = rimY - Math.pow(dn, 0.85) * pouchDepth + pleat;

        pos.push(x, ly, lz);
        uvs.push(u, v);

        ct.copy(cRim).lerp(cPouchGlow, smoothstep(0.1, 0.75, dn));
        ct.lerp(cThroat, smoothstep(0.28, 0.0, u) * 0.5);
        ct.lerp(cTip, smoothstep(0.75, 1.0, u) * 0.75);
        cols.push(ct.r, ct.g, ct.b);
      }
    }

    const st = segV + 1;
    for (let i = 0; i < segU; i++) {
      for (let j = 0; j < segV; j++) {
        const a = i * st + j;
        const b = (i + 1) * st + j;
        const c = (i + 1) * st + (j + 1);
        const d = i * st + (j + 1);
        idx.push(a, d, b, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, pouchMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  pouchGroup.add(buildLowerBillAndPouch());

  // --- 3C. Expressive Eyes, Bare Peach Orbital Patches & Animated Blinking Eyelids ---
  const eyelidsUpper = [];
  const eyelidsLower = [];
  const eyePatchGeo = new THREE.SphereGeometry(0.029, 16, 12);
  const eyeBallGeo = new THREE.SphereGeometry(0.0185, 22, 16);
  const lidGeo = new THREE.SphereGeometry(0.0205, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52);

  for (const s of [-1, 1]) {
    const patch = new THREE.Mesh(eyePatchGeo, orbitalSkinMat);
    patch.scale.set(1.26, 0.94, 0.44);
    patch.position.set(-0.044, 0.017, s * 0.046);
    patch.rotation.y = s * 0.28;
    headGroup.add(patch);

    const eyeSocket = new THREE.Group();
    eyeSocket.position.set(-0.048, 0.019, s * 0.052);
    headGroup.add(eyeSocket);

    const eye = new THREE.Mesh(eyeBallGeo, eyeMat);
    eyeSocket.add(eye);

    // Dual crisp sky catchlights (primary + tiny warm secondary rim bounce) for Pixar soulful sparkle!
    const catchMat = new THREE.MeshBasicMaterial({ color: 0xfffdf8 });
    const catch1 = new THREE.Mesh(new THREE.SphereGeometry(0.0040, 8, 6), catchMat);
    catch1.position.set(-0.0095, 0.0085, s * 0.0135);
    eyeSocket.add(catch1);
    const catch2 = new THREE.Mesh(new THREE.SphereGeometry(0.0020, 6, 5), catchMat);
    catch2.position.set(-0.0030, -0.0060, s * 0.0165);
    eyeSocket.add(catch2);

    // Upper & lower sculpted eyelids
    const upperLid = new THREE.Mesh(lidGeo, orbitalSkinMat);
    upperLid.rotation.z = 0.12;
    upperLid.rotation.x = -0.74;
    eyeSocket.add(upperLid);
    eyelidsUpper.push({ mesh: upperLid, side: s });

    const lowerLid = new THREE.Mesh(lidGeo, orbitalSkinMat);
    lowerLid.rotation.z = Math.PI - 0.10;
    lowerLid.rotation.x = 0.84;
    eyeSocket.add(lowerLid);
    eyelidsLower.push({ mesh: lowerLid, side: s });
  }

  // --- 3D. Soft Sculpted Nape Crest Tuft (back of head) ---
  const crestFeathers = [];
  const crestGroup = new THREE.Group();
  crestGroup.position.set(0.036, 0.042, 0);
  headGroup.add(crestGroup);

  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const len = 0.075 + (1 - Math.abs(t - 0.45)) * 0.032;
    const fGeo = createFeatherGeometry({
      length: len,
      width: 0.024,
      arch: 0.014,
      droop: 0.024,
      camber: 0.005,
      segL: 7,
      segW: 4,
      colorRoot: new THREE.Color(0xe5ddd0),
      colorTip: new THREE.Color(0xf4efe6),
    });
    const fMesh = new THREE.Mesh(fGeo, featherWhiteMat);
    fMesh.castShadow = true;
    const rowZ = ((i % 3) - 1) * 0.015;
    const basePitch = 0.12 - t * 0.68;
    fMesh.position.set(t * 0.018, -t * 0.038, rowZ);
    fMesh.rotation.set(0, -rowZ * 3.8, basePitch);
    crestGroup.add(fMesh);
    crestFeathers.push({ mesh: fMesh, basePitch, phase: i * 0.7 });
  }

  // =========================================================================
  // 4. SLEEK SHINGLED OVERLAPPING LAYERED WINGS GRIPPING THE HANDLEBARS
  // =========================================================================
  // Local wing segment coordinates from orientWingSegment(obj, ptA, ptB, upHint):
  //   +X points from ptA -> ptB (shoulder->elbow, elbow->wrist)
  //   +Y points dorsally (UP)
  //   +Z = dir × up: for left wing (s=+1, going -X), +Z points INWARD toward torso (-worldZ);
  //                  for right wing (s=-1, going -X), +Z points OUTWARD away from torso (+worldZ)!
  // Let's keep explicit outerSign = -s so feathers ALWAYS wrap cleanly on the OUTER side of each wing
  // and shingle TANGENTIALLY BACKWARD along the wing airfoil (ZERO hanging comb fringe!).
  const wings = [];

  for (const s of [-1, 1]) {
    const wingRoot = new THREE.Group();
    root.add(wingRoot);

    const upperWing = new THREE.Group();
    wingRoot.add(upperWing);

    const foreWing = new THREE.Group();
    wingRoot.add(foreWing);

    // Outer lateral direction in local wing frame (always points outward away from pelican torso!)
    const outZ = -s;

    // Helper for uniform film-calibrated white vertex color on sculpted wing cores
    function tintGeo(geo, topHex, botHex) {
      const pos = geo.attributes.position;
      const cols = new Float32Array(pos.count * 3);
      const cTop = new THREE.Color(topHex);
      const cBot = new THREE.Color(botHex);
      const ct = new THREE.Color();
      for (let k = 0; k < pos.count; k++) {
        const yNorm = clamp(pos.getY(k) / 0.08 + 0.5, 0, 1);
        ct.copy(cBot).lerp(cTop, yNorm);
        cols[k * 3] = ct.r;
        cols[k * 3 + 1] = ct.g;
        cols[k * 3 + 2] = ct.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      return geo;
    }

    // Smooth blended scapular shoulder cushion tucked cleanly into the torso side (never tall/bulky!)
    const shoulderGeo = tintGeo(new THREE.SphereGeometry(0.086, 18, 14), 0xf0ebe1, 0xd8d0c2);
    shoulderGeo.scale(1.35, 0.74, 0.56);
    const shoulderPad = new THREE.Mesh(shoulderGeo, bodyPlumageMat);
    shoulderPad.position.set(0.03, -0.008, -outZ * 0.015);
    shoulderPad.castShadow = true;
    shoulderPad.receiveShadow = true;
    upperWing.add(shoulderPad);

    // Sculpted airfoil upper-arm volume (plump leading edge, smoothly tapering toward elbow)
    const upperCoreGeo = tintGeo(new THREE.CapsuleGeometry(0.048, 0.14, 8, 16), 0xf1ece2, 0xd7cfc0);
    upperCoreGeo.rotateZ(Math.PI / 2);
    upperCoreGeo.scale(1.05, 0.72, 0.58);
    const upperCore = new THREE.Mesh(upperCoreGeo, bodyPlumageMat);
    upperCore.position.set(0.10, -0.004, 0);
    upperCore.castShadow = true;
    upperCore.receiveShadow = true;
    upperWing.add(upperCore);

    // Sculpted tapered forearm airfoil volume sweeping forward cleanly to the red handlebar grip
    const foreCoreGeo = tintGeo(new THREE.CapsuleGeometry(0.038, 0.21, 8, 16), 0xf2ede4, 0xd9d1c3);
    foreCoreGeo.rotateZ(Math.PI / 2);
    foreCoreGeo.scale(1.05, 0.68, 0.50);
    const foreCore = new THREE.Mesh(foreCoreGeo, bodyPlumageMat);
    foreCore.position.set(0.135, -0.002, 0);
    foreCore.castShadow = true;
    foreCore.receiveShadow = true;
    foreWing.add(foreCore);

    // --- 3 TIGHTLY SHINGLED OVERLAPPING FEATHER TIERS SWEEPING BACKWARD ALONG THE WING AIRFOIL! ---
    // Note: createFeatherGeometry extends along +X. Rotating by PI around Y makes the feather sweep
    // cleanly BACKWARD (-local X, i.e., toward the elbow/rump!), tightly hugging the wing contour!
    const flutterFeathers = [];

    // Tier 1: Scapular & Lesser Coverts hugging upperWing (plush broad overlapping feathers!)
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const fGeo = createFeatherGeometry({
        length: 0.135 + t * 0.032,
        width: 0.068,
        arch: 0.015,
        droop: 0.016,
        camber: 0.012,
        asymmetry: outZ * 0.14,
        colorRoot: new THREE.Color(0xd5ccbc),
        colorTip: new THREE.Color(0xf3eee5),
      });
      const fm = new THREE.Mesh(fGeo, featherWhiteMat);
      fm.castShadow = true;
      fm.receiveShadow = true;
      fm.position.set(0.05 + t * 0.16, 0.020 - t * 0.018, outZ * (0.025 + 0.008 * Math.sin(t * Math.PI)));
      fm.rotation.set(outZ * 0.34, Math.PI + outZ * 0.16, 0.24 + t * 0.14);
      upperWing.add(fm);
    }

    // Tier 2: Lush Median & Greater Coverts cascading softly downward-and-back along the forearm airfoil!
    for (let i = 0; i < 11; i++) {
      const t = i / 10;
      const fGeo = createFeatherGeometry({
        length: 0.155 + (1 - t) * 0.045,
        width: 0.068,
        arch: 0.016,
        droop: 0.020,
        camber: 0.012,
        asymmetry: outZ * 0.16,
        colorRoot: new THREE.Color(0xd4cbb9),
        colorTip: new THREE.Color(0xf4efe6),
      });
      const fm = new THREE.Mesh(fGeo, featherWhiteMat);
      fm.castShadow = true;
      fm.receiveShadow = true;
      fm.position.set(0.04 + t * 0.22, 0.012 - t * 0.012, outZ * (0.023 - t * 0.006));
      const baseRotZ = 0.28 + (1 - t) * 0.24; // lush gently fanning avian wing silhouette!
      fm.rotation.set(outZ * 0.38, Math.PI + outZ * (0.14 + t * 0.06), baseRotZ);
      foreWing.add(fm);
      flutterFeathers.push({ mesh: fm, baseRotZ, amp: 0.014 + (1 - t) * 0.010, phase: i * 0.65 });
    }

    // Tier 3: Soft Charcoal-Slate Secondary & Primary Flight Feathers tucked cleanly beneath the white coverts!
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const fGeo = createFeatherGeometry({
        length: 0.185 + (1 - t) * 0.055,
        width: 0.056,
        arch: 0.014,
        droop: 0.022,
        camber: 0.009,
        asymmetry: outZ * 0.16,
        colorRoot: new THREE.Color(0x565a64),
        colorTip: new THREE.Color(0x282c34),
      });
      const fm = new THREE.Mesh(fGeo, featherDarkMat);
      fm.castShadow = true;
      fm.receiveShadow = true;
      // Gently fanned beneath the greater coverts so they read as authentic pelican dark flight tips (never a stiff stripe!)
      fm.position.set(0.03 + t * 0.13, -0.020 - t * 0.006, outZ * (0.010 - t * 0.004));
      const baseRotZ = 0.34 + (1 - t) * 0.22;
      fm.rotation.set(outZ * 0.28, Math.PI + outZ * 0.06, baseRotZ);
      foreWing.add(fm);
      flutterFeathers.push({ mesh: fm, baseRotZ, amp: 0.016 + (1 - t) * 0.012, phase: i * 0.8 + 1.2 });
    }

    // --- Curved Wingtip "Hand" Feathers wrapping snugly OVER & AROUND the cherry-red handlebar grip! ---
    const gripCapGroup = new THREE.Group();
    foreWing.add(gripCapGroup);

    // Soft feathered wrist cushion bridging cleanly onto the red handlebar grip
    const wristGeo = tintGeo(new THREE.SphereGeometry(0.028, 12, 10), 0xf3eee6, 0xddd5c8);
    wristGeo.scale(1.2, 0.82, 0.95);
    const wristPad = new THREE.Mesh(wristGeo, bodyPlumageMat);
    wristPad.position.set(-0.005, 0.004, 0);
    gripCapGroup.add(wristPad);

    for (let i = 0; i < 5; i++) {
      const t = (i - 2) / 2;
      const fGeo = createFeatherGeometry({
        length: 0.072 - Math.abs(t) * 0.012,
        width: 0.026,
        arch: 0.016,
        droop: 0.044,
        camber: 0.006,
        segL: 8,
        segW: 3,
        colorRoot: new THREE.Color(0xe5ddd0),
        colorTip: new THREE.Color(0xf6f2ea),
      });
      const tipF = new THREE.Mesh(fGeo, featherWhiteMat);
      tipF.castShadow = true;
      tipF.position.set(-0.012, 0.015, t * 0.015);
      tipF.rotation.set(t * 0.16, -t * 0.18, -0.18);
      gripCapGroup.add(tipF);
    }

    wings.push({
      side: s,
      upperWing,
      foreWing,
      gripCapGroup,
      flutterFeathers,
    });
  }

  // =========================================================================
  // 5. LUSH TWO-TIER FANNED SCULPTED TAIL FEATHERS
  // =========================================================================
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0.455, 0.955, 0);
  root.add(tailGroup);

  const tailFeathers = [];
  const TAIL_COUNT = 11;
  for (let i = 0; i < TAIL_COUNT; i++) {
    const t = (i / (TAIL_COUNT - 1)) * 2 - 1;
    const isOuter = Math.abs(t);
    const fGeo = createFeatherGeometry({
      length: 0.215 - isOuter * 0.032,
      width: 0.056,
      arch: 0.016,
      droop: 0.014,
      camber: 0.010,
      colorRoot: new THREE.Color(0xdad1c1),
      colorTip: new THREE.Color(0xf4efe6),
    });
    const tf = new THREE.Mesh(fGeo, featherWhiteMat);
    tf.castShadow = true;
    tf.receiveShadow = true;
    const baseYaw = -t * 0.44;
    const basePitch = 0.28 - isOuter * 0.12;
    tf.position.set(-isOuter * 0.014, -isOuter * 0.010, t * 0.036);
    tf.rotation.set(t * 0.18, baseYaw, basePitch);
    tailGroup.add(tf);
    tailFeathers.push({ mesh: tf, basePitch, phase: i * 0.55 });
  }
  for (let i = 0; i < 7; i++) {
    const t = (i / 6) * 2 - 1;
    const isOuter = Math.abs(t);
    const fGeo = createFeatherGeometry({
      length: 0.145 - isOuter * 0.022,
      width: 0.052,
      arch: 0.018,
      droop: 0.018,
      camber: 0.012,
      colorRoot: new THREE.Color(0xe0d8ca),
      colorTip: new THREE.Color(0xf3eee6),
    });
    const tf = new THREE.Mesh(fGeo, featherWhiteMat);
    tf.castShadow = true;
    const basePitch = 0.36 - isOuter * 0.10;
    tf.position.set(-0.025 - isOuter * 0.01, 0.016 - isOuter * 0.008, t * 0.030);
    tf.rotation.set(t * 0.15, -t * 0.34, basePitch);
    tailGroup.add(tf);
    tailFeathers.push({ mesh: tf, basePitch, phase: i * 0.7 + 0.5 });
  }

  // =========================================================================
  // 6. EXACT 2-BONE ANALYTICAL IK LEGS & SCULPTED BROAD WEBBED FEET
  // =========================================================================
  const L1 = 0.395; // slightly adjusted for higher tucked hip inside seated belly!
  const L2 = 0.395;
  const legs = [];

  function buildWebbedFoot() {
    const fGroup = new THREE.Group();

    const heel = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), legMat);
    heel.scale.set(1.35, 0.78, 1.15);
    heel.position.set(0.008, -0.010, 0);
    heel.castShadow = true;
    fGroup.add(heel);

    const toeSpecs = [
      { ang: 0.42, len: 0.106, r: 0.0095 },
      { ang: 0.00, len: 0.124, r: 0.0105 },
      { ang: -0.42, len: 0.106, r: 0.0095 },
    ];
    const toeTipPts = [];

    for (const ts of toeSpecs) {
      const tipX = -Math.cos(ts.ang) * ts.len;
      const tipZ = Math.sin(ts.ang) * ts.len;
      const midX = tipX * 0.52;
      const midZ = tipZ * 0.52;

      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.004, -0.011, 0),
        new THREE.Vector3(midX, -0.013, midZ),
        new THREE.Vector3(tipX, -0.018, tipZ),
      ]);
      const tMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, ts.r, 8, false), legMat);
      tMesh.castShadow = true;
      tMesh.receiveShadow = true;
      fGroup.add(tMesh);

      const claw = new THREE.Mesh(new THREE.ConeGeometry(ts.r * 0.72, 0.020, 7), clawMat);
      claw.rotation.z = Math.PI * 0.58;
      claw.rotation.y = -ts.ang;
      claw.position.set(tipX - Math.cos(ts.ang) * 0.008, -0.021, tipZ + Math.sin(ts.ang) * 0.008);
      fGroup.add(claw);

      toeTipPts.push(new THREE.Vector3(tipX * 0.95, -0.017, tipZ * 0.95));
    }

    const backToe = new THREE.Mesh(new THREE.CapsuleGeometry(0.0072, 0.030, 5, 8), legMat);
    backToe.rotation.z = Math.PI / 2;
    backToe.position.set(0.028, -0.014, 0);
    fGroup.add(backToe);

    function buildWebMembrane(pA, pB) {
      const seg = 6;
      const pos = [];
      const idx = [];
      const origin = new THREE.Vector3(-0.006, -0.013, 0);
      for (let i = 0; i <= seg; i++) {
        const u = i / seg;
        const scallop = 1.0 - 0.14 * Math.sin(u * Math.PI);
        const edgeX = lerp(pA.x, pB.x, u) * scallop;
        const edgeY = lerp(pA.y, pB.y, u) + 0.003 * Math.sin(u * Math.PI);
        const edgeZ = lerp(pA.z, pB.z, u) * scallop;
        pos.push(origin.x, origin.y, origin.z);
        pos.push(edgeX, edgeY, edgeZ);
      }
      for (let i = 0; i < seg; i++) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 3;
        const d = a + 2;
        idx.push(a, b, c, a, c, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, webMat);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    }

    fGroup.add(buildWebMembrane(toeTipPts[0], toeTipPts[1]));
    fGroup.add(buildWebMembrane(toeTipPts[1], toeTipPts[2]));

    return fGroup;
  }

  // Sleek feathered hip-cuff sleeve tucked naturally inside the lower belly (zero protruding bulb!)
  const drumstickPts = [
    new THREE.Vector2(0.020, -0.056),
    new THREE.Vector2(0.025, -0.032),
    new THREE.Vector2(0.032,  0.004),
    new THREE.Vector2(0.036,  0.036),
    new THREE.Vector2(0.028,  0.058),
    new THREE.Vector2(0.001,  0.064),
  ];
  const baseThighGeo = new THREE.LatheGeometry(drumstickPts, 14);
  const ttPos = baseThighGeo.attributes.position;
  const ttCols = new Float32Array(ttPos.count * 3);
  const cTTop = new THREE.Color(0xd5ccb9);
  const cTBot = new THREE.Color(0xc4b9a6);
  const cTTmp = new THREE.Color();
  for (let k = 0; k < ttPos.count; k++) {
    const yn = clamp((ttPos.getY(k) + 0.056) / 0.120, 0, 1);
    cTTmp.copy(cTBot).lerp(cTTop, yn);
    ttCols[k * 3] = cTTmp.r;
    ttCols[k * 3 + 1] = cTTmp.g;
    ttCols[k * 3 + 2] = cTTmp.b;
  }
  baseThighGeo.setAttribute('color', new THREE.BufferAttribute(ttCols, 3));

  for (const s of [-1, 1]) {
    const thighTuft = new THREE.Mesh(baseThighGeo, bodyPlumageMat);
    thighTuft.castShadow = true;
    thighTuft.receiveShadow = true;
    root.add(thighTuft);

    // Organic sculpted tapered upper leg (tibiotarsus)
    const upperLegGeo = new THREE.CylinderGeometry(0.022, 0.0155, 1.0, 14);
    const upperLeg = new THREE.Mesh(upperLegGeo, legMat);
    upperLeg.castShadow = true;
    upperLeg.receiveShadow = true;
    root.add(upperLeg);

    // Rounded knee joint
    const kneeJoint = new THREE.Mesh(new THREE.SphereGeometry(0.0185, 12, 10), legMat);
    kneeJoint.castShadow = true;
    root.add(kneeJoint);

    // Slender tapered lower leg (tarsometatarsus)
    const lowerLegGeo = new THREE.CylinderGeometry(0.0155, 0.013, 1.0, 14);
    const lowerLeg = new THREE.Mesh(lowerLegGeo, legMat);
    lowerLeg.castShadow = true;
    lowerLeg.receiveShadow = true;
    root.add(lowerLeg);

    const foot = buildWebbedFoot();
    root.add(foot);

    legs.push({
      side: s,
      thighTuft,
      upperLeg,
      kneeJoint,
      lowerLeg,
      foot,
    });
  }

  // =========================================================================
  // 7. REAL-TIME KINEMATICS, SEAMLESS NECK DEFORMATION & SECONDARY MOTION
  // =========================================================================
  const _hip = new THREE.Vector3();
  const _ankle = new THREE.Vector3();
  const _knee = new THREE.Vector3();
  const _pole = new THREE.Vector3();
  const _shoulder = new THREE.Vector3();
  const _elbow = new THREE.Vector3();
  const _wrist = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _matTmp = new THREE.Matrix4();
  const _zTmp = new THREE.Vector3();
  const _yTmp = new THREE.Vector3();
  const _headEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const _headQuat = new THREE.Quaternion();
  const _torsoEuler = new THREE.Euler(0, 0, 0, 'XYZ');
  const _torsoQuat = new THREE.Quaternion();
  const _ringQuat = new THREE.Quaternion();
  const _torsoPivot = new THREE.Vector3(0.24, 0.88, 0);
  const _vLocal = new THREE.Vector3();
  const _vCenter = new THREE.Vector3();
  const _vNorm = new THREE.Vector3();
  const _vBin = new THREE.Vector3();
  const _tailAnchor = new THREE.Vector3();
  const _thighMid = new THREE.Vector3();

  // Helper to orient a wing segment whose +X runs from A to B with dorsal up-vector hint
  function orientWingSegment(obj, ptA, ptB, upHint) {
    obj.position.copy(ptA);
    _dir.subVectors(ptB, ptA).normalize();
    _zTmp.crossVectors(_dir, upHint).normalize();
    _yTmp.crossVectors(_zTmp, _dir).normalize();
    _matTmp.makeBasis(_dir, _yTmp, _zTmp);
    obj.quaternion.setFromRotationMatrix(_matTmp);
  }

  // Smooth periodic eyelid blink envelope (exact 12.0s loop periodic: blinks at t=2.3s, 6.7s, 10.4s)
  const BLINK_TIMES = [2.3, 6.7, 10.4];
  function evalBlink(t) {
    let b = 0;
    for (let i = 0; i < 3; i++) {
      const dt = Math.abs(t - BLINK_TIMES[i]);
      if (dt < 0.14) {
        const c = Math.cos((dt / 0.14) * Math.PI * 0.5);
        const v = c * c;
        if (v > b) b = v;
      }
    }
    return b;
  }

  const headRingIdx = Math.round(0.91 * RINGS);

  function update({
    t,
    timePhase,
    crankAngle,
    frameRoll,
    cobbleBounce,
    pedalTargetL,
    pedalTargetR,
    gripTargetL,
    gripTargetR,
  }) {
    // 1. Torso organic bob & sway synced smoothly to pedal stroke (zero allocations!)
    const pedalBob = Math.sin(crankAngle * 2.0 + 0.5) * 0.016 + cobbleBounce * 0.85;
    const torsoSwayZ = Math.sin(crankAngle) * 0.022;
    const torsoRoll = frameRoll * 1.15 + Math.sin(crankAngle) * 0.024;
    const torsoPitch = Math.sin(crankAngle * 2.0) * 0.016;

    // 2. Bird-like Head Stabilization
    const headBob = pedalBob * 0.22 + Math.sin(timePhase * 2.0) * 0.006;
    const headSwayZ = torsoSwayZ * 0.25;
    const headYaw = Math.sin(timePhase * 1.0 + 0.4) * 0.11 + Math.sin(timePhase * 2.0) * 0.04;
    const headPitch = Math.sin(timePhase * 2.0 + 0.9) * 0.032 - 0.025;
    const headRoll = Math.sin(timePhase * 1.0 - 0.3) * 0.025;

    // 3. Deform Continuous Torso -> S-Neck -> Head Mesh Seamlessly (0 heap allocations!)
    const arr = bodyPosAttr.array;
    let liveHeadCenterX = 0, liveHeadCenterY = 0, liveHeadCenterZ = 0;

    _headEuler.set(headRoll, headYaw, headPitch, 'YXZ');
    _headQuat.setFromEuler(_headEuler);
    _torsoEuler.set(torsoRoll, 0, torsoPitch, 'XYZ');
    _torsoQuat.setFromEuler(_torsoEuler);
    const sinCrank2 = Math.sin(crankAngle * 2.0);

    for (let i = 0; i <= RINGS; i++) {
      const rd = ringData[i];
      const u = rd.u;
      const headW = smoothstep(0.42, 0.82, u);
      const neckArc = Math.sin(headW * Math.PI);
      const neckFlexX = neckArc * (-pedalBob * 0.65 + sinCrank2 * 0.006);

      _vLocal.subVectors(rd.center, _torsoPivot).applyQuaternion(_torsoQuat).add(_torsoPivot);
      _vLocal.y += pedalBob;
      _vLocal.z += torsoSwayZ;

      _vCenter.subVectors(rd.center, headRestAnchor).applyQuaternion(_headQuat).add(headRestAnchor);
      _vCenter.y += headBob;
      _vCenter.z += headSwayZ;

      _vCenter.lerpVectors(_vLocal, _vCenter, headW);
      _vCenter.x += neckFlexX;

      _ringQuat.copy(_torsoQuat).slerp(_headQuat, headW);
      _vNorm.copy(rd.normal).applyQuaternion(_ringQuat);
      _vBin.copy(rd.binormal).applyQuaternion(_ringQuat);

      if (i === headRingIdx) {
        liveHeadCenterX = _vCenter.x;
        liveHeadCenterY = _vCenter.y;
        liveHeadCenterZ = _vCenter.z;
      }

      const baseIdx = i * stride;
      const offs = rd.offsets;
      const cx = _vCenter.x, cy = _vCenter.y, cz = _vCenter.z;
      const nx = _vNorm.x, ny = _vNorm.y, nz = _vNorm.z;
      const bx = _vBin.x, by = _vBin.y, bz = _vBin.z;
      for (let j = 0; j <= RADIAL; j++) {
        const dn = offs[j * 2];
        const db = offs[j * 2 + 1];
        const p = (baseIdx + j) * 3;
        arr[p]     = cx + nx * dn + bx * db;
        arr[p + 1] = cy + ny * dn + by * db;
        arr[p + 2] = cz + nz * dn + bz * db;
      }
    }
    bodyPosAttr.needsUpdate = true;
    bodyGeo.computeVertexNormals();

    // 4. Sync Head Group (Bill, Gular Pouch, Eyes, Eyelids, Crest)
    headGroup.position.set(liveHeadCenterX, liveHeadCenterY, liveHeadCenterZ);
    headGroup.quaternion.copy(_headQuat);

    const pouchFlutter = Math.sin(timePhase * 8.0) * 0.015 + Math.sin(timePhase * 16.0 + 0.5) * 0.008;
    pouchGroup.scale.set(1.0, 1.0 + pouchFlutter, 1.0 - pouchFlutter * 0.35);

    const blink = evalBlink(t);
    for (let i = 0; i < eyelidsUpper.length; i++) {
      eyelidsUpper[i].mesh.rotation.x = lerp(-0.74, 0.02, blink);
      eyelidsLower[i].mesh.rotation.x = lerp(0.84, 0.02, blink);
    }

    for (let i = 0; i < crestFeathers.length; i++) {
      const cf = crestFeathers[i];
      cf.mesh.rotation.z = cf.basePitch + Math.sin(timePhase * 6.0 + cf.phase) * 0.045;
    }

    // 5. Sync Fanned Tail to rump
    _tailAnchor.set(0.455, 0.955, 0).sub(_torsoPivot).applyQuaternion(_torsoQuat).add(_torsoPivot);
    tailGroup.position.set(_tailAnchor.x, _tailAnchor.y + pedalBob, _tailAnchor.z + torsoSwayZ);
    tailGroup.quaternion.copy(_torsoQuat);
    const tailBob = sinCrank2 * 0.022;
    for (let i = 0; i < tailFeathers.length; i++) {
      const tf = tailFeathers[i];
      tf.mesh.rotation.z = tf.basePitch + Math.sin(timePhase * 5.0 + tf.phase) * 0.028 + tailBob;
    }

    // 6. Solve Both Articulated Wings Sweeping Smoothly to Live Handlebar Grips
    for (let wi = 0; wi < wings.length; wi++) {
      const w = wings[wi];
      const s = w.side;
      const gripWorld = s > 0 ? gripTargetL : gripTargetR;

      _shoulder.set(0.185, 1.075, s * 0.132)
        .sub(_torsoPivot).applyQuaternion(_torsoQuat).add(_torsoPivot);
      _shoulder.y += pedalBob;
      _shoulder.z += torsoSwayZ;

      _elbow.set(
        lerp(_shoulder.x, gripWorld.x, 0.34) + 0.042,
        lerp(_shoulder.y, gripWorld.y, 0.58) - 0.015,
        s * 0.246 + torsoSwayZ * 0.45
      );

      _wrist.copy(gripWorld);
      _wrist.y += 0.013;
      _wrist.x += 0.010;

      orientWingSegment(w.upperWing, _shoulder, _elbow, _up);
      orientWingSegment(w.foreWing, _elbow, _wrist, _up);

      w.gripCapGroup.position.set(_elbow.distanceTo(_wrist), 0.0, 0.0);

      for (let fi = 0; fi < w.flutterFeathers.length; fi++) {
        const ff = w.flutterFeathers[fi];
        ff.mesh.rotation.z = ff.baseRotZ + Math.sin(timePhase * 6.0 + ff.phase) * ff.amp;
      }
    }

    // 7. Solve Exact 2-Bone Analytical IK for Both Pale-Orange Legs & Webbed Feet Locked to Pedals
    for (let li = 0; li < legs.length; li++) {
      const leg = legs[li];
      const s = leg.side;
      const pedalWorld = s > 0 ? pedalTargetL : pedalTargetR;

      _hip.set(0.228, 0.878, s * 0.098)
        .sub(_torsoPivot).applyQuaternion(_torsoQuat).add(_torsoPivot);
      _hip.y += pedalBob;
      _hip.z += torsoSwayZ;

      _ankle.copy(pedalWorld);
      _ankle.y += 0.020;

      _pole.set(-1.0, 0.24, s * 0.28).normalize();
      solve2BoneIK(_hip, _ankle, L1, L2, _pole, _knee);

      alignBetween(leg.upperLeg, _hip, _knee, true);
      leg.kneeJoint.position.copy(_knee);
      alignBetween(leg.lowerLeg, _knee, _ankle, true);

      _thighMid.copy(_hip).lerp(_knee, 0.24);
      alignBetween(leg.thighTuft, _thighMid, _hip, false);

      const phase = s > 0 ? crankAngle : crankAngle + Math.PI;
      leg.foot.position.copy(_ankle);
      leg.foot.rotation.set(0, s * 0.04, Math.sin(phase) * 0.11 - 0.04);
    }
  }

  return {
    root,
    update,
    sssUniforms,
  };
}
