import * as THREE from 'three';
import { BLOCK_LEN, createPRNG, clamp, lerp } from './utils.js';
import {
  createCobblestoneTextures,
  createFlagstoneTextures,
  createStuccoTextures,
  createWoodTextures,
  createAwningTexture,
  createChalkboardTexture,
} from './textures.js';

/**
 * Builds the mathematically seamless looping Mediterranean/French village cobblestone street.
 * One exact block spans BLOCK_LEN (= 25.635396m = 12 exact wheel revolutions).
 * Repeated 3x (-BLOCK_LEN, 0, +BLOCK_LEN) so no edge is ever visible from any camera preset.
 */
export function createStreet() {
  const root = new THREE.Group();
  root.name = 'StreetRoot';

  // --- Shared High-Res Procedural PBR Materials ---
  const cobbleTex = createCobblestoneTextures();
  // Exact integer repeat along BLOCK_LEN (12 repeats -> ~2.136m per 1024px tile, crisp cobble scale!)
  cobbleTex.map.repeat.set(12, 3);
  cobbleTex.normalMap.repeat.set(12, 3);
  cobbleTex.roughnessMap.repeat.set(12, 3);

  const cobbleMat = new THREE.MeshStandardMaterial({
    color: 0xd9d0c3,
    map: cobbleTex.map,
    normalMap: cobbleTex.normalMap,
    normalScale: new THREE.Vector2(1.65, 1.65),
    roughnessMap: cobbleTex.roughnessMap,
    roughness: 0.84,
    metalness: 0.05,
    envMapIntensity: 0.92,
  });

  const flagTex = createFlagstoneTextures();
  flagTex.map.repeat.set(12, 1.5);
  flagTex.normalMap.repeat.set(12, 1.5);
  flagTex.roughnessMap.repeat.set(12, 1.5);

  const flagMat = new THREE.MeshStandardMaterial({
    map: flagTex.map,
    normalMap: flagTex.normalMap,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughnessMap: flagTex.roughnessMap,
    roughness: 0.92,
    metalness: 0.02,
  });

  const limestoneMat = new THREE.MeshStandardMaterial({
    color: 0xe3d6be,
    normalMap: flagTex.normalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.86,
    metalness: 0.02,
  });

  const plinthStoneMat = new THREE.MeshStandardMaterial({
    color: 0xcabca5,
    normalMap: flagTex.normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.90,
  });

  // 4 Rich Mediterranean Stucco Wall Variants (Warm Cream, Sunlit Ochre, Blush Terracotta, Butter Yellow)
  const stuccoVariants = [
    createStuccoTextures(0xf0e1c6, 911), // Warm Provençal Cream
    createStuccoTextures(0xe5c18a, 922), // Sunlit Golden Ochre
    createStuccoTextures(0xdeaa8f, 933), // Blush Terracotta
    createStuccoTextures(0xefe1b6, 944), // Warm Butter Cream
    createStuccoTextures(0xe8d0b0, 955), // Honey Limestone Stucco
  ].map((t) => new THREE.MeshStandardMaterial({
    map: t.map,
    normalMap: t.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: t.roughnessMap,
    roughness: 0.95,
    metalness: 0.0,
  }));

  // Painted Wood Materials (Turquoise-Teal Doors, Terracotta & Cobalt-Blue Shutters, Warm Bench Wood)
  const woodBenchTex = createWoodTextures(0x8c6342, 711);
  const benchWoodMat = new THREE.MeshStandardMaterial({
    map: woodBenchTex.map,
    normalMap: woodBenchTex.normalMap,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughnessMap: woodBenchTex.roughnessMap,
    roughness: 0.85,
  });

  const woodTealTex = createWoodTextures(0x4a7f82, 722);
  const doorTealMat = new THREE.MeshStandardMaterial({
    map: woodTealTex.map,
    normalMap: woodTealTex.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.62,
  });

  const woodSageTex = createWoodTextures(0x637d6b, 733);
  const doorSageMat = new THREE.MeshStandardMaterial({
    map: woodSageTex.map,
    normalMap: woodSageTex.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.64,
  });

  const shutterTerracottaMat = new THREE.MeshStandardMaterial({
    map: createWoodTextures(0xc66242, 744).map,
    normalMap: woodBenchTex.normalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.66,
  });

  const shutterCobaltMat = new THREE.MeshStandardMaterial({
    map: createWoodTextures(0x3f6896, 755).map,
    normalMap: woodBenchTex.normalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.64,
  });

  const shutterSageMat = new THREE.MeshStandardMaterial({
    map: createWoodTextures(0x5b7c6e, 766).map,
    normalMap: woodBenchTex.normalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.66,
  });

  const wroughtIronMat = new THREE.MeshStandardMaterial({
    color: 0x1e2125,
    metalness: 0.78,
    roughness: 0.42,
    envMapIntensity: 1.1,
  });

  const brassHardwareMat = new THREE.MeshStandardMaterial({
    color: 0xd9a848,
    metalness: 0.9,
    roughness: 0.22,
  });

  const darkGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0c131a,
    roughness: 0.05,
    metalness: 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    transparent: true,
    opacity: 0.80,
    envMapIntensity: 2.5,
  });

  const interiorDarkMat = new THREE.MeshStandardMaterial({
    color: 0x1a130e,
    roughness: 0.94,
  });

  const warmShelfMat = new THREE.MeshStandardMaterial({
    color: 0x5c3c22,
    roughness: 0.82,
  });

  const warmGlowLampMat = new THREE.MeshBasicMaterial({
    color: 0xffd184,
  });

  const terracottaPotMat = new THREE.MeshStandardMaterial({
    color: 0xc26342,
    normalMap: stuccoVariants[0].normalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.82,
    metalness: 0.02,
  });

  const roofTileMat = new THREE.MeshStandardMaterial({
    color: 0xb6593b,
    roughness: 0.84,
    metalness: 0.02,
  });

  const ivyLeafMat = new THREE.MeshStandardMaterial({
    color: 0x34672f,
    roughness: 0.62,
    side: THREE.DoubleSide,
  });

  const ivyLeafLightMat = new THREE.MeshStandardMaterial({
    color: 0x4c823b,
    roughness: 0.58,
    side: THREE.DoubleSide,
  });

  const geraniumRedMat = new THREE.MeshStandardMaterial({
    color: 0xd8252a,
    roughness: 0.52,
    side: THREE.DoubleSide,
  });

  const geraniumCoralMat = new THREE.MeshStandardMaterial({
    color: 0xe6413b,
    roughness: 0.54,
    side: THREE.DoubleSide,
  });

  const awningMats = [
    new THREE.MeshStandardMaterial({ map: createAwningTexture('#b64636', '#f4ead7', 10), roughness: 0.88, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ map: createAwningTexture('#3e7072', '#f3ead9', 10), roughness: 0.88, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ map: createAwningTexture('#c98c3c', '#f5ecda', 10), roughness: 0.88, side: THREE.DoubleSide }),
  ];

  const chalkboardMat = new THREE.MeshStandardMaterial({
    map: createChalkboardTexture(),
    roughness: 0.88,
  });

  const lanternGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xfff5dc,
    roughness: 0.14,
    transparent: true,
    opacity: 0.58,
    clearcoat: 1.0,
  });

  // Helper
  function addM(parent, geo, mat, cast = true, recv = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = recv;
    parent.add(m);
    return m;
  }

  // =========================================================================
  // REUSABLE ARCHITECTURAL PROP BUILDERS
  // =========================================================================

  // 1. Louvered Wooden Shutter Pair with INDIVIDUAL ANGLED SLATS (Instanced!)
  const _shDummy = new THREE.Object3D();
  function buildLouveredShutter(w, h, mat) {
    const g = new THREE.Group();
    const stileW = 0.045;
    const thick = 0.032;
    const lStile = addM(g, new THREE.BoxGeometry(stileW, h, thick), mat);
    lStile.position.x = -w * 0.5 + stileW * 0.5;
    const rStile = addM(g, new THREE.BoxGeometry(stileW, h, thick), mat);
    rStile.position.x = w * 0.5 - stileW * 0.5;
    for (const ry of [h * 0.5 - 0.04, 0, -h * 0.5 + 0.045]) {
      const rail = addM(g, new THREE.BoxGeometry(w - stileW * 2, 0.07, thick), mat);
      rail.position.y = ry;
    }
    const innerW = w - stileW * 2 + 0.004;
    const slatGeo = new THREE.BoxGeometry(innerW, 0.014, 0.034);
    const ys = [];
    const slatCount = Math.floor((h - 0.24) / 0.052);
    for (let i = 0; i < slatCount; i++) {
      const y = -h * 0.5 + 0.12 + i * 0.052;
      if (Math.abs(y) >= 0.05) ys.push(y);
    }
    const slatInst = new THREE.InstancedMesh(slatGeo, mat, ys.length);
    slatInst.castShadow = true;
    ys.forEach((y, idx) => {
      _shDummy.position.set(0, y, 0);
      _shDummy.rotation.set(0.42, 0, 0);
      _shDummy.scale.set(1, 1, 1);
      _shDummy.updateMatrix();
      slatInst.setMatrixAt(idx, _shDummy.matrix);
    });
    slatInst.instanceMatrix.needsUpdate = true;
    g.add(slatInst);

    for (const hy of [h * 0.34, -h * 0.34]) {
      const hinge = addM(g, new THREE.BoxGeometry(0.11, 0.022, 0.038), wroughtIronMat, false, false);
      hinge.position.set(-w * 0.5 + 0.05, hy, 0.004);
    }
    return g;
  }

  // 2. Scalloped Striped Café Awning with Curved Iron Brackets
  function buildScallopedAwning(width, depth, drop, mat) {
    const g = new THREE.Group();
    const slopeLen = Math.hypot(depth, drop);
    const slopeAng = Math.atan2(drop, depth);

    // Main sloped fabric canopy (slightly curved sag for authentic fabric drape!)
    const canopyGeo = new THREE.PlaneGeometry(width, slopeLen, 16, 6);
    const cp = canopyGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const cy = cp.getY(i) / slopeLen + 0.5; // 0..1
      const sag = -Math.sin(cy * Math.PI) * 0.035;
      cp.setZ(i, sag);
    }
    canopyGeo.computeVertexNormals();
    const canopy = addM(g, canopyGeo, mat, true, true);
    canopy.rotation.x = -Math.PI / 2 + slopeAng;
    canopy.position.set(0, -drop * 0.5, depth * 0.5);

    // Scalloped hanging front valance!
    const scallopCount = Math.max(6, Math.round(width / 0.22));
    const valShape = new THREE.Shape();
    valShape.moveTo(-width * 0.5, 0);
    valShape.lineTo(width * 0.5, 0);
    valShape.lineTo(width * 0.5, -0.14);
    const scW = width / scallopCount;
    for (let i = scallopCount - 1; i >= 0; i--) {
      const x1 = -width * 0.5 + (i + 1) * scW;
      const xMid = x1 - scW * 0.5;
      const x0 = x1 - scW;
      valShape.quadraticCurveTo(xMid, -0.23, x0, -0.14);
    }
    valShape.closePath();
    const valGeo = new THREE.ShapeGeometry(valShape, 6);
    // Normalize UVs so stripes line up vertically with canopy
    const uvAttr = valGeo.attributes.uv;
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(i, (uvAttr.getX(i) + width * 0.5) / width, (uvAttr.getY(i) + 0.23) / 0.23);
    }
    const valance = addM(g, valGeo, mat, true, false);
    valance.position.set(0, -drop, depth);

    // Triangular fabric side cheeks
    const sideShape = new THREE.Shape();
    sideShape.moveTo(0, 0);
    sideShape.lineTo(depth, -drop);
    sideShape.lineTo(0, -drop);
    sideShape.closePath();
    const sideGeo = new THREE.ShapeGeometry(sideShape);
    sideGeo.rotateY(-Math.PI / 2);
    for (const s of [-1, 1]) {
      const cheek = addM(g, sideGeo, mat, true, false);
      cheek.position.x = s * (width * 0.5);
      // Dark wrought iron support arm
      const arm = addM(g, new THREE.CylinderGeometry(0.012, 0.012, depth * 1.05, 6), wroughtIronMat, false, false);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(s * (width * 0.48), -drop, depth * 0.5);
    }

    return g;
  }

  // 3. Weathered Wooden Slatted Village Bench with Curved Dark Wrought-Iron Legs
  function buildVillageBench() {
    const g = new THREE.Group();
    const len = 1.52;
    // 4 contoured seat slats + 3 backrest slats
    const seatSlats = [
      { y: 0.44, z: 0.19, rx: -0.04 },
      { y: 0.43, z: 0.09, rx: -0.06 },
      { y: 0.42, z: -0.01, rx: -0.08 },
      { y: 0.41, z: -0.11, rx: -0.10 },
    ];
    for (const sl of seatSlats) {
      const m = addM(g, new THREE.BoxGeometry(len, 0.028, 0.082), benchWoodMat);
      m.position.set(0, sl.y, sl.z);
      m.rotation.x = sl.rx;
    }
    const backSlats = [
      { y: 0.56, z: -0.20, rx: -0.20 },
      { y: 0.67, z: -0.225, rx: -0.20 },
      { y: 0.78, z: -0.25, rx: -0.20 },
    ];
    for (const sl of backSlats) {
      const m = addM(g, new THREE.BoxGeometry(len, 0.085, 0.026), benchWoodMat);
      m.position.set(0, sl.y, sl.z);
      m.rotation.x = sl.rx;
    }

    // Ornate curved cast-iron end frames & armrests
    for (const sx of [-0.62, 0.62]) {
      // Front leg + sweeping armrest curve
      const frameCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx, 0.0, 0.22),
        new THREE.Vector3(sx, 0.43, 0.19),
        new THREE.Vector3(sx, 0.61, 0.16),
        new THREE.Vector3(sx, 0.60, -0.18),
        new THREE.Vector3(sx, 0.82, -0.26),
      ]);
      addM(g, new THREE.TubeGeometry(frameCurve, 22, 0.016, 8, false), wroughtIronMat);
      // Rear leg
      const rearCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx, 0.0, -0.24),
        new THREE.Vector3(sx, 0.41, -0.17),
        new THREE.Vector3(sx, 0.60, -0.20),
      ]);
      addM(g, new THREE.TubeGeometry(rearCurve, 12, 0.015, 8, false), wroughtIronMat);
      // Seat rail brace
      const brace = addM(g, new THREE.BoxGeometry(0.022, 0.026, 0.42), wroughtIronMat);
      brace.position.set(sx, 0.40, 0.01);
    }
    return g;
  }

  // 4. Aged Terracotta Planter Overflowing with Sculpted Bright Red Geraniums & Foliage (Instanced!)
  const gerLeafShape = new THREE.Shape();
  gerLeafShape.moveTo(0, 0);
  gerLeafShape.bezierCurveTo(0.044, 0.012, 0.060, 0.052, 0.026, 0.080);
  gerLeafShape.bezierCurveTo(0.010, 0.090, -0.010, 0.090, -0.026, 0.080);
  gerLeafShape.bezierCurveTo(-0.060, 0.052, -0.044, 0.012, 0, 0);
  const gerLeafGeo = new THREE.ShapeGeometry(gerLeafShape, 5);
  const petalGeo = new THREE.CircleGeometry(0.022, 6);
  const _dummy = new THREE.Object3D();

  function buildGeraniumPlanter(scale = 1.0, seed = 100) {
    const rand = createPRNG(seed);
    const g = new THREE.Group();

    const potPts = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.15, 0.0),
      new THREE.Vector2(0.17, 0.04),
      new THREE.Vector2(0.22, 0.28),
      new THREE.Vector2(0.25, 0.36),
      new THREE.Vector2(0.27, 0.39),
      new THREE.Vector2(0.27, 0.44),
      new THREE.Vector2(0.23, 0.44),
      new THREE.Vector2(0.21, 0.36),
    ];
    addM(g, new THREE.LatheGeometry(potPts, 18), terracottaPotMat);

    const soilMat = new THREE.MeshStandardMaterial({ color: 0x3b2c20, roughness: 0.96 });
    const soil = addM(g, new THREE.CylinderGeometry(0.21, 0.19, 0.04, 12), soilMat, false, true);
    soil.position.y = 0.37;

    // Instanced lush foliage mound (44 sculpted geranium leaves in 1 draw call!)
    const leafCount = 44;
    const leafInst = new THREE.InstancedMesh(gerLeafGeo, ivyLeafMat, leafCount);
    leafInst.castShadow = true;
    for (let i = 0; i < leafCount; i++) {
      const ang = rand() * Math.PI * 2;
      const rad = 0.03 + rand() * 0.25;
      const h = 0.39 + (1 - rad / 0.30) * 0.21 + (rand() - 0.5) * 0.08;
      _dummy.position.set(Math.cos(ang) * rad, h, Math.sin(ang) * rad);
      _dummy.rotation.set(0.55 + rand() * 0.65, ang + (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.5);
      _dummy.scale.setScalar(0.90 + rand() * 0.60);
      _dummy.updateMatrix();
      leafInst.setMatrixAt(i, _dummy.matrix);
    }
    leafInst.instanceMatrix.needsUpdate = true;
    g.add(leafInst);

    // Instanced overflowing bright red geranium flower clusters (12 clusters x 8 petals = 96 petals in 1 draw call!)
    const clusterCount = 12;
    const petalsPer = 8;
    const petInst = new THREE.InstancedMesh(petalGeo, geraniumRedMat, clusterCount * petalsPer);
    petInst.castShadow = true;
    let pIdx = 0;
    for (let f = 0; f < clusterCount; f++) {
      const ang = (f / clusterCount) * Math.PI * 2 + rand() * 0.45;
      const rad = f < 4 ? 0.03 + rand() * 0.08 : 0.11 + rand() * 0.16;
      const fy = 0.52 + (f < 4 ? 0.13 : 0.01) + rand() * 0.10;
      const cx = Math.cos(ang) * rad;
      const cz = Math.sin(ang) * rad;

      for (let p = 0; p < petalsPer; p++) {
        const pa = (p / petalsPer) * Math.PI * 2;
        _dummy.position.set(cx + Math.cos(pa) * 0.026, fy + (rand() - 0.5) * 0.024, cz + Math.sin(pa) * 0.026);
        _dummy.rotation.set(rand() * 2.5, rand() * 3.1, rand() * 2.5);
        _dummy.scale.setScalar(0.88 + rand() * 0.42);
        _dummy.updateMatrix();
        petInst.setMatrixAt(pIdx++, _dummy.matrix);
      }
    }
    petInst.instanceMatrix.needsUpdate = true;
    g.add(petInst);

    g.scale.setScalar(scale);
    return g;
  }

  // 5. Lush Multi-Branch Climbing Green Ivy Vines Snaking Up Stucco Walls (150 Instanced Leaves in 2 draw calls!)
  function buildClimbingIvy(startX, startY, endX, endY, zWall, seed = 200) {
    const rand = createPRNG(seed);
    const g = new THREE.Group();

    const pts = [];
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      pts.push(new THREE.Vector3(
        lerp(startX, endX, u) + Math.sin(u * Math.PI * 3.2 + seed) * 0.26,
        lerp(startY, endY, u),
        zWall + 0.03 + Math.sin(u * Math.PI * 2) * 0.025
      ));
    }
    const vineCurve = new THREE.CatmullRomCurve3(pts);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x3b542c, roughness: 0.85 });
    addM(g, new THREE.TubeGeometry(vineCurve, 22, 0.015, 6, false), stemMat, true, false);

    // Secondary trailing branch arching near cornice/awning
    const branchPts = [
      vineCurve.getPointAt(0.45),
      vineCurve.getPointAt(0.62).add(new THREE.Vector3((endX > startX ? 1 : -1) * 0.35, 0.15, 0.02)),
      vineCurve.getPointAt(0.78).add(new THREE.Vector3((endX > startX ? 1 : -1) * 0.65, 0.05, 0.03)),
    ];
    const branchCurve = new THREE.CatmullRomCurve3(branchPts);
    addM(g, new THREE.TubeGeometry(branchCurve, 12, 0.011, 5, false), stemMat, false, false);

    // 144 lush overlapping ivy leaves split between dark & sunlit-olive InstancedMesh!
    const darkCount = 96;
    const lightCount = 48;
    const darkInst = new THREE.InstancedMesh(gerLeafGeo, ivyLeafMat, darkCount);
    const lightInst = new THREE.InstancedMesh(gerLeafGeo, ivyLeafLightMat, lightCount);
    darkInst.castShadow = true;
    lightInst.castShadow = true;

    const p = new THREE.Vector3();
    function fillLeaves(inst, count) {
      for (let i = 0; i < count; i++) {
        const useBranch = rand() < 0.28;
        const u = rand();
        (useBranch ? branchCurve : vineCurve).getPointAt(u, p);
        const spread = 0.16 + Math.sin(u * Math.PI) * 0.26;
        _dummy.position.set(
          p.x + (rand() - 0.5) * spread * 2.1,
          p.y + (rand() - 0.5) * 0.24,
          zWall + 0.032 + rand() * 0.095
        );
        _dummy.rotation.set(0.25 + (rand() - 0.5) * 0.9, (rand() - 0.5) * 1.3, (rand() - 0.5) * 1.2);
        _dummy.scale.setScalar(0.95 + rand() * 0.78);
        _dummy.updateMatrix();
        inst.setMatrixAt(i, _dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
    }
    fillLeaves(darkInst, darkCount);
    fillLeaves(lightInst, lightCount);
    g.add(darkInst);
    g.add(lightInst);
    return g;
  }

  // 6. Slender Ornate Tall Dark Wrought-Iron Foreground Streetlamp (sized for creamy 80mm f/1.8 bokeh!)
  function buildStreetLamp() {
    const g = new THREE.Group();
    const basePts = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.088, 0.0),
      new THREE.Vector2(0.084, 0.10),
      new THREE.Vector2(0.064, 0.18),
      new THREE.Vector2(0.052, 0.62),
      new THREE.Vector2(0.058, 0.68),
      new THREE.Vector2(0.036, 0.78),
      new THREE.Vector2(0.028, 2.88),
      new THREE.Vector2(0.052, 2.96),
      new THREE.Vector2(0.034, 3.04),
    ];
    addM(g, new THREE.LatheGeometry(basePts, 10), wroughtIronMat, false, false);

    const cross = addM(g, new THREE.CylinderGeometry(0.010, 0.010, 0.38, 6), wroughtIronMat, false, false);
    cross.rotation.z = Math.PI / 2;
    cross.position.y = 2.74;

    const lantern = addM(g, new THREE.CylinderGeometry(0.135, 0.085, 0.36, 6), lanternGlassMat, false, false);
    lantern.position.y = 3.22;
    const cap = addM(g, new THREE.ConeGeometry(0.16, 0.16, 6), wroughtIronMat, false, false);
    cap.position.y = 3.48;
    const finial = addM(g, new THREE.SphereGeometry(0.024, 8, 6), wroughtIronMat, false, false);
    finial.position.y = 3.58;
    return g;
  }

  // =========================================================================
  // BUILD ONE COMPLETE SEAMLESS STREET BLOCK (Exact length === BLOCK_LEN)
  // =========================================================================
  function buildStreetBlock() {
    const block = new THREE.Group();

    // --- 1. Slightly Crowned European Cobblestone Roadway (z = -1.65 .. +3.55) ---
    const roadW = 5.4;
    const roadGeo = new THREE.PlaneGeometry(BLOCK_LEN, roadW, 24, 14);
    roadGeo.rotateX(-Math.PI / 2);
    const rp = roadGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const z = rp.getZ(i);
      const crown = -0.022 * Math.pow(z / (roadW * 0.5), 2);
      rp.setY(i, crown);
    }
    roadGeo.computeVertexNormals();
    const road = addM(block, roadGeo, cobbleMat, false, true);
    road.position.set(0, 0.0, 0.95);

    // --- 2. Raised Pale Limestone Sidewalk Curb & Weathered Flagstone Walkway ---
    const curbZ = -1.68;
    const curbH = 0.14;
    const curbCount = 24;
    const curbSegLen = BLOCK_LEN / curbCount;
    const curbBlockGeo = new THREE.BoxGeometry(curbSegLen - 0.012, curbH, 0.22);
    const curbInst = new THREE.InstancedMesh(curbBlockGeo, limestoneMat, curbCount);
    curbInst.castShadow = true;
    curbInst.receiveShadow = true;
    for (let i = 0; i < curbCount; i++) {
      const cx = -BLOCK_LEN * 0.5 + (i + 0.5) * curbSegLen;
      _dummy.position.set(cx, curbH * 0.5 - 0.01, curbZ);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      curbInst.setMatrixAt(i, _dummy.matrix);
    }
    curbInst.instanceMatrix.needsUpdate = true;
    block.add(curbInst);

    const walkW = 2.20;
    const walkGeo = new THREE.PlaneGeometry(BLOCK_LEN, walkW, 4, 2);
    walkGeo.rotateX(-Math.PI / 2);
    const walk = addM(block, walkGeo, flagMat, false, true);
    walk.position.set(0, curbH - 0.005, curbZ - walkW * 0.5 - 0.08);

    // --- 3. 5 VARIED DEEP MULTI-BAY PROVENÇAL VILLAGE STOREFRONTS ---
    const facadeSpecs = [
      {
        frac: 0.205, height: 6.4, zOff: 0.00, stuccoIdx: 0, doorMat: doorTealMat,
        shutterMat: shutterTerracottaMat, awningIdx: 0, hasBench: true, hasChalk: false,
        ivySide: 1, name: 'Boulangerie',
      },
      {
        frac: 0.195, height: 5.9, zOff: -0.14, stuccoIdx: 1, doorMat: doorSageMat,
        shutterMat: shutterCobaltMat, awningIdx: 1, hasBench: false, hasChalk: true,
        ivySide: -1, name: 'Cafe',
      },
      {
        frac: 0.210, height: 6.8, zOff: 0.06, stuccoIdx: 2, doorMat: doorTealMat,
        shutterMat: shutterCobaltMat, awningIdx: 2, hasBench: true, hasChalk: false,
        ivySide: 1, name: 'Patisserie',
      },
      {
        frac: 0.190, height: 6.1, zOff: -0.10, stuccoIdx: 3, doorMat: doorTealMat,
        shutterMat: shutterTerracottaMat, awningIdx: 0, hasBench: false, hasChalk: false,
        ivySide: -1, name: 'Fleuriste',
      },
      {
        frac: 0.200, height: 6.5, zOff: 0.02, stuccoIdx: 4, doorMat: doorSageMat,
        shutterMat: shutterSageMat, awningIdx: 1, hasBench: true, hasChalk: false,
        ivySide: 1, name: 'Epicerie',
      },
    ];

    let cursorX = -BLOCK_LEN * 0.5;
    facadeSpecs.forEach((spec, fIdx) => {
      const w = spec.frac * BLOCK_LEN;
      const cx = cursorX + w * 0.5;
      cursorX += w;

      const zFront = -3.62 + spec.zOff;
      const bGroup = new THREE.Group();
      bGroup.position.set(cx, curbH - 0.01, zFront);
      block.add(bGroup);

      const stuccoMat = stuccoVariants[spec.stuccoIdx];

      const wallDepth = 1.6;
      const doorW = 1.18;
      const doorH = 2.42;
      const winW = 1.85;
      const winH = 1.68;
      const winBottom = 0.72;
      const doorX = -w * 0.26;
      const winX = w * 0.17;
      const recessD = 0.30;

      const backWall = addM(bGroup, new THREE.BoxGeometry(w, spec.height, wallDepth), stuccoMat, true, true);
      backWall.position.set(0, spec.height * 0.5, -recessD - wallDepth * 0.5);

      const frontThick = recessD;
      const upperH = spec.height - 2.55;
      const upperWall = addM(bGroup, new THREE.BoxGeometry(w, upperH, frontThick), stuccoMat, true, true);
      upperWall.position.set(0, 2.55 + upperH * 0.5, -frontThick * 0.5);

      const leftEdge = -w * 0.5;
      const doorL = doorX - doorW * 0.5;
      const doorR = doorX + doorW * 0.5;
      const winL = winX - winW * 0.5;
      const winR = winX + winW * 0.5;
      const rightEdge = w * 0.5;

      function addFrontBand(x0, x1, y0, y1) {
        const bw = x1 - x0;
        const bh = y1 - y0;
        if (bw <= 0.02 || bh <= 0.02) return;
        const m = addM(bGroup, new THREE.BoxGeometry(bw, bh, frontThick), stuccoMat, true, true);
        m.position.set((x0 + x1) * 0.5, (y0 + y1) * 0.5, -frontThick * 0.5);
      }

      addFrontBand(leftEdge, doorL, 0, 2.55);
      addFrontBand(doorR, winL, 0, 2.55);
      addFrontBand(winR, rightEdge, 0, 2.55);
      addFrontBand(doorL, doorR, doorH, 2.55);
      addFrontBand(winL, winR, 0, winBottom);
      addFrontBand(winL, winR, winBottom + winH, 2.55);

      const plinth = addM(bGroup, new THREE.BoxGeometry(w + 0.02, 0.34, 0.06), plinthStoneMat, false, true);
      plinth.position.set(0, 0.17, 0.01);
      const step = addM(bGroup, new THREE.BoxGeometry(doorW + 0.18, 0.12, 0.32), limestoneMat, true, true);
      step.position.set(doorX, 0.06, 0.14);

      const beltCourse = addM(bGroup, new THREE.BoxGeometry(w + 0.04, 0.14, 0.12), limestoneMat, true, true);
      beltCourse.position.set(0, 3.05, 0.04);

      // Roof cornice & Instanced Provençal Terracotta Barrel-Tile Eaves!
      const eave = addM(bGroup, new THREE.BoxGeometry(w + 0.06, 0.18, 0.42), limestoneMat, true, true);
      eave.position.set(0, spec.height - 0.08, 0.18);
      const tileCount = Math.floor(w / 0.24);
      const tileGeo = new THREE.CylinderGeometry(0.085, 0.095, 0.58, 7, 1, false, 0, Math.PI);
      tileGeo.rotateX(Math.PI * 0.44);
      const tileInst = new THREE.InstancedMesh(tileGeo, roofTileMat, tileCount);
      tileInst.castShadow = true;
      for (let t = 0; t < tileCount; t++) {
        _dummy.position.set(-w * 0.5 + (t + 0.5) * (w / tileCount), spec.height + 0.06, 0.24);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        tileInst.setMatrixAt(t, _dummy.matrix);
      }
      tileInst.instanceMatrix.needsUpdate = true;
      bGroup.add(tileInst);

      // --- TALL RECESSED MUTED TURQUOISE-TEAL / SAGE PANELED SHOP DOOR ---
      const doorG = new THREE.Group();
      doorG.position.set(doorX, 0, -recessD + 0.04);
      bGroup.add(doorG);

      const dLintel = addM(bGroup, new THREE.BoxGeometry(doorW + 0.24, 0.16, 0.10), limestoneMat, true, true);
      dLintel.position.set(doorX, doorH + 0.07, 0.03);
      const doorSlab = addM(doorG, new THREE.BoxGeometry(doorW - 0.06, doorH - 0.04, 0.06), spec.doorMat, true, true);
      doorSlab.position.y = doorH * 0.5;
      // Carved raised molding panels with crisp inner shadow frames
      for (const py of [0.56, 1.48]) {
        for (const px of [-0.26, 0.26]) {
          const panel = addM(doorG, new THREE.BoxGeometry(0.38, 0.66, 0.085), spec.doorMat, false, true);
          panel.position.set(px, py, 0.018);
        }
      }
      const transom = addM(doorG, new THREE.BoxGeometry(doorW - 0.16, 0.34, 0.07), darkGlassMat, false, false);
      transom.position.set(0, doorH - 0.26, 0.01);
      const knob = addM(doorG, new THREE.SphereGeometry(0.034, 10, 8), brassHardwareMat, false, false);
      knob.position.set(0.42, 1.05, 0.065);

      // --- RECESSED DARK-GLASS CAFÉ / SHOP WINDOW WITH DEEP 3D INTERIOR ---
      const winG = new THREE.Group();
      winG.position.set(winX, winBottom + winH * 0.5, -recessD);
      bGroup.add(winG);

      const wSill = addM(bGroup, new THREE.BoxGeometry(winW + 0.22, 0.10, 0.22), limestoneMat, true, true);
      wSill.position.set(winX, winBottom - 0.04, 0.06);
      const wLintel = addM(bGroup, new THREE.BoxGeometry(winW + 0.22, 0.14, 0.10), limestoneMat, true, true);
      wLintel.position.set(winX, winBottom + winH + 0.06, 0.03);

      // Rich deep-shadow interior room box behind reflective café window glass
      const intBack = addM(winG, new THREE.BoxGeometry(winW - 0.04, winH - 0.04, 0.04), interiorDarkMat, false, false);
      intBack.position.z = -0.45;
      for (const sy of [-0.36, 0.12]) {
        const shelf = addM(winG, new THREE.BoxGeometry(winW - 0.16, 0.04, 0.32), warmShelfMat, false, false);
        shelf.position.set(0, sy, -0.24);
        for (let b = -2; b <= 2; b++) {
          const item = addM(winG, new THREE.CylinderGeometry(0.065, 0.075, 0.14, 8), terracottaPotMat, false, false);
          item.position.set(b * 0.28, sy + 0.09, -0.24);
        }
      }
      const pend = addM(winG, new THREE.SphereGeometry(0.085, 10, 8), warmGlowLampMat, false, false);
      pend.position.set(0, 0.48, -0.20);

      const glassPane = addM(winG, new THREE.PlaneGeometry(winW - 0.06, winH - 0.06), darkGlassMat, false, false);
      glassPane.position.z = 0.03;
      const mMat = spec.doorMat;
      for (const mx of [-winW * 0.48, 0, winW * 0.48]) {
        const mull = addM(winG, new THREE.BoxGeometry(0.055, winH, 0.08), mMat, true, false);
        mull.position.set(mx, 0, 0.04);
      }
      for (const my of [-winH * 0.48, 0.22, winH * 0.48]) {
        const mull = addM(winG, new THREE.BoxGeometry(winW, 0.055, 0.08), mMat, true, false);
        mull.position.set(0, my, 0.04);
      }

      // --- SCALLOPED STRIPED CAFÉ AWNING OVER SHOP WINDOW ---
      const awning = buildScallopedAwning(winW + 0.46, 0.92, 0.48, awningMats[spec.awningIdx]);
      awning.position.set(winX, winBottom + winH + 0.36, 0.02);
      bGroup.add(awning);

      // --- UPPER-STORY WINDOWS WITH SLATTED LOUVERED SHUTTERS & IRON BALCONIES ---
      for (const uwX of [-w * 0.24, w * 0.24]) {
        const uwY = 4.32;
        const uwW = 1.02;
        const uwH = 1.48;

        const uFrame = addM(bGroup, new THREE.BoxGeometry(uwW + 0.14, uwH + 0.14, 0.09), limestoneMat, true, true);
        uFrame.position.set(uwX, uwY, 0.01);
        const uGlass = addM(bGroup, new THREE.BoxGeometry(uwW - 0.06, uwH - 0.06, 0.06), darkGlassMat, false, false);
        uGlass.position.set(uwX, uwY, 0.035);
        const vBar = addM(bGroup, new THREE.BoxGeometry(0.04, uwH - 0.08, 0.08), limestoneMat, false, false);
        vBar.position.set(uwX, uwY, 0.05);
        const hBar = addM(bGroup, new THREE.BoxGeometry(uwW - 0.08, 0.04, 0.08), limestoneMat, false, false);
        hBar.position.set(uwX, uwY + 0.12, 0.05);

        const shW = uwW * 0.50;
        const shL = buildLouveredShutter(shW, uwH, spec.shutterMat);
        shL.position.set(uwX - uwW * 0.5 - shW * 0.48, uwY, 0.075);
        shL.rotation.y = 0.18;
        bGroup.add(shL);

        const shR = buildLouveredShutter(shW, uwH, spec.shutterMat);
        shR.position.set(uwX + uwW * 0.5 + shW * 0.48, uwY, 0.075);
        shR.rotation.y = -0.14;
        bGroup.add(shR);

        const railY = uwY - uwH * 0.5 + 0.34;
        const topBar = addM(bGroup, new THREE.BoxGeometry(uwW + 0.24, 0.028, 0.028), wroughtIronMat, true, false);
        topBar.position.set(uwX, railY, 0.22);
        const botBar = addM(bGroup, new THREE.BoxGeometry(uwW + 0.24, 0.024, 0.024), wroughtIronMat, false, false);
        botBar.position.set(uwX, railY - 0.34, 0.22);
        for (let b = -4; b <= 4; b++) {
          const bal = addM(bGroup, new THREE.CylinderGeometry(0.008, 0.008, 0.36, 5), wroughtIronMat, false, false);
          bal.position.set(uwX + b * 0.13, railY - 0.17, 0.22);
        }
        const wPot = buildGeraniumPlanter(0.52, 500 + fIdx * 17 + (uwX > 0 ? 5 : 0));
        wPot.position.set(uwX, uwY - uwH * 0.5 - 0.02, 0.12);
        bGroup.add(wPot);
      }

      // --- LUSH CLIMBING GREEN IVY VINES SNAKING UP STUCCO PILASTERS ---
      const ivyX = spec.ivySide * (w * 0.44);
      bGroup.add(buildClimbingIvy(ivyX, 0.12, ivyX - spec.ivySide * 0.35, 3.85, 0.01, 300 + fIdx * 29));

      // --- SIDEWALK STREET FURNITURE: BENCHES, TERRACOTTA GERANIUM PLANTERS, CHALKBOARD ---
      if (spec.hasBench) {
        const bench = buildVillageBench();
        bench.position.set(winX + 0.08, 0, 0.88);
        bGroup.add(bench);
      }

      const pot1 = buildGeraniumPlanter(1.08, 100 + fIdx * 23);
      pot1.position.set(doorX - doorW * 0.5 - 0.36, 0, 0.55);
      bGroup.add(pot1);

      const pot2 = buildGeraniumPlanter(0.88, 200 + fIdx * 31);
      pot2.position.set(doorX + doorW * 0.5 + 0.32, 0, 0.48);
      bGroup.add(pot2);

      if (spec.hasChalk) {
        const aFrame = new THREE.Group();
        aFrame.position.set(winX - 0.45, 0, 1.05);
        aFrame.rotation.y = 0.28;
        const board1 = addM(aFrame, new THREE.BoxGeometry(0.58, 0.88, 0.03), benchWoodMat);
        board1.position.set(0, 0.44, 0.12);
        board1.rotation.x = -0.18;
        const face = addM(aFrame, new THREE.PlaneGeometry(0.50, 0.78), chalkboardMat, false, false);
        face.position.set(0, 0.44, 0.14);
        face.rotation.x = -0.18;
        const board2 = addM(aFrame, new THREE.BoxGeometry(0.58, 0.88, 0.03), benchWoodMat);
        board2.position.set(0, 0.44, -0.12);
        board2.rotation.x = 0.18;
        bGroup.add(aFrame);
      }

      const wallLamp = new THREE.Group();
      wallLamp.position.set(doorX + doorW * 0.5 + 0.24, 2.38, 0.22);
      const bracket = addM(wallLamp, new THREE.BoxGeometry(0.03, 0.03, 0.28), wroughtIronMat, false, false);
      bracket.position.z = -0.10;
      const wLantern = addM(wallLamp, new THREE.CylinderGeometry(0.09, 0.06, 0.24, 6), lanternGlassMat, false, false);
      wLantern.position.y = -0.12;
      const wCap = addM(wallLamp, new THREE.ConeGeometry(0.11, 0.10, 6), wroughtIronMat, false, false);
      wCap.position.y = 0.04;
      bGroup.add(wallLamp);
    });

    // --- 4. FOREGROUND DEPTH PARALLAX: 3 SLENDER TALL WROUGHT-IRON STREETLAMPS ---
    // Spaced at exact BLOCK_LEN / 3 along z = +3.35 so they sweep dramatically out-of-focus across the lens!
    const LAMP_COUNT = 3;
    const lampSpacing = BLOCK_LEN / LAMP_COUNT;
    const lampOffset = -3.80;
    for (let i = 0; i < LAMP_COUNT; i++) {
      let lx = -BLOCK_LEN * 0.5 + (i + 0.5) * lampSpacing + lampOffset;
      if (lx < -BLOCK_LEN * 0.5) lx += BLOCK_LEN;
      if (lx > BLOCK_LEN * 0.5) lx -= BLOCK_LEN;
      const lamp = buildStreetLamp();
      lamp.position.set(lx, -0.02, 3.35);
      block.add(lamp);
    }

    return block;
  }

  // Static same-material mesh merger per storefront (collapses ~45 static meshes per building -> ~8 draw calls with 100% identical visuals!)
  function optimizeStaticGroup(group) {
    group.updateMatrixWorld(true);
    const invRoot = group.matrixWorld.clone().invert();
    const buckets = new Map();
    const toRemove = [];

    group.traverse((obj) => {
      if (!obj.isMesh || obj.isInstancedMesh) return;
      const geo = obj.geometry;
      if (!geo || !geo.attributes || !geo.attributes.position) return;
      const mat = obj.material;
      if (Array.isArray(mat)) return;

      const key = `${mat.uuid}|${obj.castShadow ? 1 : 0}|${obj.receiveShadow ? 1 : 0}`;
      if (!buckets.has(key)) {
        buckets.set(key, { mat, cast: obj.castShadow, recv: obj.receiveShadow, geos: [] });
      }
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      const relMat = invRoot.clone().multiply(obj.matrixWorld);
      g.applyMatrix4(relMat);
      // Ensure uniform attributes (position, normal, uv) so buffers merge seamlessly
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) {
        const cnt = g.attributes.position.count;
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cnt * 2), 2));
      }
      // Remove any extra unmatched attributes
      for (const attrName of Object.keys(g.attributes)) {
        if (attrName !== 'position' && attrName !== 'normal' && attrName !== 'uv') {
          g.deleteAttribute(attrName);
        }
      }
      buckets.get(key).geos.push(g);
      toRemove.push(obj);
    });

    for (const obj of toRemove) {
      if (obj.parent) obj.parent.remove(obj);
    }

    for (const { mat, cast, recv, geos } of buckets.values()) {
      if (geos.length === 0) continue;
      let totalVerts = 0;
      for (const g of geos) totalVerts += g.attributes.position.count;
      const posArr = new Float32Array(totalVerts * 3);
      const normArr = new Float32Array(totalVerts * 3);
      const uvArr = new Float32Array(totalVerts * 2);
      let vOff = 0;
      for (const g of geos) {
        const cnt = g.attributes.position.count;
        posArr.set(g.attributes.position.array, vOff * 3);
        normArr.set(g.attributes.normal.array, vOff * 3);
        uvArr.set(g.attributes.uv.array, vOff * 2);
        vOff += cnt;
        g.dispose();
      }
      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      merged.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
      merged.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
      merged.computeBoundingSphere();
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = cast;
      m.receiveShadow = recv;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      group.add(m);
    }

    // Freeze remaining static InstancedMesh matrices
    group.traverse((obj) => {
      if (obj !== group) {
        obj.updateMatrix();
        obj.matrixAutoUpdate = false;
      }
    });
  }

  // Instantiate 3 identical seamless blocks at -BLOCK_LEN, 0, +BLOCK_LEN
  const protoBlock = buildStreetBlock();
  // Merge static geometry inside each storefront of the prototype block BEFORE cloning (massive GPU & mobile win!)
  protoBlock.children.forEach((ch) => {
    if (ch.isGroup && ch.position.z < -3.0) {
      optimizeStaticGroup(ch);
    }
  });

  const blocks = [];
  const cullableBuildings = [];
  for (let b = -1; b <= 1; b++) {
    const inst = b === 0 ? protoBlock : protoBlock.clone(true);
    inst.position.x = b * BLOCK_LEN;
    inst.updateMatrix();
    root.add(inst);
    blocks.push(inst);
    inst.children.forEach((ch) => {
      if (ch.isGroup && ch.position.z < -3.0) {
        cullableBuildings.push({ blockIdx: b + 1, group: ch, localX: ch.position.x });
      }
    });
  }

  // Exact seamless scrolling: bicycle rides right-to-left (-X), so street scrolls +X!
  // At t = 12.0s, distance === BLOCK_LEN -> offset wraps seamlessly to 0.0!
  function update(distanceTraveled) {
    const shift = ((distanceTraveled % BLOCK_LEN) + BLOCK_LEN) % BLOCK_LEN;
    for (let i = 0; i < 3; i++) {
      blocks[i].position.x = (i - 1) * BLOCK_LEN + shift;
    }
    // Cull storefronts far outside both telephoto/wide camera view and shadow frustum (zero visual impact!)
    for (let k = 0; k < cullableBuildings.length; k++) {
      const cb = cullableBuildings[k];
      const worldX = blocks[cb.blockIdx].position.x + cb.localX;
      cb.group.visible = Math.abs(worldX) < 13.5;
    }
  }

  return {
    root,
    update,
  };
}
