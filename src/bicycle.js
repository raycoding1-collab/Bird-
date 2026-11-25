import * as THREE from 'three';
import {
  BIKE_DIMS,
  WHEEL_RADIUS,
  createTaperedTube,
  alignBetween,
  clamp,
  smoothstep,
} from './utils.js';
import {
  createWickerTextures,
  createLeatherTextures,
  createBaguetteTextures,
  createTireTextures,
  createGinghamTexture,
  createContactShadowTexture,
} from './textures.js';

/**
 * Builds a finely proportioned vintage cherry-red step-through cruiser bicycle
 * facing -X (riding right-to-left) with woven wicker bakery basket, crusty French
 * baguettes, herbs, and grounded tire contact shadows.
 */
export function createBicycle() {
  const root = new THREE.Group();
  root.name = 'BicycleRoot';

  // Steering assembly pivots around head tube axis!
  const frameGroup = new THREE.Group();
  root.add(frameGroup);

  // --- High-Craft PBR Materials ---
  const paintMat = new THREE.MeshPhysicalMaterial({
    color: 0xb8141e,
    metalness: 0.24,
    roughness: 0.17,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.65,
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xeef1f5,
    metalness: 0.96,
    roughness: 0.11,
    envMapIntensity: 1.8,
  });

  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x2a2c30,
    metalness: 0.78,
    roughness: 0.36,
    envMapIntensity: 1.1,
  });

  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xdca742,
    metalness: 0.92,
    roughness: 0.18,
    envMapIntensity: 1.6,
  });

  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x222225,
    roughness: 0.88,
    metalness: 0.02,
  });

  const redGripMat = new THREE.MeshStandardMaterial({
    color: 0xa41620,
    roughness: 0.68,
    metalness: 0.02,
  });

  const creamStripeMat = new THREE.MeshStandardMaterial({
    color: 0xf4ead5,
    roughness: 0.35,
    metalness: 0.05,
  });

  const tireTex = createTireTextures();
  const tireMat = new THREE.MeshStandardMaterial({
    map: tireTex.map,
    normalMap: tireTex.normalMap,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughnessMap: tireTex.roughnessMap,
    roughness: 1.0,
    metalness: 0.02,
  });

  const leatherTex = createLeatherTextures();
  const leatherMat = new THREE.MeshStandardMaterial({
    map: leatherTex.map,
    normalMap: leatherTex.normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughnessMap: leatherTex.roughnessMap,
    roughness: 0.92,
    metalness: 0.04,
  });

  const wickerTex = createWickerTextures();
  wickerTex.map.repeat.set(2.4, 1.3);
  wickerTex.normalMap.repeat.set(2.4, 1.3);
  wickerTex.roughnessMap.repeat.set(2.4, 1.3);
  const wickerMat = new THREE.MeshStandardMaterial({
    map: wickerTex.map,
    normalMap: wickerTex.normalMap,
    normalScale: new THREE.Vector2(1.4, 1.4),
    roughnessMap: wickerTex.roughnessMap,
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const baguetteTex = createBaguetteTextures();
  const baguetteMat = new THREE.MeshStandardMaterial({
    map: baguetteTex.map,
    normalMap: baguetteTex.normalMap,
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughnessMap: baguetteTex.roughnessMap,
    roughness: 0.92,
    metalness: 0.0,
  });

  const ginghamMat = new THREE.MeshStandardMaterial({
    map: createGinghamTexture(),
    roughness: 0.88,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const herbMat = new THREE.MeshStandardMaterial({
    color: 0x3b7a36,
    roughness: 0.62,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const herbLightMat = new THREE.MeshStandardMaterial({
    color: 0x5d9d45,
    roughness: 0.58,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  // Helper to add shadow-casting mesh
  function addMesh(parent, geo, mat, cast = true, recv = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = recv;
    parent.add(m);
    return m;
  }

  function addTube(parent, points, radius, mat, segs = 28, radSegs = 12) {
    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, segs, radius, radSegs, false);
    return addMesh(parent, geo, mat);
  }

  // =========================================================================
  // 1. WHEELS (Cream white-wall tires, chrome rims, hubs, 28 crossed spokes)
  // =========================================================================
  function buildWheel(isRear) {
    const wGroup = new THREE.Group();
    const tireTubeR = 0.032; // tire cross-section radius
    const torusMajorR = WHEEL_RADIUS - tireTubeR; // 0.308m -> outer radius === 0.340m EXACTLY!

    // Tire (torus in XY plane, outer edge = WHEEL_RADIUS)
    const tireGeo = new THREE.TorusGeometry(torusMajorR, tireTubeR, 24, 64);
    addMesh(wGroup, tireGeo, tireMat);

    // Chrome rim (slightly recessed inside tire bead)
    const rimR = torusMajorR - 0.020;
    const rimGeo = new THREE.TorusGeometry(rimR, 0.013, 14, 56);
    addMesh(wGroup, rimGeo, chromeMat);

    // Rim inner spoke bed band
    const rimBedGeo = new THREE.CylinderGeometry(rimR - 0.008, rimR - 0.008, 0.022, 48, 1, true);
    rimBedGeo.rotateX(Math.PI / 2);
    addMesh(wGroup, rimBedGeo, chromeMat, false, true);

    // Hub shell + flanges + axle nuts
    const hubW = isRear ? 0.095 : 0.078;
    const hubGeo = new THREE.CylinderGeometry(0.017, 0.017, hubW, 18);
    hubGeo.rotateX(Math.PI / 2);
    addMesh(wGroup, hubGeo, chromeMat);

    for (const s of [-1, 1]) {
      const flangeGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.004, 24);
      flangeGeo.rotateX(Math.PI / 2);
      const fl = addMesh(wGroup, flangeGeo, chromeMat);
      fl.position.z = s * (hubW * 0.38);

      const nutGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.016, 6);
      nutGeo.rotateX(Math.PI / 2);
      const nut = addMesh(wGroup, nutGeo, chromeMat);
      nut.position.z = s * (hubW * 0.56);
    }

    // 28 thin cross-laced metallic chrome spokes batched into ONE InstancedMesh draw call (identical visual quality, 28x fewer draw calls!)
    const spokeCount = 28;
    const spokeGeo = new THREE.CylinderGeometry(0.0014, 0.0014, 1.0, 5);
    const spokeInst = new THREE.InstancedMesh(spokeGeo, chromeMat, spokeCount);
    spokeInst.castShadow = true;
    const spDummy = new THREE.Object3D();
    const pA = new THREE.Vector3();
    const pB = new THREE.Vector3();
    for (let i = 0; i < spokeCount; i++) {
      const side = (i & 1) ? 1 : -1;
      const crossDir = ((i >> 1) & 1) ? 1 : -1;
      const rimAng = (i / spokeCount) * Math.PI * 2;
      const hubAng = rimAng + crossDir * 0.42;

      pA.set(Math.cos(hubAng) * 0.024, Math.sin(hubAng) * 0.024, side * (hubW * 0.37));
      pB.set(Math.cos(rimAng) * (rimR - 0.006), Math.sin(rimAng) * (rimR - 0.006), side * 0.003);

      alignBetween(spDummy, pA, pB, true);
      spDummy.updateMatrix();
      spokeInst.setMatrixAt(i, spDummy.matrix);
    }
    spokeInst.instanceMatrix.needsUpdate = true;
    wGroup.add(spokeInst);

    // Tire inflation valve stem
    const valveGeo = new THREE.CylinderGeometry(0.0028, 0.0032, 0.035, 8);
    const valve = addMesh(wGroup, valveGeo, brassMat, false, false);
    valve.position.set(0, rimR - 0.025, 0);

    // Rear freewheel sprocket cog on right side (-Z? Wait: let's put drivetrain on camera-facing +Z side OR authentic right side!)
    // Bike faces -X, so its RIGHT side is -Z (away from camera) and LEFT side is +Z (camera side).
    // Wait: in classic film framing of a bike riding right-to-left, putting the gleaming chrome chainring
    // and taut chain on the camera-facing (+Z) side looks SO much richer visually (let's verify: the prompt specifically says
    // "chainring, crank arms, pedals, taut chain" and asks for a low side close-up inspecting the crankset!).
    // Placing the chainring & taut chain on the +Z (camera-facing) side guarantees it is showcased in full glory in both the hero and close-up shots!
    if (isRear) {
      const cogGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.007, 22);
      cogGeo.rotateX(Math.PI / 2);
      const cog = addMesh(wGroup, cogGeo, darkMetalMat);
      cog.position.z = 0.044;
    }

    return wGroup;
  }

  const rearWheel = buildWheel(true);
  rearWheel.position.set(BIKE_DIMS.rearAxleX, BIKE_DIMS.axleY, 0);
  frameGroup.add(rearWheel);

  // =========================================================================
  // 2. CURVED STEP-THROUGH CHERRY-RED FRAME & CHROME LUGS
  // =========================================================================
  const bb = new THREE.Vector3(BIKE_DIMS.bbX, BIKE_DIMS.bbY, 0);
  const htBot = BIKE_DIMS.headTubeBottom.clone();
  const htTop = BIKE_DIMS.headTubeTop.clone();
  const seatCluster = new THREE.Vector3(0.215, 0.725, 0);
  const rearAxle = new THREE.Vector3(BIKE_DIMS.rearAxleX, BIKE_DIMS.axleY, 0);

  // Head tube (cherry red with chrome headset cups top & bottom)
  addTube(frameGroup, [htBot, htTop], 0.019, paintMat, 8, 16);
  for (const pt of [htBot, htTop]) {
    const cup = addMesh(frameGroup, new THREE.CylinderGeometry(0.0225, 0.0225, 0.018, 18), chromeMat);
    cup.position.copy(pt);
    cup.rotation.z = -0.31;
  }

  // Seat tube (bottom bracket -> seat cluster)
  addTube(frameGroup, [bb, seatCluster], 0.016, paintMat, 12, 16);
  // Chrome seat clamp collar
  const clampCollar = addMesh(frameGroup, new THREE.CylinderGeometry(0.020, 0.020, 0.022, 16), chromeMat);
  clampCollar.position.copy(seatCluster);
  clampCollar.rotation.z = -0.30;

  // Bottom bracket shell (wider horizontal cylinder)
  const bbShell = addMesh(frameGroup, new THREE.CylinderGeometry(0.025, 0.025, 0.076, 18), paintMat);
  bbShell.rotation.x = Math.PI / 2;
  bbShell.position.copy(bb);

  // Iconic Step-Through Graceful Curved Double Down-Tubes
  const upperStepCurve = [
    htTop.clone().lerp(htBot, 0.25),
    new THREE.Vector3(-0.22, 0.56, 0),
    new THREE.Vector3(-0.04, 0.45, 0),
    seatCluster.clone().lerp(bb, 0.52),
  ];
  addTube(frameGroup, upperStepCurve, 0.0145, paintMat, 28, 14);

  const lowerStepCurve = [
    htBot.clone().lerp(htTop, 0.14),
    new THREE.Vector3(-0.24, 0.43, 0),
    new THREE.Vector3(-0.08, 0.33, 0),
    bb.clone(),
  ];
  addTube(frameGroup, lowerStepCurve, 0.016, paintMat, 28, 14);

  // Small vertical reinforcing brace between the two curved step-through tubes
  addTube(frameGroup, [new THREE.Vector3(-0.15, 0.37, 0), new THREE.Vector3(-0.12, 0.50, 0)], 0.0085, paintMat, 6, 10);

  // Chainstays & Seatstays (both left +Z and right -Z sides)
  for (const s of [-1, 1]) {
    // Chainstay: BB -> rear dropout
    addTube(
      frameGroup,
      [
        new THREE.Vector3(bb.x + 0.01, bb.y, s * 0.026),
        new THREE.Vector3(0.30, 0.305, s * 0.048),
        new THREE.Vector3(rearAxle.x, rearAxle.y, s * 0.052),
      ],
      0.010,
      paintMat,
      16,
      10
    );
    // Seatstay: seat cluster -> rear dropout
    addTube(
      frameGroup,
      [
        new THREE.Vector3(seatCluster.x + 0.005, seatCluster.y - 0.015, s * 0.016),
        new THREE.Vector3(0.38, 0.54, s * 0.044),
        new THREE.Vector3(rearAxle.x, rearAxle.y, s * 0.052),
      ],
      0.0085,
      paintMat,
      16,
      10
    );
  }

  // =========================================================================
  // 3. CURVED FENDERS WITH METAL STAYS & CREAM PINSTRIPE
  // =========================================================================
  function buildFender(cx, cy, startAng, endAng, includeReflector = false) {
    const fGroup = new THREE.Group();
    const fenderR = WHEEL_RADIUS + 0.020; // crisp 2cm clearance over tire!
    const halfW = 0.036;
    const segU = 34;
    const segV = 8;

    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= segU; i++) {
      const u = i / segU;
      const ang = startAng + (endAng - startAng) * u;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);

      for (let j = 0; j <= segV; j++) {
        const v = j / segV;
        const s = (v - 0.5) * 2; // -1..1 across fender width
        // C-channel mudguard profile wrapping slightly down around tire shoulders
        const radialDip = (1 - Math.sqrt(Math.max(0.05, 1 - 0.72 * s * s))) * 0.026;
        const r = fenderR - radialDip;
        const x = cx + cosA * r;
        const y = cy + sinA * r;
        const z = s * halfW;

        positions.push(x, y, z);
        uvs.push(u, v);
        normals.push(cosA, sinA, s * 0.5);
      }
    }

    const stride = segV + 1;
    for (let i = 0; i < segU; i++) {
      for (let j = 0; j < segV; j++) {
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
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const fenderMat = paintMat.clone();
    fenderMat.side = THREE.DoubleSide;
    addMesh(fGroup, geo, fenderMat);

    // Vintage cream pinstripe down the center spine of the fender
    const stripePts = [];
    for (let i = 0; i <= 20; i++) {
      const ang = startAng + (endAng - startAng) * (i / 20);
      stripePts.push(new THREE.Vector3(cx + Math.cos(ang) * (fenderR + 0.0018), cy + Math.sin(ang) * (fenderR + 0.0018), 0));
    }
    addTube(fGroup, stripePts, 0.0022, creamStripeMat, 20, 6);

    // Chrome mounting stays from axle to fender edges
    const stayAngles = includeReflector ? [startAng + 0.22, startAng + 0.95] : [startAng + 0.25, endAng - 0.28];
    const stayGeo = new THREE.CylinderGeometry(0.0022, 0.0022, 1.0, 6);
    const pAxle = new THREE.Vector3();
    const pRim = new THREE.Vector3();
    for (const sAng of stayAngles) {
      for (const s of [-1, 1]) {
        pAxle.set(cx, cy, s * 0.052);
        pRim.set(cx + Math.cos(sAng) * (fenderR - 0.008), cy + Math.sin(sAng) * (fenderR - 0.008), s * (halfW - 0.004));
        const st = addMesh(fGroup, stayGeo, chromeMat, false, false);
        alignBetween(st, pAxle, pRim, true);
      }
    }

    // Jeweled ruby rear reflector
    if (includeReflector) {
      const rAng = startAng + 0.30;
      const refGroup = new THREE.Group();
      refGroup.position.set(cx + Math.cos(rAng) * (fenderR + 0.006), cy + Math.sin(rAng) * (fenderR + 0.006), 0);
      refGroup.rotation.z = rAng - Math.PI / 2;
      addMesh(refGroup, new THREE.CylinderGeometry(0.015, 0.017, 0.012, 16), chromeMat);
      const rubyMat = new THREE.MeshPhysicalMaterial({
        color: 0xcc1118,
        emissive: 0x380305,
        roughness: 0.12,
        clearcoat: 1.0,
      });
      const lens = addMesh(refGroup, new THREE.CylinderGeometry(0.012, 0.012, 0.015, 16), rubyMat);
      lens.position.y = 0.003;
      fGroup.add(refGroup);
    }

    return fGroup;
  }

  // Rear fender spans from rear lower (-0.12 rad) over top to seat tube (Math.PI * 1.05)
  frameGroup.add(buildFender(BIKE_DIMS.rearAxleX, BIKE_DIMS.axleY, -0.18, Math.PI * 1.02, true));

  // =========================================================================
  // 4. REAR CARRIER RACK
  // =========================================================================
  const rackY = 0.745;
  const rackMat = paintMat;
  for (const s of [-1, 1]) {
    // Top rails
    addTube(frameGroup, [
      new THREE.Vector3(0.24, rackY, s * 0.062),
      new THREE.Vector3(0.76, rackY, s * 0.062),
    ], 0.0055, rackMat, 6, 8);
    // Diagonal rear rack legs down to rear axle
    addTube(frameGroup, [
      new THREE.Vector3(0.72, rackY, s * 0.062),
      new THREE.Vector3(BIKE_DIMS.rearAxleX, BIKE_DIMS.axleY, s * 0.056),
    ], 0.005, rackMat, 6, 8);
    addTube(frameGroup, [
      new THREE.Vector3(0.48, rackY, s * 0.062),
      new THREE.Vector3(BIKE_DIMS.rearAxleX, BIKE_DIMS.axleY, s * 0.056),
    ], 0.0045, rackMat, 6, 8);
  }
  // Crossbars on rear rack
  for (const rx of [0.27, 0.42, 0.58, 0.75]) {
    addTube(frameGroup, [
      new THREE.Vector3(rx, rackY, -0.062),
      new THREE.Vector3(rx, rackY, 0.062),
    ], 0.0048, rackMat, 4, 8);
  }
  // Chrome spring bail on rear rack
  addTube(frameGroup, [
    new THREE.Vector3(0.32, rackY + 0.005, -0.048),
    new THREE.Vector3(0.62, rackY + 0.018, -0.045),
    new THREE.Vector3(0.65, rackY + 0.018, 0.0),
    new THREE.Vector3(0.62, rackY + 0.018, 0.045),
    new THREE.Vector3(0.32, rackY + 0.005, 0.048),
  ], 0.003, chromeMat, 18, 6);

  // =========================================================================
  // 5. STITCHED BROWN LEATHER CRUISER SADDLE WITH CHROME COIL SPRINGS
  // =========================================================================
  const saddleGroup = new THREE.Group();
  frameGroup.add(saddleGroup);

  // Chrome seatpost
  addTube(saddleGroup, [seatCluster, new THREE.Vector3(0.24, 0.805, 0)], 0.0115, chromeMat, 6, 12);

  // Sculpted organic leather saddle shell (wide rounded rear, tapered nose pointing -X)
  const saddlePos = [];
  const saddleUvs = [];
  const saddleIdx = [];
  const sSegU = 18, sSegV = 14;
  for (let i = 0; i <= sSegU; i++) {
    const u = i / sSegU; // 0 = front nose (-X), 1 = wide rear (+X)
    const x = -0.13 + u * 0.25;
    // Classic Brooks cruiser saddle width profile
    const halfW = 0.022 + 0.088 * Math.pow(smoothstep(0.05, 0.88, u), 1.35) * smoothstep(1.04, 0.82, u);
    const crownY = 0.012 * Math.sin(u * Math.PI) + 0.012 * smoothstep(0.6, 1.0, u);

    for (let j = 0; j <= sSegV; j++) {
      const v = j / sSegV;
      const s = (v - 0.5) * 2; // -1..1
      const z = s * halfW;
      // Arched cushion top curving into leather skirt sides
      const archY = Math.cos(s * Math.PI * 0.5) * 0.026 - Math.pow(Math.abs(s), 3) * 0.018;
      saddlePos.push(x, crownY + archY, z);
      saddleUvs.push(u, v);
    }
  }
  const sStride = sSegV + 1;
  for (let i = 0; i < sSegU; i++) {
    for (let j = 0; j < sSegV; j++) {
      const a = i * sStride + j;
      const b = (i + 1) * sStride + j;
      const c = (i + 1) * sStride + (j + 1);
      const d = i * sStride + (j + 1);
      saddleIdx.push(a, d, b, b, d, c);
    }
  }
  const saddleGeo = new THREE.BufferGeometry();
  saddleGeo.setAttribute('position', new THREE.Float32BufferAttribute(saddlePos, 3));
  saddleGeo.setAttribute('uv', new THREE.Float32BufferAttribute(saddleUvs, 2));
  saddleGeo.setIndex(saddleIdx);
  saddleGeo.computeVertexNormals();
  const saddleTop = addMesh(saddleGroup, saddleGeo, leatherMat);
  saddleTop.position.set(BIKE_DIMS.saddleX, BIKE_DIMS.saddleY, 0);

  // Brass saddle rivets along the rear skirt
  for (let r = -2; r <= 2; r++) {
    const ang = r * 0.34;
    const riv = addMesh(saddleGroup, new THREE.SphereGeometry(0.0045, 8, 6), brassMat, false, false);
    riv.position.set(
      BIKE_DIMS.saddleX + 0.095 + Math.cos(ang) * 0.015,
      BIKE_DIMS.saddleY + 0.022,
      Math.sin(ang) * 0.072
    );
  }

  // Twin chrome cruiser coil springs under the rear of the saddle
  for (const s of [-1, 1]) {
    const coilPts = [];
    const turns = 4.5;
    for (let k = 0; k <= 36; k++) {
      const t = k / 36;
      const a = t * turns * Math.PI * 2;
      coilPts.push(new THREE.Vector3(
        BIKE_DIMS.saddleX + 0.07 + Math.cos(a) * 0.016,
        BIKE_DIMS.saddleY - 0.052 + t * 0.052,
        s * 0.044 + Math.sin(a) * 0.016
      ));
    }
    addTube(saddleGroup, coilPts, 0.0032, chromeMat, 36, 6);
  }

  // =========================================================================
  // 6. DRIVETRAIN: CHAINRING, CRANK ARMS, COUNTER-ROTATING PEDALS, TAUT CHAIN
  // =========================================================================
  const crankPivot = new THREE.Group();
  crankPivot.position.copy(bb);
  frameGroup.add(crankPivot);

  // Chrome vintage chainring on +Z (camera-facing side so every detail shines!)
  const chainZ = 0.052;
  const ringR = 0.088;
  const ringOuter = addMesh(crankPivot, new THREE.TorusGeometry(ringR, 0.0055, 10, 44), chromeMat);
  ringOuter.position.z = chainZ;
  const ringInner = addMesh(crankPivot, new THREE.TorusGeometry(ringR * 0.54, 0.0045, 8, 28), chromeMat);
  ringInner.position.z = chainZ;

  // 5 vintage spider spokes + subtle teeth around chainring
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = addMesh(crankPivot, new THREE.BoxGeometry(ringR * 0.92, 0.011, 0.004), chromeMat);
    arm.position.set(Math.cos(a) * ringR * 0.48, Math.sin(a) * ringR * 0.48, chainZ);
    arm.rotation.z = a;
  }
  const toothGeo = new THREE.BoxGeometry(0.009, 0.005, 0.003);
  const toothInst = new THREE.InstancedMesh(toothGeo, chromeMat, 36);
  const tDummy = new THREE.Object3D();
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    tDummy.position.set(Math.cos(a) * (ringR + 0.006), Math.sin(a) * (ringR + 0.006), chainZ);
    tDummy.rotation.set(0, 0, a);
    tDummy.scale.set(1, 1, 1);
    tDummy.updateMatrix();
    toothInst.setMatrixAt(i, tDummy.matrix);
  }
  toothInst.instanceMatrix.needsUpdate = true;
  crankPivot.add(toothInst);

  // Left (+Z, camera side) and Right (-Z, far side) Crank Arms & Counter-Rotating Pedals
  function buildPedalAssembly() {
    const pGroup = new THREE.Group();
    // Chrome spindle
    const spindle = addMesh(pGroup, new THREE.CylinderGeometry(0.0045, 0.0045, 0.095, 8), chromeMat);
    spindle.rotation.x = Math.PI / 2;
    // Ribbed black rubber blocks + chrome end-plates
    for (const dx of [-0.032, 0.032]) {
      const blk = addMesh(pGroup, new THREE.BoxGeometry(0.022, 0.018, 0.086), rubberMat);
      blk.position.x = dx;
    }
    for (const dz of [-0.044, 0.044]) {
      const plate = addMesh(pGroup, new THREE.BoxGeometry(0.092, 0.016, 0.004), chromeMat);
      plate.position.z = dz;
    }
    // Amber pedal side reflectors
    const amberMat = new THREE.MeshStandardMaterial({ color: 0xe68b1c, roughness: 0.25, metalness: 0.1 });
    for (const dx of [-0.046, 0.046]) {
      const ref = addMesh(pGroup, new THREE.BoxGeometry(0.003, 0.010, 0.042), amberMat, false, false);
      ref.position.x = dx;
    }
    return pGroup;
  }

  // Left crank arm (+Z, phase 0)
  const crankGeo = new THREE.BoxGeometry(BIKE_DIMS.crankRadius + 0.018, 0.017, 0.010);
  const crankL = addMesh(crankPivot, crankGeo, chromeMat);
  crankL.position.set(BIKE_DIMS.crankRadius * 0.5, 0, BIKE_DIMS.crankOffsetZ);

  // Right crank arm (-Z, 180° opposed)
  const crankR = addMesh(crankPivot, crankGeo, chromeMat);
  crankR.position.set(-BIKE_DIMS.crankRadius * 0.5, 0, -BIKE_DIMS.crankOffsetZ);

  const pedalL = buildPedalAssembly();
  pedalL.position.set(BIKE_DIMS.crankRadius, 0, BIKE_DIMS.pedalOffsetZ);
  crankPivot.add(pedalL);

  const pedalR = buildPedalAssembly();
  pedalR.position.set(-BIKE_DIMS.crankRadius, 0, -BIKE_DIMS.pedalOffsetZ);
  crankPivot.add(pedalR);

  // Taut Roller-Link Bicycle Chain looping tightly around front chainring and rear cog!
  const chainGroup = new THREE.Group();
  frameGroup.add(chainGroup);
  const rearCogCenter = new THREE.Vector3(BIKE_DIMS.rearAxleX, BIKE_DIMS.axleY, chainZ - 0.004);
  const frontRingCenter = new THREE.Vector3(bb.x, bb.y, chainZ);
  const rFront = ringR + 0.004;
  const rRear = 0.039;

  // Compute tangent points for upper & lower taut chain runs
  const dxChain = rearCogCenter.x - frontRingCenter.x;
  const dyChain = rearCogCenter.y - frontRingCenter.y;
  const distChain = Math.hypot(dxChain, dyChain);
  const baseAng = Math.atan2(dyChain, dxChain);
  const beta = Math.asin(clamp((rFront - rRear) / distChain, -0.95, 0.95));

  const chainPoints = [];
  // Front wrap arc (left side of chainring)
  const aStart = baseAng + Math.PI * 0.5 - beta;
  const aEnd = baseAng + Math.PI * 1.5 + beta;
  for (let i = 0; i <= 14; i++) {
    const a = aStart + (aEnd - aStart) * (i / 14);
    chainPoints.push(new THREE.Vector3(
      frontRingCenter.x + Math.cos(a) * rFront,
      frontRingCenter.y + Math.sin(a) * rFront,
      chainZ
    ));
  }
  // Rear wrap arc (right side of rear cog)
  const bStart = baseAng - Math.PI * 0.5 + beta;
  const bEnd = baseAng + Math.PI * 0.5 - beta;
  for (let i = 0; i <= 10; i++) {
    const a = bStart + (bEnd - bStart) * (i / 10);
    chainPoints.push(new THREE.Vector3(
      rearCogCenter.x + Math.cos(a) * rRear,
      rearCogCenter.y + Math.sin(a) * rRear,
      chainZ - 0.004
    ));
  }
  const chainCurve = new THREE.CatmullRomCurve3(chainPoints, true, 'catmullrom', 0.15);
  // Subtle dark roller core + instanced metallic chain links animated along curve!
  addMesh(chainGroup, new THREE.TubeGeometry(chainCurve, 80, 0.0038, 6, true), darkMetalMat, true, false);

  const LINK_COUNT = 78;
  const linkGeo = new THREE.BoxGeometry(0.011, 0.0075, 0.007);
  const chainInst = new THREE.InstancedMesh(linkGeo, darkMetalMat, LINK_COUNT);
  chainInst.castShadow = false;
  chainGroup.add(chainInst);

  // Sleek cherry-red upper hockey-stick chainguard (leaves lower chain & chainring visible!)
  addTube(
    frameGroup,
    [
      new THREE.Vector3(bb.x - 0.04, bb.y + 0.095, chainZ + 0.016),
      new THREE.Vector3(bb.x + 0.05, bb.y + 0.105, chainZ + 0.016),
      new THREE.Vector3(0.32, 0.395, chainZ + 0.014),
      new THREE.Vector3(0.51, 0.392, chainZ + 0.012),
    ],
    0.012,
    paintMat,
    18,
    10
  );

  // =========================================================================
  // 7. STEERING ASSEMBLY (Front Fork, Front Wheel, Front Fender, Swept Handlebars, Brass Bell, Basket!)
  // =========================================================================
  const steerPivot = new THREE.Group();
  // Pivot at center of head tube, tilted to match head tube angle!
  const htCenter = htBot.clone().lerp(htTop, 0.5);
  const htAxis = htTop.clone().sub(htBot).normalize();
  const htAngle = Math.atan2(-htAxis.x, htAxis.y); // tilt angle around Z
  steerPivot.position.copy(htCenter);
  frameGroup.add(steerPivot);

  // Inner steering content in world-aligned coordinates relative to htCenter
  const steerContent = new THREE.Group();
  steerContent.position.copy(htCenter).negate();
  steerPivot.add(steerContent);

  // Front Wheel inside steerContent
  const frontWheel = buildWheel(false);
  frontWheel.position.set(BIKE_DIMS.frontAxleX, BIKE_DIMS.axleY, 0);
  steerContent.add(frontWheel);

  // Front Fender inside steerContent
  steerContent.add(buildFender(BIKE_DIMS.frontAxleX, BIKE_DIMS.axleY, Math.PI * 0.05, Math.PI * 1.15, false));

  // Front Fork Crown & Graceful Curved Fork Blades
  const crown = addMesh(steerContent, new THREE.BoxGeometry(0.032, 0.022, 0.082), chromeMat);
  crown.position.set(htBot.x - 0.01, htBot.y - 0.015, 0);
  crown.rotation.z = -0.30;

  for (const s of [-1, 1]) {
    addTube(
      steerContent,
      [
        new THREE.Vector3(htBot.x - 0.01, htBot.y - 0.02, s * 0.036),
        new THREE.Vector3(-0.46, 0.43, s * 0.043),
        new THREE.Vector3(BIKE_DIMS.frontAxleX, BIKE_DIMS.axleY, s * 0.046),
      ],
      0.010,
      paintMat,
      16,
      10
    );
  }

  // Classic Chrome Bullet Headlamp on front fork crown
  const lampGroup = new THREE.Group();
  lampGroup.position.set(htBot.x - 0.068, htBot.y + 0.025, 0);
  steerContent.add(lampGroup);
  addTube(lampGroup, [new THREE.Vector3(0.055, -0.04, 0), new THREE.Vector3(0.01, -0.022, 0)], 0.004, chromeMat, 4, 8);
  const lampBody = addMesh(lampGroup, new THREE.SphereGeometry(0.028, 16, 12), chromeMat);
  lampBody.scale.set(1.45, 1.0, 1.0);
  const lampGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xfff8e6,
    emissive: 0xffe4aa,
    emissiveIntensity: 0.25,
    roughness: 0.08,
    clearcoat: 1.0,
  });
  const lampLens = addMesh(lampGroup, new THREE.CylinderGeometry(0.025, 0.025, 0.008, 18), lampGlassMat);
  lampLens.rotation.z = Math.PI / 2;
  lampLens.position.x = -0.036;

  // Swept-Back Chrome Cruiser Handlebars & Red Grips
  const stemTop = new THREE.Vector3(-0.315, 0.945, 0);
  addTube(steerContent, [htTop, stemTop], 0.0115, chromeMat, 8, 12);
  addTube(steerContent, [stemTop, new THREE.Vector3(-0.345, 0.955, 0)], 0.012, chromeMat, 6, 12);

  // Swept-back bar curve left (+Z) and right (-Z) ending right at BIKE_DIMS.gripPosL / gripPosR!
  const gripAnchorL = new THREE.Object3D();
  gripAnchorL.position.copy(BIKE_DIMS.gripPosL);
  steerContent.add(gripAnchorL);

  const gripAnchorR = new THREE.Object3D();
  gripAnchorR.position.copy(BIKE_DIMS.gripPosR);
  steerContent.add(gripAnchorR);

  for (const s of [-1, 1]) {
    const barPts = [
      new THREE.Vector3(-0.345, 0.955, 0),
      new THREE.Vector3(-0.340, 0.962, s * 0.12),
      new THREE.Vector3(-0.275, 0.972, s * 0.225),
      new THREE.Vector3(-0.185, 0.968, s * 0.246),
      new THREE.Vector3(-0.100, 0.956, s * 0.242),
    ];
    addTube(steerContent, barPts, 0.0105, chromeMat, 24, 12);

    // Ribbed vintage cherry-red rubber grip over the back section of the handlebar
    const gripCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.215, 0.970, s * 0.244),
      new THREE.Vector3(-0.155, 0.965, s * 0.245),
      new THREE.Vector3(-0.095, 0.955, s * 0.241),
    ]);
    addMesh(steerContent, new THREE.TubeGeometry(gripCurve, 12, 0.0155, 14, false), redGripMat);
    // Grip end cap
    const cap = addMesh(steerContent, new THREE.SphereGeometry(0.0155, 12, 10), redGripMat);
    cap.position.set(-0.095, 0.955, s * 0.241);

    // Chrome brake lever tucked just under the forward sweep
    addTube(
      steerContent,
      [
        new THREE.Vector3(-0.235, 0.958, s * 0.238),
        new THREE.Vector3(-0.265, 0.935, s * 0.222),
        new THREE.Vector3(-0.190, 0.928, s * 0.235),
      ],
      0.004,
      chromeMat,
      10,
      8
    );
  }

  // Polished Brass Cruiser Bell on camera-facing (+Z) bar curve
  const bellGroup = new THREE.Group();
  bellGroup.position.set(-0.295, 0.985, 0.175);
  steerContent.add(bellGroup);
  const bellDome = addMesh(bellGroup, new THREE.SphereGeometry(0.024, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), brassMat);
  bellDome.position.y = 0.002;
  addMesh(bellGroup, new THREE.CylinderGeometry(0.022, 0.022, 0.010, 16), chromeMat);
  const striker = addMesh(bellGroup, new THREE.BoxGeometry(0.006, 0.005, 0.022), brassMat);
  striker.position.set(0.018, 0.006, 0.012);

  // Subtle curved dark brake cable looping gracefully to the front fork
  addTube(
    steerContent,
    [
      new THREE.Vector3(-0.245, 0.945, 0.225),
      new THREE.Vector3(-0.34, 0.86, 0.12),
      new THREE.Vector3(-0.39, 0.72, 0.045),
      new THREE.Vector3(-0.44, 0.54, 0.02),
    ],
    0.0026,
    rubberMat,
    18,
    6
  );

  // =========================================================================
  // 8. FRONT WOVEN WICKER BAKERY BASKET + BAGUETTES & HERBS
  // =========================================================================
  const basketGroup = new THREE.Group();
  basketGroup.position.set(-0.525, 0.775, 0);
  steerContent.add(basketGroup);

  // Chrome basket support brackets down to front axle & head tube
  for (const s of [-1, 1]) {
    addTube(
      steerContent,
      [
        new THREE.Vector3(-0.50, 0.655, s * 0.095),
        new THREE.Vector3(BIKE_DIMS.frontAxleX, BIKE_DIMS.axleY, s * 0.050),
      ],
      0.0042,
      chromeMat,
      8,
      8
    );
    // Leather mounting straps buckling basket to handlebar stem
    const strap = addMesh(basketGroup, new THREE.BoxGeometry(0.014, 0.085, 0.020), leatherMat);
    strap.position.set(0.115, 0.085, s * 0.085);
    strap.rotation.z = -0.35;
  }

  // Tapered rounded-rectangle wicker basket body (smooth lofted 36-segment perimeter)
  function buildWickerBasketGeo() {
    const segU = 40; // around perimeter
    const segV = 12; // bottom to top
    const pos = [];
    const uv = [];
    const idx = [];

    for (let j = 0; j <= segV; j++) {
      const v = j / segV;
      const y = -0.115 + v * 0.235;
      // Gently flares wider toward the top
      const rx = 0.082 + v * 0.028; // front-back half-depth
      const rz = 0.122 + v * 0.036; // left-right half-width

      for (let i = 0; i <= segU; i++) {
        const u = i / segU;
        const ang = u * Math.PI * 2;
        // Superellipse rounded rectangle cross-section!
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const sx = Math.sign(ca) * Math.pow(Math.abs(ca), 0.58) * rx;
        const sz = Math.sign(sa) * Math.pow(Math.abs(sa), 0.58) * rz;

        pos.push(sx, y, sz);
        uv.push(u, v);
      }
    }
    const stride = segU + 1;
    for (let j = 0; j < segV; j++) {
      for (let i = 0; i < segU; i++) {
        const a = j * stride + i;
        const b = j * stride + (i + 1);
        const c = (j + 1) * stride + (i + 1);
        const d = (j + 1) * stride + i;
        idx.push(a, b, d, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  addMesh(basketGroup, buildWickerBasketGeo(), wickerMat);

  // Basket floor
  const floorGeo = new THREE.BoxGeometry(0.155, 0.012, 0.23);
  const floor = addMesh(basketGroup, floorGeo, wickerMat);
  floor.position.y = -0.112;

  // Thick braided wicker top rim
  const rimPts = [];
  for (let i = 0; i < 36; i++) {
    const ang = (i / 36) * Math.PI * 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    rimPts.push(new THREE.Vector3(
      Math.sign(ca) * Math.pow(Math.abs(ca), 0.58) * 0.112,
      0.122,
      Math.sign(sa) * Math.pow(Math.abs(sa), 0.58) * 0.160
    ));
  }
  const rimCurve = new THREE.CatmullRomCurve3(rimPts, true);
  addMesh(basketGroup, new THREE.TubeGeometry(rimCurve, 44, 0.012, 10, true), wickerMat);

  // Softly draped French gingham linen cloth tucked inside basket & folding naturally over the woven rim!
  const clothSegU = 18, clothSegV = 12;
  const clothPos = [];
  const clothUv = [];
  const clothIdx = [];
  for (let j = 0; j <= clothSegV; j++) {
    const v = j / clothSegV; // 0 = tucked inside basket, 0.35 = cresting over rim, 1 = soft pointed corner hanging slightly down
    for (let i = 0; i <= clothSegU; i++) {
      const u = i / clothSegU; // 0..1 around corner of basket
      const ang = -0.35 + u * 1.15; // wraps gracefully around front-camera corner!
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const rimX = Math.sign(ca) * Math.pow(Math.abs(ca), 0.58) * 0.116;
      const rimZ = Math.sign(sa) * Math.pow(Math.abs(sa), 0.58) * 0.164;

      // Soft organic triangular napkin drape (longer in middle, tapering at edges)
      const drapeEnv = Math.sin(u * Math.PI);
      const pleat = Math.sin(u * Math.PI * 5.0) * 0.006 * v;

      let cx, cy, cz;
      if (v < 0.35) {
        // Inside basket rising smoothly up to the wicker rim
        const t = v / 0.35;
        cx = rimX * (0.78 + 0.22 * t);
        cz = rimZ * (0.78 + 0.22 * t);
        cy = 0.065 + t * 0.066;
      } else {
        // Curving softly over the braided rim and draping down ~6.5cm with gentle fabric pleats
        const t = (v - 0.35) / 0.65;
        const out = 1.0 + 0.055 * Math.sin(t * Math.PI * 0.7) + pleat * 2.2;
        cx = rimX * out;
        cz = rimZ * out;
        cy = 0.131 - Math.pow(t, 1.35) * (0.032 + 0.052 * drapeEnv);
      }
      clothPos.push(cx, cy, cz);
      clothUv.push(u, v);
    }
  }
  const cStride = clothSegU + 1;
  for (let j = 0; j < clothSegV; j++) {
    for (let i = 0; i < clothSegU; i++) {
      const a = j * cStride + i;
      const b = j * cStride + (i + 1);
      const c = (j + 1) * cStride + (i + 1);
      const d = (j + 1) * cStride + i;
      clothIdx.push(a, d, b, b, d, c);
    }
  }
  const clothGeo = new THREE.BufferGeometry();
  clothGeo.setAttribute('position', new THREE.Float32BufferAttribute(clothPos, 3));
  clothGeo.setAttribute('uv', new THREE.Float32BufferAttribute(clothUv, 2));
  clothGeo.setIndex(clothIdx);
  clothGeo.computeVertexNormals();
  addMesh(basketGroup, clothGeo, ginghamMat);

  // Dynamic groceries group (subtly jostles over cobblestone bumps!)
  const groceriesGroup = new THREE.Group();
  basketGroup.add(groceriesGroup);

  // Two Crusty Golden-Brown French Baguettes with sculpted diagonal oven scores!
  function buildBaguette(length = 0.44, radius = 0.036) {
    const segU = 30;
    const segV = 16;
    const pos = [];
    const uv = [];
    const idx = [];

    for (let i = 0; i <= segU; i++) {
      const u = i / segU; // 0..1 along loaf
      const y = (u - 0.5) * length;
      // Tapered artisan baguette ends
      const env = Math.sin(Math.pow(u, 0.92) * Math.PI);
      const rBase = radius * (0.18 + 0.82 * Math.pow(env, 0.42));

      for (let j = 0; j <= segV; j++) {
        const v = j / segV;
        const ang = v * Math.PI * 2;
        // 4 diagonal scored crust ridges/indentations along top face
        const diagPhase = (u * 4.5 + v * 0.85) % 1.0;
        const onTop = smoothstep(0.15, 0.35, v) * smoothstep(0.85, 0.65, v);
        const scoreGroove = smoothstep(0.12, 0.02, Math.abs(diagPhase - 0.5)) * onTop * 0.0055;
        const earLip = smoothstep(0.14, 0.06, Math.abs(diagPhase - 0.36)) * onTop * 0.0038;
        const r = Math.max(0.004, rBase - scoreGroove + earLip);

        // Slightly oval bakery cross-section (wider than flat bottom)
        const x = Math.cos(ang) * r * 1.08;
        const z = Math.sin(ang) * r * 0.92;
        pos.push(x, y, z);
        uv.push(u, v);
      }
    }
    const stride = segV + 1;
    for (let i = 0; i < segU; i++) {
      for (let j = 0; j < segV; j++) {
        const a = i * stride + j;
        const b = (i + 1) * stride + j;
        const c = (i + 1) * stride + (j + 1);
        const d = i * stride + (j + 1);
        idx.push(a, d, b, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, baguetteMat);
  }

  const baguette1 = buildBaguette(0.46, 0.036);
  baguette1.castShadow = true;
  baguette1.receiveShadow = true;
  baguette1.position.set(-0.025, 0.145, 0.038);
  baguette1.rotation.set(0.18, 0.3, 0.34);
  groceriesGroup.add(baguette1);

  const baguette2 = buildBaguette(0.42, 0.033);
  baguette2.castShadow = true;
  baguette2.receiveShadow = true;
  baguette2.position.set(0.012, 0.125, -0.042);
  baguette2.rotation.set(-0.22, -0.4, 0.24);
  groceriesGroup.add(baguette2);

  // Fresh Leafy Green Herbs / Provence Produce Sprigs peeking out beside the baguettes
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.quadraticCurveTo(0.022, 0.028, 0, 0.068);
  leafShape.quadraticCurveTo(-0.022, 0.028, 0, 0);
  const leafGeo = new THREE.ShapeGeometry(leafShape, 6);

  const sprigConfigs = [
    { pos: [-0.055, 0.11, -0.05], rot: [0.3, 0.4, 0.6], sc: 1.15, mat: herbMat },
    { pos: [-0.070, 0.12, 0.00],  rot: [-0.2, 0.9, 0.85], sc: 1.25, mat: herbLightMat },
    { pos: [-0.045, 0.13, 0.075], rot: [0.5, -0.3, 0.55], sc: 1.05, mat: herbMat },
    { pos: [0.025,  0.11, 0.085], rot: [0.65, 0.2, -0.25], sc: 1.10, mat: herbLightMat },
    { pos: [-0.065, 0.10, 0.095], rot: [0.72, -0.6, 0.45], sc: 1.0, mat: herbMat },
    { pos: [-0.015, 0.12, -0.095], rot: [-0.65, 0.5, 0.4], sc: 1.15, mat: herbLightMat },
    { pos: [0.035,  0.12, -0.085], rot: [-0.55, -0.4, -0.35], sc: 0.95, mat: herbMat },
  ];

  for (const sc of sprigConfigs) {
    const sprig = new THREE.Group();
    sprig.position.set(...sc.pos);
    sprig.rotation.set(...sc.rot);
    for (let k = 0; k < 4; k++) {
      const l = addMesh(sprig, leafGeo, sc.mat, true, false);
      l.scale.setScalar(sc.sc * (0.75 + k * 0.1));
      l.position.set((k - 1.5) * 0.012, k * 0.018, (k % 2 ? 0.008 : -0.008));
      l.rotation.set(0.35 + k * 0.14, k * 1.1, (k - 1.5) * 0.28);
    }
    groceriesGroup.add(sprig);
  }

  // Two bright red Provence market tomatoes nestled near the rim
  const tomatoMat = new THREE.MeshPhysicalMaterial({
    color: 0xd92b24,
    roughness: 0.24,
    clearcoat: 0.75,
    clearcoatRoughness: 0.18,
  });
  const t1 = addMesh(groceriesGroup, new THREE.SphereGeometry(0.032, 14, 10), tomatoMat);
  t1.scale.set(1.08, 0.88, 1.08);
  t1.position.set(-0.052, 0.105, 0.072);
  const t2 = addMesh(groceriesGroup, new THREE.SphereGeometry(0.028, 14, 10), tomatoMat);
  t2.scale.set(1.05, 0.9, 1.05);
  t2.position.set(0.042, 0.102, 0.070);

  // =========================================================================
  // 9. GROUNDED TIRE CONTACT SHADOW OCCLUSION DECALS
  // =========================================================================
  const contactTex = createContactShadowTexture();
  const contactMat = new THREE.MeshBasicMaterial({
    map: contactTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.88,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const softUnderMat = new THREE.MeshBasicMaterial({
    map: contactTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.42,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });

  const contactGeo = new THREE.PlaneGeometry(1, 1);
  contactGeo.rotateX(-Math.PI / 2);

  // Tight dark contact patches directly beneath front & rear tire footprints
  const frontContact = new THREE.Mesh(contactGeo, contactMat);
  frontContact.scale.set(0.34, 1, 0.14);
  frontContact.position.set(BIKE_DIMS.frontAxleX, 0.004, 0);
  root.add(frontContact);

  const rearContact = new THREE.Mesh(contactGeo, contactMat);
  rearContact.scale.set(0.34, 1, 0.14);
  rearContact.position.set(BIKE_DIMS.rearAxleX, 0.004, 0);
  root.add(rearContact);

  // Broad soft ambient occlusion shadow pool beneath whole bicycle
  const broadContact = new THREE.Mesh(contactGeo, softUnderMat);
  broadContact.scale.set(1.75, 1, 0.58);
  broadContact.position.set(0.0, 0.003, 0.0);
  root.add(broadContact);

  // =========================================================================
  // 10. ANIMATION UPDATE (Exact wheel-to-road lock + chain + micro-steer + jostle)
  // =========================================================================
  const _dummy = new THREE.Object3D();
  const _pt = new THREE.Vector3();
  const _tan = new THREE.Vector3();
  const _zAxis = new THREE.Vector3(0, 0, 1);

  function update(wheelAngle, crankAngle, steerAngle, frameRoll, cobbleBounce, timePhase) {
    // Subtle frame roll synced to pedal stroke & micro-bounce from cobblestones
    frameGroup.rotation.x = frameRoll;
    frameGroup.position.y = cobbleBounce;

    // Steer pivot rotates cleanly around the slanted head tube axis
    steerPivot.quaternion.setFromAxisAngle(htAxis, steerAngle);

    // Exact tire spin locked mathematically to street travel (counter-clockwise around +Z -> moves -X!)
    frontWheel.rotation.z = wheelAngle;
    rearWheel.rotation.z = wheelAngle;

    // Crank rotation (+Z -> top pedal pushes forward toward -X)
    crankPivot.rotation.z = crankAngle;
    // Counter-rotate pedals so foot platforms remain naturally horizontal (+ tiny organic pitch)
    pedalL.rotation.z = -crankAngle + Math.sin(crankAngle) * 0.06;
    pedalR.rotation.z = -crankAngle - Math.sin(crankAngle) * 0.06;

    // Animate roller chain links seamlessly around chain path synced to crank angle
    const chainAdvance = ((crankAngle / (Math.PI * 2)) * 0.5) % 1.0;
    for (let i = 0; i < LINK_COUNT; i++) {
      const u = (i / LINK_COUNT + chainAdvance + 1.0) % 1.0;
      chainCurve.getPointAt(u, _pt);
      chainCurve.getTangentAt(u, _tan);
      _dummy.position.copy(_pt);
      _dummy.rotation.set(0, 0, Math.atan2(_tan.y, _tan.x));
      _dummy.updateMatrix();
      chainInst.setMatrixAt(i, _dummy.matrix);
    }
    chainInst.instanceMatrix.needsUpdate = true;

    // Subtle cobblestone jostle on baguettes & herbs inside basket (exact integer harmonics!)
    const jostleY = Math.sin(timePhase * 16) * 0.0028 + Math.sin(timePhase * 24 + 0.7) * 0.0018;
    const jostleR = Math.sin(timePhase * 16 + 0.4) * 0.018;
    groceriesGroup.position.y = jostleY;
    groceriesGroup.rotation.z = jostleR;
    groceriesGroup.rotation.x = Math.sin(timePhase * 8) * 0.012;

    // Update matrices so pelican IK & wing grips can read exact world positions!
    root.updateMatrixWorld(true);
  }

  function getPedalTargets(outL, outR) {
    // Foot sole sits cleanly on top of pedal platform (+0.014m above spindle center)
    outL.set(0, 0.014, 0);
    pedalL.localToWorld(outL);
    outR.set(0, 0.014, 0);
    pedalR.localToWorld(outR);
  }

  function getGripTargets(outL, outR) {
    gripAnchorL.getWorldPosition(outL);
    gripAnchorR.getWorldPosition(outR);
  }

  function getSaddleWorldPos(out) {
    out.set(BIKE_DIMS.saddleX, BIKE_DIMS.saddleY + 0.032, 0);
    frameGroup.localToWorld(out);
    return out;
  }

  return {
    root,
    update,
    getPedalTargets,
    getGripTargets,
    getSaddleWorldPos,
  };
}
